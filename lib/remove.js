"use strict";

const { existsSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

function real(path) {
  try {
    return realpathSync(resolve(path));
  } catch (thrown) {
    if (thrown.code === "ENOENT") return resolve(path);
    throw thrown;
  }
}

function folderOf(path) {
  return real(path).replace(/[^A-Za-z0-9]/g, "-");
}

function recorded(dir, pick) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((one) => one.endsWith(".json")).flatMap((one) => {
    let held;
    try {
      held = JSON.parse(readFileSync(join(dir, one), "utf8"));
    } catch {
      // empty-catch:allow: a file that will not parse names no folder, and removal deletes it with the rest.
      return [];
    }
    const path = pick(held);
    return typeof path === "string" && path ? [real(path)] : [];
  });
}

function foldersRead(home, cwd) {
  return [...new Set([
    ...recorded(join(home, "findings"), (one) => one.target?.path),
    ...recorded(join(home, "scans"), (one) => one.target?.path),
    ...recorded(join(home, "solutions"), (one) => one.root),
    ...(cwd ? [real(cwd)] : []),
  ])];
}

function keysOf(home) {
  let settings;
  try {
    settings = JSON.parse(readFileSync(join(home, "evalation.local"), "utf8"));
  } catch (thrown) {
    if (thrown.code === "ENOENT") return [];
    throw thrown;
  }
  return Object.values(settings.secrets ?? {}).flatMap((named) => {
    const held = String(named).match(/^(?:store|keychain):([^/]+)\/(.+)$/);
    if (!held) return [];
    const one = { service: held[1], account: held[2] };
    return /receiving-key$/.test(one.account) ? [one, { ...one, account: `${one.account}-previous` }] : [one];
  });
}

function clearedHistory(claude, folders) {
  const names = new Set(folders.map((one) => one.replace(/[^A-Za-z0-9]/g, "-")));
  const removed = [];
  for (const name of names) {
    const at = join(claude, "projects", name);
    if (existsSync(at)) {
      rmSync(at, { recursive: true, force: true });
      removed.push(at);
    }
  }
  const history = join(claude, "history.jsonl");
  let lines = 0;
  if (existsSync(history)) {
    const kept = readFileSync(history, "utf8").split("\n").filter((line) => {
      if (!line.trim()) return false;
      let project;
      try {
        project = JSON.parse(line).project;
      } catch {
        return true;
      }
      const drop = typeof project === "string" && folders.includes(real(project));
      if (drop) lines += 1;
      return !drop;
    });
    writeFileSync(history, kept.length > 0 ? `${kept.join("\n")}\n` : "");
  }
  return { folders, removed, lines };
}

function removal({ home, claude, cwd, clearHistory, revoke, forget }) {
  try {
    revoke();
  } catch (thrown) {
    throw new Error(`could not revoke this installation (${thrown.message}), so nothing was removed. The keys on this machine are what revoke it, so run /ev-remove again once the server can be reached`);
  }
  const folders = foldersRead(home, cwd);
  const keys = keysOf(home);
  for (const one of keys) {
    try {
      forget(one.service, one.account);
    } catch {
      // empty-catch:allow: a key already gone from the store is a key removed, which is what was asked.
    }
  }
  const history = clearHistory ? clearedHistory(claude, folders) : { folders, removed: [], lines: 0 };
  rmSync(home, { recursive: true, force: true });
  return { keys: keys.map((one) => `${one.service}/${one.account}`), history, home };
}

module.exports = { foldersRead, removal };
