"use strict";

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { createHash } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readdirSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { crc32 } = require("node:zlib");
const { home } = require("./fixture.js");
const engine = require("../lib/engine.js");
const { print, unprintedSaid, unwritten } = require("../lib/print.js");

const BIN = join(__dirname, "..", "bin", "evalation-print-engine");
const KEY = engine.platform();
const EXE = process.platform === "win32" ? "chrome-headless-shell.exe" : "chrome-headless-shell";
const STUB = [
  "#!/usr/bin/env node",
  "const { appendFileSync, writeFileSync } = require(\"node:fs\");",
  "const args = process.argv.slice(2);",
  "appendFileSync(process.env.STUB_LOG, JSON.stringify(args) + \"\\n\");",
  "const out = args.find((one) => one.startsWith(\"--print-to-pdf=\"));",
  "if (out) writeFileSync(out.slice(15), \"%PDF-1.4 stub\");",
  "else process.stdout.write('<html><body><div class=\"sheet\"><p>Hello</p></div></body></html>');",
  "",
].join("\n");

function zipped(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, data, mode } of files) {
    const label = Buffer.from(name);
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt32LE(crc32(data), 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(label.length, 26);
    const entry = Buffer.concat([head, label, data]);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(0x031e, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt32LE(crc32(data), 16);
    dir.writeUInt32LE(data.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(label.length, 28);
    dir.writeUInt32LE((mode << 16) >>> 0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, label]));
    parts.push(entry);
    offset += entry.length;
  }
  const centre = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centre.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centre, end]);
}

const archive = () => zipped([{ name: `chrome-headless-shell-${KEY}/${EXE}`, data: Buffer.from(STUB), mode: 0o100755 }]);
const pinned = (body, sha = createHash("sha256").update(body).digest("hex")) => ({
  version: engine.pins.version, platforms: { [KEY]: { sha256: sha, bytes: body.length } },
});

async function serving(body) {
  const asked = [];
  const server = http.createServer((request, response) => {
    asked.push(request.url);
    response.end(body);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  return { source: `http://127.0.0.1:${server.address().port}`, asked, close: () => server.close() };
}

async function installed(body = archive(), pins = pinned(body)) {
  const server = await serving(body);
  try {
    await engine.install({ source: server.source, pins });
  } finally {
    server.close();
  }
  return server;
}

const clean = () => rmSync(join(home, "print-engine"), { recursive: true, force: true });
const cli = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: home } });
const rejected = async (work) => {
  try {
    await work();
  } catch (caught) {
    return caught;
  }
  return assert.fail("the install should have refused");
};

test("every platform carries a pinned version and a SHA-256 of its download", () => {
  assert.match(engine.pins.version, /^\d+(\.\d+){3}$/);
  for (const key of ["mac-arm64", "mac-x64", "win64", "linux64", "linux-arm64"]) {
    assert.match(engine.pins.platforms[key].sha256, /^[0-9a-f]{64}$/, key);
    assert.ok(engine.pins.platforms[key].bytes > 50_000_000, key);
  }
});

test("a download matching its fingerprint is unpacked into the plugin's own folder and ready", async (t) => {
  if (!KEY) return t.skip("no print engine for this platform");
  clean();
  const server = await installed();
  assert.strictEqual(engine.ready(), true);
  assert.ok(engine.executable().startsWith(join(home, "print-engine")));
  assert.deepStrictEqual(server.asked, [`/${engine.pins.version}/${KEY}/chrome-headless-shell-${KEY}.zip`]);
  assert.deepStrictEqual(readdirSync(join(home, "print-engine")), [engine.pins.version]);
});

test("a download that does not match its fingerprint is refused, kept nowhere, and says what to do", async (t) => {
  if (!KEY) return t.skip("no print engine for this platform");
  clean();
  const body = archive();
  const thrown = await rejected(() => installed(body, pinned(body, "0".repeat(64))));
  assert.match(thrown.said, /fingerprint/);
  assert.match(thrown.said, /Run \/ev-run print to try again/);
  assert.match(thrown.said, /support@evalation\.ai/);
  assert.strictEqual(engine.ready(), false);
  assert.deepStrictEqual(readdirSync(join(home, "print-engine")), ["state.json"]);
  assert.strictEqual(engine.status().failed.kind, "mismatch");
});

test("a download server that cannot be reached is recorded as a failed download with the machine's reason", async (t) => {
  if (!KEY) return t.skip("no print engine for this platform");
  clean();
  const thrown = await rejected(() => engine.install({ source: "http://127.0.0.1:1", pins: pinned(archive()) }));
  assert.match(thrown.said, /Google's download server couldn't be reached/);
  assert.match(thrown.said, /Check this machine is online/);
  assert.strictEqual(engine.status().failed.kind, "download");
  assert.ok(engine.status().failed.detail.length > 0);
});

test("a machine with no unpack tool names the tool to install", async (t) => {
  if (!KEY || process.platform === "win32") return t.skip("the unpack tool here is PowerShell");
  clean();
  const path = process.env.PATH;
  process.env.PATH = mkdtempSync(join(tmpdir(), "evalation-no-unzip-"));
  let thrown;
  try {
    thrown = await rejected(() => installed());
  } finally {
    process.env.PATH = path;
  }
  assert.match(thrown.said, /Install the unzip tool/);
  assert.strictEqual(engine.status().failed.kind, "unzip");
  assert.strictEqual(engine.ready(), false);
});

test("a report prints through the downloaded engine and nowhere else", async (t) => {
  if (!KEY || process.platform === "win32") return t.skip("the stand-in engine is a script");
  clean();
  await installed();
  const folder = mkdtempSync(join(tmpdir(), "evalation-engine-print-"));
  process.env.STUB_LOG = join(folder, "log");
  const into = join(folder, "r.pdf");
  const done = print("<html><body><p>Hello</p></body></html>", join(folder, "r.html"), into, null, []);
  assert.strictEqual(done.printed, true);
  const runs = readFileSync(process.env.STUB_LOG, "utf8").trim().split("\n").map((one) => JSON.parse(one));
  assert.strictEqual(runs.length, 2);
  assert.ok(runs[1].includes(`--print-to-pdf=${into}`));
  assert.ok(runs.every((args) => args.includes("--no-sandbox")));
});

test("with no engine downloaded a report is not printed, whatever browser the machine holds", () => {
  clean();
  const folder = mkdtempSync(join(tmpdir(), "evalation-no-engine-"));
  const done = print("<html><body><p>Hello</p></body></html>", join(folder, "r.html"), join(folder, "r.pdf"), null, []);
  assert.strictEqual(done.printed, false);
  assert.deepStrictEqual(readdirSync(folder), ["r.html"]);
});

test("the unprinted line names its cause and what to do, and no browser to install", () => {
  clean();
  const said = () => unprintedSaid(["/r/A Pack.html"], "/r");
  assert.match(said(), /^The print engine hasn't been downloaded, so the reports aren't signed\. Open each of these in a browser and print it to PDF: A Pack\.html, in \/r\. For signed copies, run \/ev-run print and choose to download it\. Printing again uses no pack credits\.$/);
  engine.decline();
  assert.match(said(), /^You chose not to download the print engine on \d+ \w+ \d{4}, so the reports aren't signed\./);
  engine.failed({ kind: "download", detail: "getaddrinfo ENOTFOUND" });
  assert.match(said(), /^The print engine couldn't be downloaded on \d+ \w+ \d{4} because Google's download server couldn't be reached \(getaddrinfo ENOTFOUND\), so the reports aren't signed\./);
  assert.match(said(), /Check this machine is online, then run \/ev-run print for signed copies\./);
  for (const one of ["", "declined", "failed"]) assert.doesNotMatch(said(), /Chrome|Chromium|Edge/, one);
});

test("the command asks once with the size and the server, records a no, and asks nothing once the engine is ready", async (t) => {
  if (!KEY) return t.skip("no print engine for this platform");
  clean();
  const shown = JSON.parse(cli("show").stdout);
  assert.strictEqual(shown.ready, false);
  const question = shown.asks.questions[0];
  assert.match(question.question, /about \d+ MB, from Google's download server/);
  assert.deepStrictEqual(question.options.map((one) => one.label), ["Download it", "Print without it"]);
  assert.strictEqual(shown.said, null);
  assert.strictEqual(cli("decline").status, 0);
  assert.match(engine.status().declined_on, /^\d{4}-\d{2}-\d{2}T/);
  await installed();
  assert.strictEqual(engine.status().declined_on ?? null, null);
  const again = JSON.parse(cli("show").stdout);
  assert.deepStrictEqual({ ready: again.ready, asks: again.asks, said: again.said }, { ready: true, asks: null, said: null });
});

test("a platform with no engine says so, asks nothing and gives a way on", () => {
  const out = JSON.parse(spawnSync(process.execPath, [BIN, "show"], {
    encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_PRINT_PLATFORM: "none" },
  }).stdout);
  assert.strictEqual(out.asks, null);
  assert.match(out.said, /^Evalation has no print engine for this kind of computer, so the reports will come as web pages that aren't signed\. Email support@evalation\.ai to ask for one\.$/);
});

test("a print that runs long names the print engine and not a browser", () => {
  const text = unwritten(Object.assign(new Error("x"), { code: "ETIMEDOUT", file: "/r/A Pack.pdf" }));
  assert.match(text, /because the print engine took longer than two minutes to print it/);
});
