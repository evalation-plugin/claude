"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } = require("node:fs");
const { pluginHome } = require("./home.js");
const { unanswered } = require("./answer.js");
const { join, resolve } = require("node:path");
const { checkoutKind, checkoutsIn, skipped } = require("./tree.js");

const HOME = pluginHome();

function real(root) {
  try {
    return realpathSync(resolve(root));
  } catch (thrown) {
    if (thrown.code === "ENOENT") return resolve(root);
    throw thrown;
  }
}

function savedAt(root) {
  return join(HOME, "solutions", `${createHash("sha256").update(real(root)).digest("hex").slice(0, 24)}.json`);
}

function saved(root) {
  let text;
  try {
    text = readFileSync(savedAt(root), "utf8");
  } catch (thrown) {
    if (thrown.code === "ENOENT") return null;
    throw thrown;
  }
  return JSON.parse(text);
}

function choose(root, { name, leave = [] }) {
  mkdirSync(join(HOME, "solutions"), { recursive: true });
  writeFileSync(savedAt(root), JSON.stringify({ root: real(root), name: String(name ?? "").trim() || null, leave: [...new Set(leave)].sort() }, null, 2) + "\n");
}

function quietly(dir, args) {
  try {
    return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    // empty-catch:allow: git exits non-zero where there is no origin, no branch or no commit, and each is an answer of none.
    return "";
  }
}

function facts(dir, vcs) {
  if (vcs !== "git") return { branch: null, main: null, on_main: null, head: null, newest: null };
  const origin = quietly(dir, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  const main = origin ? origin.replace(/^origin\//, "")
    : ["main", "master"].find((one) => quietly(dir, ["rev-parse", "--verify", "--quiet", `refs/heads/${one}`])) ?? null;
  const branch = quietly(dir, ["symbolic-ref", "--short", "--quiet", "HEAD"]) || null;
  return {
    branch,
    main,
    on_main: main ? branch === main : null,
    head: quietly(dir, ["rev-parse", "HEAD"]) || null,
    newest: quietly(dir, ["log", "-1", "--format=%cI"]) || null,
  };
}

function ranked(a, b) {
  if (a.on_main !== b.on_main) return a.on_main ? -1 : 1;
  if ((a.newest ?? "") !== (b.newest ?? "")) return (b.newest ?? "").localeCompare(a.newest ?? "");
  return a.folder.localeCompare(b.folder);
}

function entries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch (thrown) {
    if (thrown.code === "ENOENT" || thrown.code === "ENOTDIR") return [];
    throw thrown;
  }
}

function solutionOf(root, { asChosen = true } = {}) {
  const at = resolve(root);
  const groups = checkoutsIn(at);
  if (!groups || groups.length === 0) return null;
  const repositories = [];
  const left_out = [];
  for (const group of groups) {
    const clones = group.places.filter((one) => !one.copy_of)
      .map((one) => ({ folder: one.path, repository: group.repository, vcs: one.vcs, ...facts(join(at, one.path), one.vcs) }))
      .sort(ranked);
    const [chosen, ...others] = clones;
    repositories.push(chosen);
    for (const one of others) left_out.push({ folder: one.folder, why: `a second clone of ${group.repository}, and the folder "${chosen.folder}" is read in its place` });
    for (const one of group.places.filter((place) => place.copy_of)) {
      left_out.push({ folder: one.path, why: `a copy of the folder "${one.copy_of}" with no version control` });
    }
  }
  const taken = [...repositories, ...left_out].map((one) => one.folder);
  const covers = (name) => taken.some((one) => one === name || one.startsWith(`${name}/`));
  for (const entry of entries(at)) {
    if (!entry.isDirectory() || skipped(entry.name) || entry.name.startsWith(".") || covers(entry.name)) continue;
    if (checkoutKind(join(at, entry.name))) continue;
    if (entries(join(at, entry.name)).length > 0) {
      repositories.push({ folder: entry.name, repository: entry.name, vcs: null, ...facts(null, null) });
    }
  }
  const kept = saved(at);
  const leave = new Set(asChosen ? (kept?.leave ?? []).filter((one) => !unanswered(one)) : []);
  return {
    name: unanswered(kept?.name) ? null : kept.name,
    root: at,
    repositories: repositories.filter((one) => !leave.has(one.folder))
      .sort((a, b) => a.repository.localeCompare(b.repository) || a.folder.localeCompare(b.folder)),
    left_out: [...left_out, ...repositories.filter((one) => leave.has(one.folder)).map((one) => ({ folder: one.folder, why: "not chosen for this review" }))]
      .sort((a, b) => a.folder.localeCompare(b.folder)),
  };
}

function placeOf(target, path) {
  const text = String(path ?? "");
  if (target?.kind !== "solution") return { repository: null, path: text };
  const held = [...(target.repositories ?? [])].sort((a, b) => b.folder.length - a.folder.length)
    .find((one) => text === one.folder || text.startsWith(`${one.folder}/`));
  return held ? { repository: held.repository, path: text.slice(held.folder.length + 1) } : { repository: null, path: text };
}

function shownPath(target, path) {
  const place = placeOf(target, path);
  return place.repository ? `${place.repository} · ${place.path}` : place.path;
}

function about(one) {
  const { dated } = require("./changes.js");
  return [
    one.folder === one.repository ? null : `folder ${one.folder}`,
    one.vcs === "git" ? (one.branch ? `branch ${one.branch}` : "no branch checked out") : "no version control",
    one.head ? `commit ${one.head.slice(0, 7)}` : null,
    one.newest ? `last changed ${dated(one.newest.slice(0, 10))}` : null,
  ].filter(Boolean);
}

function readBlock(target) {
  if (target?.kind !== "solution") return "";
  const { escaped } = require("./sheet.js");
  const held = (target.repositories ?? []).filter((one) => one.vcs === "git");
  const plain = (target.repositories ?? []).filter((one) => one.vcs !== "git");
  const bullet = (name, parts) => `<li><b>${escaped(name)}</b>${parts.map((part) => ` · ${escaped(part)}`).join("")}</li>`;
  const left = target.left_out ?? [];
  const { line } = require("./run-say.js");
  return `<div class="block">
<h2>${escaped(line("report.repos-title"))}</h2>
<p class="intro">${escaped(line("report.repos-intro", { count: String(held.length), name: target.name || target.repository || "this product" }))}</p>
<ul class="repos">${held.map((one) => bullet(one.repository, about(one))).join("")}</ul>
${plain.length === 0 ? "" : `<p class="lede">${escaped(line("report.repos-other"))}</p>
<ul class="repos">${plain.map((one) => bullet(one.folder, [])).join("")}</ul>`}
${left.length === 0 ? "" : `<p class="lede">${escaped(line("report.repos-left"))}</p>
<ul class="repos">${left.map((one) => bullet(one.folder, [one.why])).join("")}</ul>`}
</div>`;
}

function readSlides(target) {
  if (target?.kind !== "solution") return [];
  const { line } = require("./run-say.js");
  const all = target.repositories ?? [];
  const groups = [
    { title: "Repositories read", label: "REPOSITORIES", blocks: all.filter((one) => one.vcs === "git").map((one) => {
      const said = about(one).join(" · ");
      return { headline: one.repository, body: `${said.charAt(0).toUpperCase()}${said.slice(1)}.` };
    }) },
    { title: line("report.slide-other-title"), label: "OTHER FOLDERS", blocks: all.filter((one) => one.vcs !== "git")
      .map((one) => ({ headline: one.folder, body: line("report.slide-folder") })) },
    { title: "Folders left out", label: "LEFT OUT", blocks: (target.left_out ?? []).map((one) => ({ headline: one.folder, body: line("report.slide-left", { why: one.why }) })) },
  ];
  const pages = [];
  for (const group of groups) {
    for (let at = 0; at < group.blocks.length; at += 5) {
      pages.push({ title: group.title, continued: at > 0, label: group.label, blocks: group.blocks.slice(at, at + 5) });
    }
  }
  return pages;
}

module.exports = { choose, placeOf, readBlock, readSlides, saved, shownPath, solutionOf };
