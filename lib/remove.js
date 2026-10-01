"use strict";

const { appendFileSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } = require("node:fs");
const { basename, join } = require("node:path");
const { entries, say } = require("./say.js");
const { raised } = require("./errors.js");

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

function cwdOf(file, folder) {
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.includes('"cwd"')) continue;
    try {
      const cwd = JSON.parse(line).cwd;
      if (typeof cwd === "string" && cwd) return cwd;
    } catch {
      // empty-catch:allow: a line that will not parse names no folder, so the next line is read.
    }
  }
  return folder;
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
      const changed = statSync(file).mtime;
      const idle = now - changed.getTime();
      const live = open ? open.has(id) || idle < LIVE_FOR : idle < HOUR;
      return [{ id, file, folder: join(at, id), live, cwd: cwdOf(file, folder), changed }];
    });
  });
}

const openBy = (claude, here) => (openIn(claude, here) ? "claude-code" : "last-hour");

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const day = (when) => `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;

function runOf(home, run) {
  const findings = join(home, "findings");
  const named = run && existsSync(findings) ? readdirSync(findings).find((one) => one.endsWith(`-${run}.json`)) : undefined;
  try {
    return named ? JSON.parse(readFileSync(join(findings, named), "utf8")) ?? {} : {};
  } catch {
    // empty-catch:allow: a findings file that will not read leaves the reports dated by when they were printed.
    return {};
  }
}

function reportsIn(home) {
  const at = join(home, "reports");
  if (!existsSync(at)) return [];
  const runs = new Map();
  for (const one of readdirSync(at, { recursive: true }).map(String).filter((each) => each.toLowerCase().endsWith(".pdf")).sort()) {
    const parts = one.split(/[\\/]/);
    const file = parts.pop();
    const run = parts[0] ?? "";
    if (!runs.has(run)) runs.set(run, { run, files: [], printed: statSync(join(at, one)).mtime });
    runs.get(run).files.push(file);
  }
  return [...runs.values()].map(({ run, files, printed }) => {
    const held = runOf(home, run);
    const repository = typeof held.target?.repository === "string" ? held.target.repository : null;
    const slug = repository ? `${repository.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-` : null;
    const when = typeof held.at === "string" && !Number.isNaN(Date.parse(held.at)) ? new Date(held.at) : printed;
    const reports = files.map((file) => {
      const base = file.slice(0, -4);
      return (slug && base.toLowerCase().startsWith(slug) ? base.slice(slug.length) : base).replace(/[-_]+/g, " ").trim();
    }).sort();
    return { repository, date: day(when), reports };
  });
}

function placesOf(conversations) {
  const places = new Map();
  for (const one of conversations) {
    const place = places.get(one.cwd) ?? { cwd: one.cwd, conversations: 0, from: one.changed, to: one.changed };
    place.conversations += 1;
    if (one.changed < place.from) place.from = one.changed;
    if (one.changed > place.to) place.to = one.changed;
    places.set(one.cwd, place);
  }
  const named = [...places.values()].map((one) => ({ ...one, folder: basename(one.cwd) || one.cwd }));
  const shared = new Set(named.filter((one, at) => named.findIndex((other) => other.folder === one.folder) !== at).map((one) => one.folder));
  return named
    .map((one) => ({ folder: shared.has(one.folder) ? one.cwd : one.folder, conversations: one.conversations, from: day(one.from), to: day(one.to) }))
    .sort((a, b) => b.conversations - a.conversations || (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
}

const joined = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

function placesNamed(places, held = entries()) {
  if (places.length === 0) return null;
  return joined(places.map((one) => {
    const [from, to] = [one.from.split(" "), one.to.split(" ")];
    if (one.conversations === 1) return say(held, "ev-remove.place-one", { folder: one.folder, from: one.from });
    if (one.from === one.to) return say(held, "ev-remove.place-day", { folder: one.folder, count: one.conversations, from: one.from });
    const start = from[1] === to[1] && from[2] === to[2] ? from[0] : one.from;
    return say(held, "ev-remove.place", { folder: one.folder, count: one.conversations, from: start, to: one.to });
  }));
}

function reportsNamed(reports, held = entries()) {
  if (reports.length === 0) return null;
  return joined(reports.map((one) => (one.repository
    ? say(held, "ev-remove.report", { names: joined(one.reports), repository: one.repository, date: one.date })
    : say(held, "ev-remove.report-unnamed", { names: joined(one.reports), date: one.date }))));
}

function keysNamed(keys, held = entries()) {
  return joined(keys.map((one) => {
    const split = one.indexOf("/");
    return say(held, "ev-remove.key", { service: one.slice(0, split), account: one.slice(split + 1) });
  }));
}

const quoted = (names) => joined(names.map((one) => `"${one}"`));

function setsAsked(listing, held = entries()) {
  const names = (listing.sets ?? []).filter((one) => one.where === "machine").map((one) => one.name);
  if (names.length === 0) return null;
  const asked = JSON.parse(say(held, names.length === 1 ? "ev-remove.keep-set" : "ev-remove.keep-sets", { sets: quoted(names) }));
  return { ...asked, sets: names };
}

function setsKept({ home, names, keep }, held = entries()) {
  const { load, problems } = require("./questions.js");
  const passes = (name) => {
    try {
      return problems(load(home, name)).length === 0;
    } catch {
      return false;
    }
  };
  const fails = names.find((name) => !passes(name));
  if (fails !== undefined) return { fails };
  for (const name of names) {
    try {
      keep(name);
    } catch (thrown) {
      return { notKept: name, reason: thrown.message };
    }
  }
  if (names.length === 0) return { said: null };
  return { said: names.length === 1 ? say(held, "shared.set-kept", { set: quoted(names) }) : say(held, "ev-remove.sets-kept", { sets: quoted(names) }) };
}

const SETTINGS = new Set(["evalation.local", "keys"]);

function holdsSaved(home) {
  const within = (at) => readdirSync(at, { withFileTypes: true }).some((one) => (one.isDirectory() ? within(join(at, one.name)) : true));
  if (!existsSync(home)) return false;
  return readdirSync(home, { withFileTypes: true }).filter((one) => !SETTINGS.has(one.name))
    .some((one) => (one.isDirectory() ? within(join(home, one.name)) : true));
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
    const services = held[1] === "evalation-plugin" ? ["evalation-plugin", "evalation"] : [held[1]];
    const accounts = /receiving-key$/.test(held[2]) ? [held[2], `${held[2]}-previous`] : [held[2]];
    return services.flatMap((service) => accounts.map((account) => ({ service, account })));
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
  throw raised("the prompt history kept changing while it was rewritten", null);
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
  if (/^no-settings:/.test(said)) return "gone";
  if (/^(settings-unreadable|no-installation|no-key|unreadable-key-reference|key-wrong-size):/.test(said)) return "damaged";
  if (/^unreachable:/.test(said) || /^refused 503:/.test(said)) return "unreachable";
  if (/^refused 401:/.test(said) && /"failure":"not-live"/.test(said) && !/outside the window|seconds from now/.test(said)) return "gone";
  return "refused";
}

function stillHeld(held, service, account) {
  try {
    held(service, account);
    return true;
  } catch {
    return false;
  }
}

function removal({ home, claude, here, clearHistory, revoke, forget, held = () => { throw raised("no store to ask", "The plugin's removal in lib/remove.js was called with no key store. Pass the key store to removal as held from bin/evalation-remove."); } }) {
  let signedOut = "now";
  try {
    revoke();
  } catch (thrown) {
    const reason = revokeFailure(thrown.message);
    if (reason !== "gone" && reason !== "damaged") {
      const failed = raised(thrown.message, null);
      failed.reason = reason;
      throw failed;
    }
    signedOut = reason === "gone" ? "already" : "not-revoked";
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
      if (thrown.status !== KEY_NOT_FOUND && stillHeld(held, one.service, one.account)) keysLeft.push(`${one.service}/${one.account}`);
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

module.exports = { holdsSaved, keysNamed, openBy, placesNamed, placesOf, pluginConversations, removal, reportsIn, reportsNamed, setsAsked, setsKept, withoutSessions };
