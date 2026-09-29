"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readdirSync } = require("node:fs");
const { platform, tmpdir } = require("node:os");
const { join } = require("node:path");
const { print } = require("../lib/print.js");
const { stores } = require("../bin/evalation-store");

const BIN = join(__dirname, "..", "bin");
const script = (name, args, env = {}) =>
  spawnSync(process.execPath, [join(BIN, name), ...args], { encoding: "utf8", env: { ...process.env, ...env } });

test("every plugin script is a Node program, so it runs wherever Claude Code does", () => {
  const unparsed = readdirSync(BIN).filter((name) => spawnSync(process.execPath, ["--check", join(BIN, name)]).status !== 0);
  assert.deepStrictEqual(unparsed, []);
});

test("the pack selection is kept and shown back", () => {
  const home = mkdtempSync(join(tmpdir(), "evalation-packs-"));
  const set = script("evalation-packs", ["set", "soc2", "iso27001"], { EVALATION_PLUGIN_HOME: home });
  assert.strictEqual(set.status, 0, set.stderr);
  const shown = JSON.parse(script("evalation-packs", ["show"], { EVALATION_PLUGIN_HOME: home }).stdout);
  assert.deepStrictEqual(shown.packs, ["soc2", "iso27001"]);
  assert.match(shown.chosen, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

test("status on a machine with no settings says it is not set up", () => {
  const ran = script("evalation-status", [], { EVALATION_LOCAL: join(tmpdir(), "evalation-no-such-settings") });
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.match(ran.stdout, /^state: not-set-up\n/);
});

test("a page that cannot be signed carries the ask's own reason", () => {
  const folder = mkdtempSync(join(tmpdir(), "evalation-sign-"));
  const previous = process.env.EVALATION_LOCAL;
  process.env.EVALATION_LOCAL = join(tmpdir(), "evalation-no-such-settings");
  try {
    const html = `<!doctype html><meta charset="utf-8"><body><p>A page.</p></body>`;
    const done = print(html, join(folder, "page.html"), join(folder, "page.pdf"), { run: "run-check" });
    assert.strictEqual(done.printed, true);
    assert.strictEqual(done.signed, false);
    assert.match(done.unsigned, /^no-settings:/);
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
