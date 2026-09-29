"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readdirSync } = require("node:fs");
const { platform, tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { print } = require("../lib/print.js");
const { stores } = require("../bin/evalation-store");

const BIN = join(__dirname, "..", "bin");
const script = (name, args, env = {}) =>
  spawnSync(process.execPath, [join(BIN, name), ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("the file key store reads its own key on Windows, where every file reports mode 666", () => {
  const { file } = require("../bin/evalation-store");
  file.keep("evalation-check", "windows-mode", "a-key");
  const { chmodSync } = require("node:fs");
  const { home } = require("./fixture.js");
  chmodSync(join(home, "keys", "evalation-check.windows-mode"), 0o666);
  const was = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: "win32" });
  try {
    assert.strictEqual(file.held("evalation-check", "windows-mode"), "a-key");
  } finally {
    Object.defineProperty(process, "platform", was);
  }
  if (process.platform !== "win32") assert.throws(() => file.held("evalation-check", "windows-mode"), /somebody other than you can read/, "elsewhere a readable key is still refused");
});

test("every plugin script is a Node program, so it runs wherever Claude Code does", () => {
  const unparsed = readdirSync(BIN).filter((name) => spawnSync(process.execPath, ["--check", join(BIN, name)]).status !== 0);
  assert.deepStrictEqual(unparsed, []);
});

test("sign-in keeps the email the person signed in with, and status names it", () => {
  const { settingsOf } = require("../bin/evalation-activate");
  const kept = settingsOf({ installation: "install-1", email: "you@example.com" });
  assert.strictEqual(kept.signed_in_as, "you@example.com");
  const file = join(mkdtempSync(join(tmpdir(), "evalation-signed-")), "evalation.local");
  require("node:fs").writeFileSync(file, JSON.stringify(kept));
  const ran = script("evalation-status", [], { EVALATION_LOCAL: file });
  assert.match(ran.stdout, /^signed in as: you@example\.com$/m);
  assert.match(ran.stdout, /^state: /);
});

test("status on settings that cannot be read still names a state and shows no stack trace", () => {
  const file = join(mkdtempSync(join(tmpdir(), "evalation-broken-")), "evalation.local");
  require("node:fs").writeFileSync(file, "{");
  const ran = script("evalation-status", [], { EVALATION_LOCAL: file });
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.strictEqual(ran.stdout, "state: not-set-up\nsign-in: damaged\n", "damaged settings are fixed by signing in again, so status says not set up and names the damage");
});

test("status on a machine with no settings says it is not set up, and gives the detail only when asked", () => {
  const env = { EVALATION_LOCAL: join(tmpdir(), "evalation-no-such-settings") };
  const ran = script("evalation-status", [], env);
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.strictEqual(ran.stdout, "state: not-set-up\n");
  assert.match(script("evalation-status", ["--reason"], env).stdout, /^detail: no-settings:/m);
});

test("status on settings whose sign-in key is gone names the damage, with no store command or path", () => {
  const home = mkdtempSync(join(tmpdir(), "evalation-damaged-"));
  const file = join(home, "evalation.local");
  require("node:fs").writeFileSync(file, JSON.stringify({ installation: "box", secrets: { installation_key: "store:evalation-plugin/box.installation-key" } }));
  const ran = script("evalation-status", [], { EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: file, EVALATION_KEY_STORE: "file" });
  assert.strictEqual(ran.stdout, "state: not-set-up\nsign-in: damaged\n");
});

test("status tells a clock fault apart from a machine the server no longer accepts and from access that ended", async () => {
  const { createServer } = require("node:http");
  const { mkdirSync, writeFileSync } = require("node:fs");
  const home = mkdtempSync(join(tmpdir(), "evalation-refused-"));
  mkdirSync(join(home, "keys"));
  writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), Buffer.alloc(32, 7).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: { installation_key: "store:evalation-plugin/box.installation-key" } }));
  const cases = [
    [401, "the ask was made 400 seconds from now, and a proof holds for 300", "clock"],
    [401, "nothing we issued signed this, either because no installation answers to that name", "refused"],
    [402, "the entitlement for this installation has ended, so nothing further can be served", "ended"],
    [422, "no revision has been released", "other"],
  ];
  for (const [status, observed, reason] of cases) {
    const server = createServer((req, res) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ refusals: [{ at: "installation box", observed, required: "see the server", failure: "not-live" }] }));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const ran = await new Promise((resolve) => {
      const child = require("node:child_process").spawn(process.execPath, [join(BIN, "evalation-status")], { env: { ...process.env,
        EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
        EVALATION_SERVER: `http://127.0.0.1:${server.address().port}` } });
      let stdout = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.on("exit", () => resolve(stdout));
    });
    server.close();
    assert.strictEqual(ran, `state: not-live\nreason: ${reason}\n`, observed);
  }
});

test("status never tells the person about a seat or a released revision", () => {
  const ran = script("evalation-status", [], { EVALATION_LOCAL: join(tmpdir(), "evalation-no-such-settings") });
  assert.doesNotMatch(ran.stdout, /seat|revision/i);
  assert.doesNotMatch(require("node:fs").readFileSync(join(BIN, "evalation-status"), "utf8"), /seat|revision/i);
});

test("a page that cannot be signed carries the reason in plain words", () => {
  const folder = mkdtempSync(join(tmpdir(), "evalation-sign-"));
  const previous = process.env.EVALATION_LOCAL;
  process.env.EVALATION_LOCAL = join(tmpdir(), "evalation-no-such-settings");
  try {
    const html = `<!doctype html><meta charset="utf-8"><body><p>A page.</p></body>`;
    const done = print(html, join(folder, "page.html"), join(folder, "page.pdf"), { run: "run-check" });
    assert.strictEqual(done.printed, true);
    assert.strictEqual(done.signed, false);
    assert.strictEqual(done.unsigned, "this machine is not signed in to Evalation");
  } finally {
    if (previous === undefined) delete process.env.EVALATION_LOCAL;
    else process.env.EVALATION_LOCAL = previous;
  }
});

test("the operating system's key store reads back the key it keeps", (t) => {
  const store = stores[platform()];
  if (!store || !store.reachable()) return t.skip(`${platform()} has no key store reachable here`);
  const account = `probe-${process.pid}`;
  store.keep("evalation-check", account, "a-value-only-this-check-writes");
  try {
    assert.strictEqual(store.held("evalation-check", account), "a-value-only-this-check-writes");
  } finally {
    store.forget("evalation-check", account);
  }
});
