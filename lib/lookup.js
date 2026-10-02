"use strict";

const { mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { join, posix } = require("node:path");
const { pathToFileURL } = require("node:url");
const { filesOf, inRepository } = require("./tree.js");

const BASE = "https://api.deps.dev";
const SHOWN = 20;
const SYSTEMS = { npm: "npm", yarn: "npm", pnpm: "npm", bun: "npm", pip: "pypi", pipenv: "pypi", poetry: "pypi", uv: "pypi", cargo: "cargo" };

const npmPublic = (url) => /^https:\/\/registry\.(npmjs\.org|yarnpkg\.com)\//.test(String(url));
const pypiPublic = (url) => /^https:\/\/(pypi\.org|pypi\.python\.org|files\.pythonhosted\.org)\//.test(String(url));
const slashed = (url) => (String(url).endsWith("/") ? String(url) : `${url}/`);
const CRATES = new Set(["registry+https://github.com/rust-lang/crates.io-index", "sparse+https://index.crates.io/"]);

const nameIn = (system, name) => (system === "pypi" ? String(name).toLowerCase().replace(/[-_.]+/g, "-") : String(name));
const keyOf = (system, name, version) => `${system} ${nameIn(system, name)} ${version}`;

function textOf(root, path) {
  try {
    return readFileSync(join(root, path), "utf8");
  } catch (thrown) {
    if (thrown.code === "ENOENT") return null;
    throw thrown;
  }
}

function npmRegistryBarred(root, lockfile, files) {
  const folders = [];
  for (let at = posix.dirname(lockfile); ; at = posix.dirname(at)) {
    folders.push(at === "." ? "" : `${at}/`);
    if (at === "." || at === "/") break;
  }
  const scopes = new Set();
  for (const folder of folders) {
    for (const name of [".npmrc", ".yarnrc", ".yarnrc.yml"]) {
      if (!files.has(`${folder}${name}`)) continue;
      for (const raw of String(textOf(root, `${folder}${name}`) ?? "").split("\n")) {
        const scoped = /^\s*(@[^:\s]+):registry\s*=\s*"?([^"\s]+)/.exec(raw);
        const whole = /^\s*registry\s*[=\s]\s*"?([^"\s]+)/.exec(raw) ?? /^\s*npmRegistryServer:\s*"?([^"\s]+)/.exec(raw);
        if (scoped && !npmPublic(slashed(scoped[2]))) scopes.add(scoped[1]);
        if (whole && !npmPublic(slashed(whole[1]))) return { all: true, scopes };
      }
    }
  }
  return { all: false, scopes };
}

const scopeOf = (name) => (String(name).startsWith("@") ? String(name).split("/")[0] : null);

function npmPackageLock(text) {
  const held = new Set();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return held;
  }
  for (const [key, one] of Object.entries(parsed.packages ?? {})) {
    if (!key || one.link || !npmPublic(one.resolved)) continue;
    held.add(`${key.slice(key.lastIndexOf("node_modules/") + "node_modules/".length)} ${one.version}`);
  }
  return held;
}

function yarnLock(text) {
  const held = new Set();
  for (const block of String(text).split(/\n(?=\S)/)) {
    const header = block.split("\n")[0].replace(/:$/, "").split(",")[0].trim().replace(/^"|"$/g, "");
    const name = header.slice(0, header.lastIndexOf("@") > 0 ? header.lastIndexOf("@") : header.length);
    const version = /^\s+version:?\s+"?([^"\s]+)/m.exec(block)?.[1];
    const resolved = /^\s+resolved:?\s+"?([^"\s]+)/m.exec(block)?.[1];
    const resolution = /^\s+resolution:\s+"?([^"\s]+)/m.exec(block)?.[1];
    if (!name || !version) continue;
    if ((resolved && npmPublic(resolved)) || (resolution && resolution.includes("@npm:"))) held.add(`${name} ${version}`);
  }
  return held;
}

function pnpmLock(text) {
  const held = new Set();
  let current = null;
  for (const raw of String(text).split("\n")) {
    const key = /^ {2}'?\/?((?:@[^/@]+\/)?[^@/\s']+)@([^(:'\s]+)[^:]*'?:\s*$/.exec(raw);
    if (key) {
      current = `${key[1]} ${key[2]}`;
      continue;
    }
    const resolution = /^ {4}resolution:\s*\{(.*)\}/.exec(raw);
    if (!current || !resolution) continue;
    const tarball = /tarball:\s*([^,\s}]+)/.exec(resolution[1])?.[1];
    if (/integrity:/.test(resolution[1]) && !/(directory|repo|commit|type):/.test(resolution[1]) && (!tarball || npmPublic(tarball))) held.add(current);
    current = null;
  }
  return held;
}

function tomlBlocks(text) {
  return String(text).split(/^\[\[package\]\]\s*$/m).slice(1).map((block) => ({
    name: /^name\s*=\s*"([^"]*)"/m.exec(block)?.[1],
    version: /^version\s*=\s*"([^"]*)"/m.exec(block)?.[1],
    block,
  }));
}

function poetryLock(text) {
  return new Set(tomlBlocks(text).filter((one) => !/^\[package\.source\]/m.test(one.block)).map((one) => `${nameIn("pypi", one.name)} ${one.version}`));
}

function uvLock(text) {
  return new Set(tomlBlocks(text).filter((one) => pypiPublic(/^source\s*=\s*\{\s*registry\s*=\s*"([^"]+)"/m.exec(one.block)?.[1]))
    .map((one) => `${nameIn("pypi", one.name)} ${one.version}`));
}

function cargoLock(text) {
  return new Set(tomlBlocks(text).filter((one) => CRATES.has(/^source\s*=\s*"([^"]+)"/m.exec(one.block)?.[1])).map((one) => `${one.name} ${one.version}`));
}

function requirementsBarred(text) {
  return String(text).split("\n").some((raw) => {
    const option = /^\s*(-i|--index-url|--extra-index-url|-f|--find-links)(?:\s+|=)(\S+)/.exec(raw);
    return Boolean(option) && (/^(-f|--find-links)$/.test(option[1]) || !pypiPublic(slashed(option[2])));
  });
}

function pipfileBarred(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return true;
  }
  return (parsed._meta?.sources ?? []).some((one) => !pypiPublic(slashed(one.url)));
}

function publicOf(type, root, lockfile, files) {
  const text = textOf(root, lockfile);
  if (text === null) return null;
  const listed = (held) => (name, version) => held.has(`${nameIn(SYSTEMS[type], name)} ${version}`);
  if (SYSTEMS[type] === "npm") {
    const barred = npmRegistryBarred(root, lockfile, files);
    if (barred.all) return null;
    const held = type === "npm" ? npmPackageLock(text) : type === "yarn" ? yarnLock(text) : type === "pnpm" ? pnpmLock(text) : null;
    if (!held) return null;
    return (name, version) => !barred.scopes.has(scopeOf(name)) && held.has(`${name} ${version}`);
  }
  if (type === "pip") return requirementsBarred(text) ? null : () => true;
  if (type === "pipenv") return pipfileBarred(text) ? null : () => true;
  if (type === "poetry") return listed(poetryLock(text));
  if (type === "uv") return listed(uvLock(text));
  if (type === "cargo") return listed(cargoLock(text));
  return null;
}

function candidates(out, root, crates = []) {
  const files = new Set(filesOf(root).map((one) => inRepository(root, one)));
  const replaced = new Set(crates.map((one) => one.Target));
  const lockfiles = [...(JSON.parse(out || "{}").Results ?? [])
    .filter((one) => one.Class === "lang-pkgs" && files.has(one.Target) && !replaced.has(one.Target)), ...crates];
  const send = new Map();
  const kept_back = [];
  for (const lockfile of lockfiles) {
    const type = lockfile.Type ?? "";
    const system = SYSTEMS[type];
    const shown = system ? publicOf(type, root, lockfile.Target, files) : null;
    if (!shown) {
      kept_back.push(lockfile.Target);
      continue;
    }
    const unread = new Set(lockfile.Unread ?? []);
    for (const one of lockfile.Packages ?? []) {
      const relation = String(one.Relationship ?? "").toLowerCase();
      if (["root", "workspace"].includes(relation) || !one.Version) continue;
      if ((one.Licenses ?? []).length > 0 && !unread.has(`${one.Name} ${one.Version}`)) continue;
      if (!shown(one.Name, one.Version)) continue;
      const key = keyOf(system, one.Name, one.Version);
      if (!send.has(key)) send.set(key, { system, name: nameIn(system, one.Name), version: one.Version, lockfile: lockfile.Target });
    }
  }
  return { send: [...send.values()], kept_back };
}

function answersFor(answers) {
  const held = new Map();
  for (const one of answers ?? []) if ((one.licences ?? []).length > 0) held.set(`${one.lockfile}\n${keyOf(one.system, one.name, one.version)}`, one.licences);
  return (lockfile, name, version) => held.get(`${lockfile.Target}\n${keyOf(SYSTEMS[lockfile.Type ?? ""] ?? "", name, version)}`) ?? null;
}

const urlOf = (one, base = BASE) =>
  `${base}/v3/systems/${one.system}/packages/${encodeURIComponent(one.name)}/versions/${encodeURIComponent(one.version)}`;

async function answerOf(one, base, wait) {
  let res;
  try {
    res = await fetch(urlOf(one, base), { signal: AbortSignal.timeout(wait) });
  } catch (thrown) {
    return { ...one, licences: null, failed: String(thrown.message ?? thrown) };
  }
  if (!res.ok) return { ...one, licences: null, ...(res.status === 404 ? {} : { failed: `deps.dev answered ${res.status}` }) };
  const held = ((await res.json()).licenses ?? []).filter((each) => typeof each === "string" && each.trim());
  return { ...one, licences: held.length > 0 ? held : null };
}

async function lookUp(list, { base = BASE, at_once = 8, wait = 10_000 } = {}) {
  const answers = new Array(list.length);
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const at = next++;
      answers[at] = await answerOf(list[at], base, wait);
    }
  };
  await Promise.all(Array.from({ length: Math.min(at_once, list.length) }, worker));
  return answers;
}

function asked(list, home) {
  const { line } = require("./run-say.js");
  const { entries, say } = require("./say.js");
  const folder = join(home, "lookups");
  mkdirSync(folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const kept = join(folder, `${stamp}.json`);
  const shown = join(folder, `${stamp} packages to look up.txt`);
  const lines = list.map((one) => `${one.name} ${one.version}`);
  writeFileSync(kept, JSON.stringify(list, null, 2));
  writeFileSync(shown, `${lines.join("\n")}\n`);
  const count = `${list.length} package${list.length === 1 ? "" : "s"}`;
  const short = list.length <= SHOWN;
  const said = [line("ev-run.lookup-intro", { packages: count }),
    short ? lines.map((one) => `- ${one}`).join("\n") : line("ev-run.lookup-file", { link: pathToFileURL(shown).href, file: shown }),
    line("ev-run.lookup-without", { packages: count })].join("\n\n");
  const asks = JSON.parse(say(entries(), short ? "ev-run.lookup-ask" : "ev-run.lookup-ask-file", { packages: count }));
  return { said, asks, list: kept, shown };
}

module.exports = { BASE, SYSTEMS, answersFor, asked, candidates, lookUp, urlOf };

if (require.main === module) {
  lookUp(JSON.parse(readFileSync(0, "utf8"))).then((answers) => process.stdout.write(JSON.stringify(answers)));
}
