"use strict";

const { execFileSync } = require("node:child_process");
const { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join, relative, resolve, sep } = require("node:path");

const MARKS = [
  [".git", "git"], [".hg", "Mercurial"], [".svn", "Subversion"], [".jj", "Jujutsu"], [".sl", "Sapling"],
  [".bzr", "Bazaar"], ["_darcs", "Darcs"], [".fslckout", "Fossil"], ["_FOSSIL_", "Fossil"],
];

const SKIP = new Set([
  ...MARKS.map(([name]) => name), "node_modules", "vendor", "target", "dist", "build", "out", ".next",
  ".nuxt", "__pycache__", ".venv", "venv", ".tox", "coverage", ".cache", ".terraform", "Pods",
]);

const skipped = (name) => SKIP.has(name) || name.startsWith(".venv");

const kindAt = (path) => {
  try {
    const held = lstatSync(path);
    return held.isDirectory() ? "folder" : held.isFile() ? "file" : null;
  } catch (thrown) {
    if (thrown.code === "ENOENT" || thrown.code === "ENOTDIR") return null;
    throw thrown;
  }
};

function checkoutKind(dir) {
  if (kindAt(join(dir, ".git")) === "file") return { vcs: "git", linked: true };
  if (kindAt(join(dir, ".git")) === "folder") return { vcs: "git" };
  if (kindAt(join(dir, ".jj", "repo")) === "file") return { vcs: "Jujutsu", linked: true };
  if (kindAt(join(dir, ".hg", "sharedpath")) === "file") return { vcs: "Mercurial", linked: true };
  for (const [name, vcs] of MARKS.slice(1)) {
    if (existsSync(join(dir, name))) return { vcs };
  }
  if (kindAt(join(dir, "HEAD")) === "file" && kindAt(join(dir, "objects")) === "folder" &&
    kindAt(join(dir, "refs")) === "folder") return { vcs: "git", bare: true };
  return null;
}

function tracked(root) {
  try {
    const listed = execFileSync("git", ["ls-files", "-z", "--cached"], {
      cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"],
    });
    return listed.split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

function chosenIn(at) {
  const held = require("./solution.js").solutionOf(at);
  if (!held) return null;
  return held.repositories.flatMap((one) => {
    const own = one.vcs === "git" ? tracked(join(at, one.folder)) : null;
    return (own ?? walked(join(at, one.folder))).map((path) => `${one.folder}/${path}`);
  });
}

function walked(root, at = "", held = []) {
  let entries;
  try {
    entries = readdirSync(join(root, at), { withFileTypes: true });
  } catch {
    // empty-catch:allow: a folder that will not list has nothing the reading could read either.
    return held;
  }
  for (const entry of entries) {
    if (skipped(entry.name)) continue;
    const path = at ? `${at}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      const kind = checkoutKind(join(root, path));
      if (kind?.linked || kind?.bare) continue;
      const own = kind?.vcs === "git" ? tracked(join(root, path)) : null;
      if (own) held.push(...own.map((one) => `${path}/${one}`));
      else walked(root, path, held);
    } else if (entry.isFile()) held.push(path);
  }
  return held;
}

function originOf(dir) {
  const quietly = (args) => {
    try {
      return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {
      // empty-catch:allow: git exits non-zero where there is no origin, no commit or no branch, and
      return "";
    }
  };
  const url = quietly(["remote", "get-url", "origin"]);
  const named = url.replace(/\.git$/, "").split(/[/:]/).filter(Boolean).slice(-2).join("/");
  return {
    key: named || quietly(["rev-list", "--max-parents=0", "HEAD"]).split("\n")[0] || dir,
    name: named || null,
    branch: quietly(["symbolic-ref", "--short", "--quiet", "HEAD"]) || null,
  };
}

function listed(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    // empty-catch:allow: a folder this cannot list is one the reading cannot read either, so it
    return [];
  }
}

function checkoutsIn(root, depth = 3) {
  const at = resolve(root);
  if (tracked(at) !== null || checkoutKind(at)) return null;
  const found = [];
  const loose = [];
  const visit = (path, level) => {
    for (const entry of listed(join(at, path))) {
      if (!entry.isDirectory() || skipped(entry.name)) continue;
      const inner = path ? `${path}/${entry.name}` : entry.name;
      const kind = checkoutKind(join(at, inner));
      if (kind) {
        if (!kind.linked && !kind.bare) found.push({ path: inner, vcs: kind.vcs });
        continue;
      }
      loose.push(inner);
      if (level < depth) visit(inner, level + 1);
    }
  };
  visit("", 1);

  const groups = new Map();
  const tops = [];
  for (const one of found) {
    const origin = one.vcs === "git" ? originOf(join(at, one.path)) : { key: one.path, name: null, branch: null };
    if (!groups.has(origin.key)) groups.set(origin.key, { repository: origin.name ?? one.path, places: [] });
    groups.get(origin.key).places.push({ path: one.path, vcs: one.vcs, branch: origin.branch });
    const files = one.vcs === "git" ? tracked(join(at, one.path)) : null;
    if (files) tops.push({ key: origin.key, path: one.path, top: new Set(files.map((file) => file.split("/")[0])) });
  }
  const copies = [];
  for (const path of loose) {
    if (copies.some((one) => path.startsWith(`${one}/`))) continue;
    const names = new Set(listed(join(at, path)).map((entry) => entry.name));
    const match = tops.find((one) => one.top.size >= 3 &&
      [...one.top].filter((name) => names.has(name)).length >= 0.8 * one.top.size);
    if (!match) continue;
    copies.push(path);
    groups.get(match.key).places.push({ path, vcs: null, branch: null, copy_of: match.path });
  }
  return [...groups.values()];
}

function filesOf(root) {
  const at = resolve(root);
  const listed = tracked(at) ?? chosenIn(at) ?? walked(at);
  const out = [];
  for (const path of listed) {
    if (path.split("/").some(skipped)) continue;
    const full = join(at, path);
    try {
      if (lstatSync(full).isFile()) out.push(full);
    } catch {
    }
  }
  return out;
}

function copied(root) {
  const at = resolve(root);
  const into = mkdtempSync(join(tmpdir(), "evalation-tree-"));
  for (const full of filesOf(at)) {
    const to = join(into, full.slice(at.length + sep.length));
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(full, to);
  }
  return { path: into, done: () => rmSync(into, { recursive: true, force: true }) };
}

function inRepository(root, full) {
  return relative(root, full).split(sep).join("/");
}

module.exports = { SKIP, checkoutKind, checkoutsIn, copied, filesOf, inRepository, skipped };
