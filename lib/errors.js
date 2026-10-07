"use strict";

const { closeSync, existsSync, mkdirSync, openSync, opendirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } = require("node:fs");
const { homedir, hostname, userInfo } = require("node:os");
const { isAbsolute, join, relative, sep } = require("node:path");
const { fileURLToPath } = require("node:url");

const ROOT = join(__dirname, "..");
const FIELDS = ["source", "failure", "engine", "revision", "subject", "place", "remedy", "text"];
const FAILURES = [
  "uncaught-error",
  "unhandled-rejection",
  "unexpected-error",
  "ask-refused",
  "ask-not-json",
  "answer-unopened",
  "answer-unreadable",
  "sign-in-setup-refused",
  "sign-in-refused-unrecognised",
  "line-refused",
  "input-refused",
  "run-stopped",
];
const MOST_HELD = 20;
const MOST_LISTED = 200;
const MOST_TEXT = 2000;
const MOST_WRITTEN = 8000;
const UNLISTED = new Set(["ENOENT", "ENOTDIR", "EACCES", "EPERM"]);
const SEND_MS = 2000;
const STALE_MS = 60000;
const HELD = "errors.jsonl";
const SENDING = "errors-sending";
const PLACEHOLDER = /^(<path>|<n>|<id>|<call>|\[x[0-9]+\])$/;
const PROSE = /^[A-Za-z0-9.,:'!?-]+$/;
const PLACE = /^(bin|lib|hooks)\/[A-Za-z0-9._-]+:[1-9][0-9]*$/;
const PERSONS_OWN = new Set([401, 402, 403, 408, 429]);
const BUILT_WRONG = new Set(["unservable", "unknown"]);
const INSTALLED = Symbol.for("evalation.errors");

let revision = null;
let hooked = false;
let filed = false;
let written = "";

const inside = () => Boolean(process.env.EVALATION_REPORTING);
const absent = (thrown) => thrown?.code === "ENOENT";

function prose(line) {
  const kept = [];
  for (const word of String(line).split(/\s+/)) {
    if (!word) continue;
    if (!PLACEHOLDER.test(word) && !PROSE.test(word)) break;
    kept.push(word);
  }
  return kept.join(" ") || null;
}

function listed(folder) {
  const names = [];
  let entries;
  try {
    entries = opendirSync(folder);
  } catch (thrown) {
    if (UNLISTED.has(thrown?.code)) return names;
    throw thrown;
  }
  try {
    for (let one = entries.readSync(); one !== null && names.length < MOST_LISTED; one = entries.readSync()) names.push(one.name);
  } finally {
    entries.closeSync();
  }
  return names;
}

function machineWords() {
  const named = [process.cwd(), homedir(), process.env.CLAUDE_PROJECT_DIR, ...process.argv.slice(1)];
  const words = named.filter(Boolean).flatMap((one) => String(one).split(/[\\/]+/));
  for (const folder of [process.cwd(), process.env.CLAUDE_PROJECT_DIR].filter(Boolean)) words.push(...listed(folder));
  for (const one of [() => userInfo().username, () => hostname()]) {
    try {
      words.push(...String(one()).split("."));
    } catch {
      continue;
    }
  }
  return new Set(words.map((one) => one.toLowerCase()).filter((one) => one.length >= 2));
}

function scrubbedWord(word, machine) {
  if (PLACEHOLDER.test(word)) return word;
  if (/^['"`]/.test(word)) return "\u0000";
  if (/[\\/]/.test(word)) return "<path>";
  const bare = word.replace(/[.,:;!?)\]'"`]+$/, "");
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(bare)) return "<id>";
  if (/^toolu_/.test(bare)) return "<call>";
  if (machine.has(bare.toLowerCase())) return "<id>";
  if (/^[0-9]+$/.test(bare)) return "<n>";
  if (/_|[a-z][A-Z]|[A-Za-z]-[A-Za-z]|[A-Za-z]\.[A-Za-z]|[A-Za-z][0-9]|[0-9][A-Za-z]/.test(bare)) return "<id>";
  return word;
}

function scrubbed(text, machine = machineWords()) {
  if (text === undefined || text === null) return null;
  const first = String(text).split(/\r?\n/)[0];
  const cut = prose(first.split(/\s+/).filter(Boolean).map((word) => scrubbedWord(word, machine)).join(" "));
  if (!cut || cut.length <= 200) return cut;
  return cut.slice(0, 201).replace(/\s+\S*$/, "") || null;
}

function textOf(text, machine = machineWords()) {
  if (text === undefined || text === null) return null;
  const lines = String(text).replace(/"[^"\n]*"/g, " <id> ").split(/\r?\n/).map((line) => line.split(/\s+/).filter(Boolean).map((word) => {
    const one = scrubbedWord(word.replace(/^[([{]+|[)\]};]+$/g, ""), machine);
    return PLACEHOLDER.test(one) || PROSE.test(one) ? one : "<id>";
  }).join(" ")).filter(Boolean);
  const whole = lines.join("\n");
  if (!whole) return null;
  if (whole.length <= MOST_TEXT) return whole;
  return whole.slice(0, MOST_TEXT + 1).replace(/\s+\S*$/, "") || null;
}

function placeOf(stack) {
  for (const line of String(stack ?? "").split("\n").slice(1)) {
    const found = line.match(/^\s*at (?:.*? \()?(.+?):(\d+):\d+\)?$/);
    if (!found) continue;
    let file = found[1];
    if (file.startsWith("file:")) {
      try {
        file = fileURLToPath(file);
      } catch {
        continue;
      }
    }
    if (!isAbsolute(file)) continue;
    const named = relative(ROOT, file);
    if (!named || named.startsWith("..") || isAbsolute(named)) continue;
    const place = `${named.split(sep).join("/")}:${found[2]}`;
    if (place.startsWith("lib/errors.js:") || !PLACE.test(place)) continue;
    return place;
  }
  return null;
}

const FORMS = {
  source: (value) => value === "plugin",
  failure: (value) => FAILURES.includes(value),
  engine: (value) => typeof value === "string" && /^[0-9]+\.[0-9]+\.[0-9]+$/.test(value),
  revision: (value) => value === null || (typeof value === "string" && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value)),
  subject: (value) => value === null || (typeof value === "string" && value.length <= 200 && prose(value) === value
    && value.split(" ").every((word) => PLACEHOLDER.test(word) || PROSE.test(word))),
  place: (value) => value === null || (typeof value === "string" && value.length <= 200 && PLACE.test(value)),
  remedy: (value) => value === null || pathless(value),
  text: (value) => value === null || (typeof value === "string" && value.length > 0 && value.length <= MOST_TEXT
    && value.split(/[ \n]/).every((word) => PLACEHOLDER.test(word) || PROSE.test(word))),
};

function pathless(value) {
  return typeof value === "string" && value.length > 0 && [...value].length <= 300 && !/[\u0000-\u001f\u007f\\]/.test(value)
    && value.split(" ").every((word) => !word.startsWith("~") && !(word.startsWith("/") && word.slice(1).includes("/")));
}

function admitted(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return false;
  const keys = Object.keys(report);
  const fields = keys.includes("text") ? FIELDS : FIELDS.filter((field) => field !== "text");
  return keys.length === fields.length && fields.every((field) => keys.includes(field) && FORMS[field](report[field]));
}

function engine() {
  return JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8")).version;
}

function raised(observed, remedyForReport) {
  return Object.assign(new Error(observed), { remedyForReport });
}

function built(failure, thrown, said, machine = machineWords(), told = null, text = null) {
  const error = thrown instanceof Error ? thrown : null;
  const fix = told ?? error?.remedyForReport ?? null;
  const remedy = pathless(fix) ? fix : null;
  const report = {
    source: "plugin",
    failure,
    engine: engine(),
    revision,
    subject: scrubbed(said !== undefined ? said : error ? error.message : thrown, machine),
    place: placeOf(error ? error.stack : new Error().stack),
    remedy,
    text: textOf(text, machine),
  };
  return admitted(report) ? report : null;
}

function folder() {
  return require("./home.js").homeFolder();
}

function heldLines(home) {
  let text;
  try {
    text = readFileSync(join(home, HELD), "utf8");
  } catch (thrown) {
    if (absent(thrown)) return [];
    throw thrown;
  }
  return text.split("\n").filter((line) => {
    try {
      return admitted(JSON.parse(line));
    } catch {
      return false;
    }
  });
}

function held(home = folder()) {
  return heldLines(home).map((line) => JSON.parse(line));
}

function rewrite(home, lines) {
  const draft = join(home, `${HELD}.${process.pid}`);
  writeFileSync(draft, lines.map((line) => `${line}\n`).join(""), { mode: 0o600 });
  renameSync(draft, join(home, HELD));
}

function hold(report, home = folder()) {
  if (!admitted(report)) return;
  mkdirSync(home, { recursive: true, mode: 0o700 });
  rewrite(home, [...heldLines(home), JSON.stringify(report)].slice(-MOST_HELD));
}

function report(failure, thrown, said, machine, remedy, text) {
  if (inside()) return;
  filed = true;
  try {
    const one = built(failure, thrown, said, machine, remedy, text);
    if (one) hold(one);
  } catch {
    return;
  }
}

function refusal(path, status, text) {
  if (!(status >= 400 && status < 500) || PERSONS_OWN.has(status)) return null;
  let first = null;
  try {
    const read = JSON.parse(text);
    first = Array.isArray(read?.refusals) ? read.refusals[0] ?? null : null;
  } catch {
    first = null;
  }
  if (status === 422 && first?.failure !== undefined && !BUILT_WRONG.has(first.failure)) return null;
  const route = String(path).split("/").filter(Boolean).join(" ");
  return {
    failure: "ask-refused",
    subject: `${route} refused${typeof first?.at === "string" ? ` at ${first.at}` : ""}`,
    remedy: pathless(first?.required) ? first.required : null,
  };
}

function quiet() {
  filed = true;
}

function askRefused(path, status, text) {
  quiet();
  try {
    const found = refusal(path, status, text);
    if (found) report(found.failure, undefined, found.subject, new Set(), found.remedy);
  } catch {
    return;
  }
}

function fresh(file) {
  try {
    return Date.now() - statSync(file).mtimeMs < STALE_MS;
  } catch (thrown) {
    if (absent(thrown)) return false;
    throw thrown;
  }
}

function removed(file) {
  try {
    unlinkSync(file);
  } catch (thrown) {
    if (!absent(thrown)) throw thrown;
  }
}

function claimed(lock) {
  try {
    closeSync(openSync(lock, "wx"));
    return true;
  } catch (thrown) {
    if (thrown?.code !== "EEXIST" || fresh(lock)) return false;
  }
  removed(lock);
  try {
    closeSync(openSync(lock, "wx"));
    return true;
  } catch {
    return false;
  }
}

function sendLater() {
  if (hooked || inside()) return;
  if (process.env.NODE_TEST_CONTEXT && !process.env.EVALATION_SERVER) return;
  const home = folder();
  const file = join(home, HELD);
  if (!existsSync(file) || statSync(file).size === 0) return;
  if (!existsSync(process.env.EVALATION_LOCAL || join(home, "evalation.local"))) return;
  if (fresh(join(home, SENDING))) return;
  const { spawn } = require("node:child_process");
  spawn(process.execPath, [__filename, "send"], {
    detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, EVALATION_REPORTING: "sending" },
  }).unref();
}

function sentOne(line) {
  const { runScript } = require("./script.js");
  try {
    runScript("evalation-ask", ["/report", line], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: SEND_MS, windowsHide: true });
    return "sent";
  } catch (thrown) {
    return /^refused 4[0-9][0-9]:/.test(String(thrown.stderr ?? "")) ? "refused" : "kept";
  }
}

function send(home = folder()) {
  const lock = join(home, SENDING);
  if (!claimed(lock)) return;
  try {
    const done = [];
    for (const line of heldLines(home)) {
      if (sentOne(line) === "kept") break;
      done.push(line);
    }
    const left = heldLines(home);
    for (const one of done) {
      const at = left.indexOf(one);
      if (at >= 0) left.splice(at, 1);
    }
    rewrite(home, left);
  } finally {
    removed(lock);
  }
}

function hook() {
  hooked = true;
  return module.exports;
}

function pinned(one) {
  if (one !== null && FORMS.revision(one)) revision = one;
}

if (!process[INSTALLED]) {
  process[INSTALLED] = true;
  process.on("uncaughtExceptionMonitor", (thrown, origin) => report(origin === "unhandledRejection" ? "unhandled-rejection" : "uncaught-error", thrown));
  const write = process.stderr.write;
  process.stderr.write = function kept(chunk, ...rest) {
    try {
      written = (written + String(chunk)).slice(-MOST_WRITTEN);
    } catch {
      written = "";
    }
    return write.call(this, chunk, ...rest);
  };
  process.on("exit", (code) => {
    try {
      if (code === 1 && !filed && written.trim()) report("input-refused", undefined, written.trim(), undefined, null, written);
      sendLater();
    } catch {
      return;
    }
  });
}

module.exports = { FAILURES, admitted, askRefused, built, hold, held, hook, machineWords, pinned, placeOf, quiet, raised, refusal, report, scrubbed, send, textOf };

if (require.main === module && process.argv[2] === "send") {
  try {
    send();
  } catch {
    process.exitCode = 0;
  }
}
