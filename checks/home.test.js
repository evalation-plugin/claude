"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { moved } = require("../lib/home.js");

function shared() {
  const at = mkdtempSync(join(tmpdir(), "evalation-shared-"));
  const old = join(at, ".evalation");
  for (const one of ["findings", "scans", "questions", "solutions", "keys", "engines", "memory"]) {
    mkdirSync(join(old, one), { recursive: true });
    writeFileSync(join(old, one, "held.json"), `"${one}"`);
  }
  writeFileSync(join(old, "evalation.local"), JSON.stringify({ schema: "evalation.local.v1", installation: "install-1" }));
  writeFileSync(join(old, "packs.json"), '{"packs":["soc2"]}');
  writeFileSync(join(old, "model-pins.json"), "{}");
  return { old, fresh: join(at, ".evalation-plugin") };
}

test("the plugin's own files move to its own folder, and the engine's stay where they are", () => {
  const { old, fresh } = shared();
  assert.deepStrictEqual(moved(old, fresh).sort(), ["evalation.local", "findings", "keys", "packs.json", "questions", "scans", "solutions"]);
  for (const one of ["findings", "scans", "questions", "solutions", "keys"]) {
    assert.strictEqual(readFileSync(join(fresh, one, "held.json"), "utf8"), `"${one}"`);
    assert.strictEqual(existsSync(join(old, one)), false);
  }
  assert.strictEqual(JSON.parse(readFileSync(join(fresh, "evalation.local"), "utf8")).installation, "install-1");
  for (const one of ["engines", "memory", "model-pins.json"]) assert.ok(existsSync(join(old, one)), `${one} stays with the engine`);
  assert.strictEqual(existsSync(join(fresh, "engines")), false);
});

test("every check that loads the plugin's code points it at a throwaway folder first, so no check moves or reads a person's own", () => {
  const { readdirSync } = require("node:fs");
  const unsafe = readdirSync(__dirname).filter((one) => one.endsWith(".test.js")).filter((one) => {
    const text = readFileSync(join(__dirname, one), "utf8");
    const plugin = text.search(/require\("\.\.\/(bin|lib)\//);
    const fixture = text.search(/require\("\.\/fixture\.js"\)/);
    return plugin >= 0 && (fixture < 0 || fixture > plugin);
  });
  assert.deepStrictEqual(unsafe, []);
});

test("a command a check starts is refused a person's own folder, even where the check never loaded the fixture", () => {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env, NODE_TEST_CONTEXT: "child-v8" };
  delete env.EVALATION_PLUGIN_HOME;
  const ran = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(join(__dirname, "..", "lib", "home.js"))}).pluginHome()`], { env, encoding: "utf8" });
  assert.notStrictEqual(ran.status, 0);
  assert.match(ran.stderr, /a check reached a person's own folder/);
});

function signedInUnderTheEngineName() {
  const home = mkdtempSync(join(tmpdir(), "evalation-keys-"));
  mkdirSync(join(home, "keys"), { mode: 0o700 });
  const keys = { "evalation.box.installation-key": "install", "evalation.box.receiving-key": "receive",
    "evalation.box.receiving-key-previous": "before", "evalation.engine-box.installation-key": "the engine's own" };
  for (const [name, value] of Object.entries(keys)) writeFileSync(join(home, "keys", name), value, { mode: 0o600 });
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: {
    installation_key: "store:evalation/box.installation-key", receiving_key: "keychain:evalation/box.receiving-key" } }));
  return home;
}

function started(home) {
  const { spawnSync } = require("node:child_process");
  const env = { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_KEY_STORE: "file", EVALATION_SERVER: "http://127.0.0.1:9" };
  delete env.EVALATION_LOCAL;
  return spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-status")], { env, encoding: "utf8" });
}

const keyIn = (home, name) => (existsSync(join(home, "keys", name)) ? readFileSync(join(home, "keys", name), "utf8") : null);

test("this installation's own keys are copied from the engine's store name to the plugin's, the originals kept for any other settings naming them", () => {
  const home = signedInUnderTheEngineName();
  started(home);
  const settings = JSON.parse(readFileSync(join(home, "evalation.local"), "utf8"));
  assert.deepStrictEqual(settings.secrets, { installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" });
  assert.strictEqual(settings.installation, "box");
  assert.deepStrictEqual(["installation-key", "receiving-key", "receiving-key-previous"].map((one) => keyIn(home, `evalation-plugin.box.${one}`)), ["install", "receive", "before"]);
  assert.deepStrictEqual(["installation-key", "receiving-key", "receiving-key-previous"].map((one) => keyIn(home, `evalation.box.${one}`)), ["install", "receive", "before"]);
  assert.strictEqual(keyIn(home, "evalation.engine-box.installation-key"), "the engine's own");
});

test("a key already held under the plugin's name stops the move, and the settings and old keys stay as they were", () => {
  const home = signedInUnderTheEngineName();
  writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), "somebody else's", { mode: 0o600 });
  const before = readFileSync(join(home, "evalation.local"), "utf8");
  started(home);
  assert.strictEqual(readFileSync(join(home, "evalation.local"), "utf8"), before);
  assert.strictEqual(keyIn(home, "evalation.box.installation-key"), "install");
  assert.strictEqual(keyIn(home, "evalation.box.receiving-key"), "receive");
  assert.strictEqual(keyIn(home, "evalation-plugin.box.installation-key"), "somebody else's");
});

test("a folder already moved is never moved again, and a machine with nothing to move is left alone", () => {
  const { old, fresh } = shared();
  moved(old, fresh);
  mkdirSync(join(old, "findings"));
  writeFileSync(join(old, "findings", "engine-owned.json"), "{}");
  assert.deepStrictEqual(moved(old, fresh), []);
  assert.ok(existsSync(join(old, "findings", "engine-owned.json")));
  const empty = mkdtempSync(join(tmpdir(), "evalation-none-"));
  assert.deepStrictEqual(moved(join(empty, ".evalation"), join(empty, ".evalation-plugin")), []);
  assert.strictEqual(existsSync(join(empty, ".evalation-plugin")), false);
});
