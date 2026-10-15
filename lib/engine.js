"use strict";

const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { dated } = require("./changes.js");
const { raised } = require("./errors.js");
const { pluginHome } = require("./home.js");
const { line } = require("./run-say.js");

const pins = JSON.parse(readFileSync(join(__dirname, "print-engine.json"), "utf8"));
const KEYS = { darwin: { arm64: "mac-arm64", x64: "mac-x64" }, win32: { x64: "win64", arm64: "win64" }, linux: { x64: "linux64", arm64: "linux-arm64" } };
const THEN = { download: "download", mismatch: "retry", unpack: "retry", unzip: "unzip", write: "write" };
const FILE_CODES = new Set(["ENOSPC", "EACCES", "EPERM", "EROFS", "EDQUOT", "EMFILE", "ENOENT"]);
const DOWNLOAD_MS = 900_000;
const UNPACK_MS = 300_000;

function platform() {
  const key = process.env.EVALATION_PRINT_PLATFORM ?? KEYS[process.platform]?.[process.arch];
  return pins.platforms[key] ? key : null;
}

const root = () => join(pluginHome(), "print-engine");
const statePath = () => join(root(), "state.json");
const stage = (kind, detail) => Object.assign(raised(detail, null), { kind, detail });
const mb = () => Math.round(pins.platforms[platform()].bytes / 1e6);

const inside = (key) => join(`chrome-headless-shell-${key}`, process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell");

function executable(version = pins.version) {
  const key = platform();
  return key ? join(root(), version, inside(key)) : null;
}

const ready = (version = pins.version) => Boolean(executable(version)) && existsSync(executable(version));

function status() {
  return existsSync(statePath()) ? JSON.parse(readFileSync(statePath(), "utf8")) : {};
}

function keep(held) {
  mkdirSync(root(), { recursive: true, mode: 0o700 });
  writeFileSync(`${statePath()}.writing`, `${JSON.stringify(held, null, 2)}\n`);
  renameSync(`${statePath()}.writing`, statePath());
}

const decline = () => keep({ declined_on: new Date().toISOString() });
const failed = ({ kind, detail }) => keep({ failed: { kind, detail, on: new Date().toISOString() } });

const causeOf = ({ kind, detail }) => line(`ev-run.engine-cause-${kind}`, { detail });

function explained() {
  const held = status();
  if (!platform()) return { lead: line("ev-run.engine-lead-unsupported"), then: line("ev-run.engine-then-unsupported") };
  if (held.declined_on) return { lead: line("ev-run.engine-lead-declined", { date: dated(held.declined_on) }), then: line("ev-run.engine-then-ask") };
  if (held.failed) {
    return { lead: line("ev-run.engine-lead-failed", { date: dated(held.failed.on), cause: causeOf(held.failed) }), then: line(`ev-run.engine-then-${THEN[held.failed.kind]}`) };
  }
  return { lead: line("ev-run.engine-lead-missing"), then: line("ev-run.engine-then-ask") };
}

async function downloaded(url, into) {
  const hash = createHash("sha256");
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_MS) });
    if (!response.ok || !response.body) throw stage("download", `HTTP ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), async function* (source) {
      for await (const chunk of source) {
        hash.update(chunk);
        yield chunk;
      }
    }, createWriteStream(into));
  } catch (thrown) {
    if (thrown.kind) throw thrown;
    throw stage(FILE_CODES.has(thrown.code) ? "write" : "download", String(thrown.cause?.message ?? thrown.message).split("\n")[0]);
  }
  return hash.digest("hex");
}

function unpacked(zip, into) {
  const windows = process.platform === "win32";
  try {
    execFileSync(windows ? "powershell" : "unzip", windows
      ? ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:EVALATION_ZIP -DestinationPath $env:EVALATION_INTO -Force"]
      : ["-q", zip, "-d", into], {
      env: { ...process.env, EVALATION_ZIP: zip, EVALATION_INTO: into },
      stdio: ["ignore", "ignore", "pipe"],
      timeout: UNPACK_MS,
    });
  } catch (thrown) {
    throw stage("unzip", String(thrown.stderr ?? "").trim().split("\n").at(-1) || thrown.code || String(thrown.message).split("\n")[0]);
  }
}

async function fetchedAndPlaced({ source, pins: wanted }, key) {
  mkdirSync(root(), { recursive: true, mode: 0o700 });
  const work = mkdtempSync(join(root(), ".partial-"));
  try {
    const zip = join(work, "engine.zip");
    const got = await downloaded(`${source}/${wanted.version}/${key}/chrome-headless-shell-${key}.zip`, zip);
    if (got !== wanted.platforms[key].sha256) throw stage("mismatch", got);
    unpacked(zip, join(work, "unpacked"));
    if (!existsSync(join(work, "unpacked", inside(key)))) throw stage("unpack", key);
    if (!ready(wanted.version)) {
      try {
        rmSync(join(root(), wanted.version), { recursive: true, force: true });
        renameSync(join(work, "unpacked"), join(root(), wanted.version));
      } catch (thrown) {
        if (!ready(wanted.version)) throw stage("write", String(thrown.message).split("\n")[0]);
      }
    }
    if (!ready(wanted.version)) throw stage("unpack", key);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

async function install({ source = pins.source, pins: wanted = pins } = {}) {
  const key = platform();
  if (!key) throw Object.assign(raised(`no-print-engine platform=${process.platform}-${process.arch}`, null), { said: line("ev-run.engine-stopped", { lead: line("ev-run.engine-lead-unsupported"), then: line("ev-run.engine-then-unsupported") }) }); // say:allow: machine, a fault report no person reads
  try {
    await fetchedAndPlaced({ source, pins: wanted }, key);
  } catch (thrown) {
    const known = thrown.kind ? thrown : stage("write", String(thrown.message).split("\n")[0]);
    failed(known);
    throw Object.assign(raised(`print-engine-install kind=${known.kind}`, null), { // say:allow: machine, a fault report no person reads
      said: line("ev-run.engine-stopped", { lead: line("ev-run.engine-lead-failed", { date: dated(new Date().toISOString()), cause: causeOf(known) }), then: line(`ev-run.engine-then-${THEN[known.kind]}`) }),
    });
  }
  rmSync(statePath(), { force: true });
  for (const name of readdirSync(root())) {
    if (/^\d+(\.\d+){3}$/.test(name) && name !== wanted.version) rmSync(join(root(), name), { recursive: true, force: true });
  }
}

module.exports = { decline, executable, explained, failed, install, mb, pins, platform, ready, status };
