"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
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
