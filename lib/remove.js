"use strict";

const { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const STARTED = /<command-name>\/evalation-plugin:/;
const LIVE_FOR = 120000;
const HOUR = 3600000;

function ranTheCommand(file) {
  return readFileSync(file, "utf8").split("\n").some((line) => {
    if (!line.includes("evalation-plugin:")) return false;
    let held;
    try {
      held = JSON.parse(line);
    } catch {
      // empty-catch:allow: a line that will not parse records no command, so it cannot mark the conversation as the plugin's.
      return false;
    }
    return held?.type === "user" && typeof held.message?.content === "string" && STARTED.test(held.message.content);
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (thrown) {
    return thrown.code === "EPERM";
  }
}

function registered(file) {
  try {
    const held = JSON.parse(readFileSync(file, "utf8"));
    return Number.isInteger(held?.pid) && typeof held.sessionId === "string" ? held : null;
  } catch (thrown) {
    if (thrown.code === "ENOENT") return { pid: -1, sessionId: "" };
    return null;
  }
}

function openIn(claude, here) {
  const at = join(claude, "sessions");
  if (!here || !existsSync(at)) return null;
  const open = new Set();
  for (const one of readdirSync(at).filter((name) => name.endsWith(".json"))) {
    const held = registered(join(at, one));
    if (!held) return null;
    if (held.pid > 0 && alive(held.pid)) open.add(held.sessionId);
  }
  return open.has(here) ? open : null;
}

function pluginConversations(claude, { now = Date.now(), here } = {}) {
  const projects = join(claude, "projects");
  if (!existsSync(projects)) return [];
  const open = openIn(claude, here);
  return readdirSync(projects).flatMap((folder) => {
    const at = join(projects, folder);
    if (!statSync(at).isDirectory()) return [];
    return readdirSync(at).filter((one) => one.endsWith(".jsonl")).flatMap((one) => {
      const file = join(at, one);
      if (!ranTheCommand(file)) return [];
      const id = one.slice(0, -6);
      const idle = now - statSync(file).mtimeMs;
      const live = open ? open.has(id) || idle < LIVE_FOR : idle < HOUR;
      return [{ id, file, folder: join(at, id), live }];
    });
  });
}

const openBy = (claude, here) => (openIn(claude, here) ? "claude-code" : "last-hour");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function runDate(home, run, file) {
  const findings = join(home, "findings");
  const named = run && existsSync(findings) ? readdirSync(findings).find((one) => one.endsWith(`-${run}.json`)) : undefined;
  let at;
  try {
    at = named ? JSON.parse(readFileSync(join(findings, named), "utf8")).at : undefined;
  } catch {
    // empty-catch:allow: a findings file that will not read leaves the report dated by when it was printed.
    at = undefined;
  }
  const when = typeof at === "string" && !Number.isNaN(Date.parse(at)) ? new Date(at) : statSync(file).mtime;
  return `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
}

function reportsIn(home) {
  const at = join(home, "reports");
  if (!existsSync(at)) return [];
  return readdirSync(at, { recursive: true }).map(String).filter((one) => one.toLowerCase().endsWith(".pdf")).sort().map((one) => {
    const parts = one.split(/[\\/]/);
    const name = parts.pop().slice(0, -4).replace(/[-_]+/g, " ").trim();
    return { name, date: runDate(home, parts[0] ?? "", join(at, one)) };
  });
}

function keysOf(home) {
  let settings;
  try {
    settings = JSON.parse(readFileSync(join(home, "evalation.local"), "utf8"));
  } catch (thrown) {
    if (thrown.code === "ENOENT") return [];
    throw thrown;
  }
  return Object.values(settings.secrets ?? {}).flatMap((reference) => {
    const held = String(reference).match(/^(?:store|keychain):([^/]+)\/(.+)$/);
    if (!held) return [];
    const one = { service: held[1], account: held[2] };
    return /receiving-key$/.test(one.account) ? [one, { ...one, account: `${one.account}-previous` }] : [one];
  });
}

const KEY_NOT_FOUND = 44;

function sessionOf(line) {
  try {
    return JSON.parse(line).sessionId;
  } catch {
    return undefined;
  }
}

function withoutSessions(file, ids, read = readFileSync) {
  const temporary = `${file}.${process.pid}.evalation`;
  for (let tries = 0; tries < 5; tries += 1) {
    const before = read(file, "utf8");
    const lines = before.split("\n").filter((line) => line.trim());
    const kept = lines.filter((line) => !ids.has(sessionOf(line)));
    const text = kept.length > 0 ? `${kept.join("\n")}\n` : "";
    writeFileSync(temporary, text, { mode: statSync(file).mode & 0o777 });
    const now = read(file, "utf8");
    if (now === before) {
      renameSync(temporary, file);
      return lines.length - kept.length;
    }
    if (!now.startsWith(before)) continue;
    const added = now.slice(before.length).split("\n").filter((line) => line.trim());
    const addedKept = added.filter((line) => !ids.has(sessionOf(line)));
    appendFileSync(temporary, addedKept.length > 0 ? `${addedKept.join("\n")}\n` : "");
    if (read(file, "utf8") === now) {
      renameSync(temporary, file);
      return lines.length - kept.length + added.length - addedKept.length;
    }
  }
  rmSync(temporary, { force: true });
  throw new Error("the prompt history kept changing while it was rewritten");
}

function clearedConversations(claude, here) {
  const found = pluginConversations(claude, { here });
  const gone = found.filter((one) => !one.live);
  for (const one of gone) {
    rmSync(one.file, { force: true });
    rmSync(one.folder, { recursive: true, force: true });
  }
  const ids = new Set(gone.map((one) => one.id));
  const history = join(claude, "history.jsonl");
  const lines = existsSync(history) && ids.size > 0 ? withoutSessions(history, ids) : 0;
  return { removed: gone.length, kept_live: found.length - gone.length, kept_by: openBy(claude, here), lines };
}

function revokeFailure(said) {
  if (/^(no-settings|no-installation|no-key|unreadable-key-reference|key-wrong-size):/.test(said)) return "gone";
  if (/^unreachable:/.test(said) || /^refused 503:/.test(said)) return "unreachable";
  if (/^refused 401:/.test(said) && /"failure":"not-live"/.test(said) && !/outside the window|seconds from now/.test(said)) return "gone";
  return "refused";
}

function removal({ home, claude, here, clearHistory, revoke, forget }) {
  let signedOut = "now";
  try {
    revoke();
  } catch (thrown) {
    const reason = revokeFailure(thrown.message);
    if (reason !== "gone") {
      const failed = new Error(thrown.message);
      failed.reason = reason;
      throw failed;
    }
    signedOut = "already";
  }
  const failed = [];
  const keysLeft = [];
  let keys = [];
  try {
    keys = keysOf(home);
  } catch (thrown) {
    failed.push(`settings: ${thrown.message}`);
  }
  for (const one of keys) {
    try {
      forget(one.service, one.account);
    } catch (thrown) {
      if (thrown.status !== KEY_NOT_FOUND) keysLeft.push(`${one.service}/${one.account}`);
    }
  }
  let history = { removed: 0, kept_live: 0, kept_by: openBy(claude, here), lines: 0 };
  if (clearHistory) {
    try {
      history = clearedConversations(claude, here);
    } catch (thrown) {
      failed.push(`history: ${thrown.message}`);
    }
  }
  try {
    rmSync(home, { recursive: true, force: true });
  } catch (thrown) {
    failed.push(`folder: ${thrown.message}`);
  }
  return { signed_out: signedOut, keys_left: keysLeft, history, folder_deleted: !existsSync(home), failed, home };
}

module.exports = { openBy, pluginConversations, removal, reportsIn, withoutSessions };
