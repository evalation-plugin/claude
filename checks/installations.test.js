"use strict";

require("./fixture.js");
const test = require("node:test");
const assert = require("node:assert");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

process.env.EVALATION_KEY_STORE = "file";
process.env.EVALATION_HOME = mkdtempSync(join(tmpdir(), "evalation-keys-"));

const root = join(__dirname, "..");
const store = require(join(root, "bin", "evalation-store"));
const activate = require(join(root, "bin", "evalation-activate"));

test("two installations keep their keys apart, and a held key is never written over", () => {
  const first = activate.slot("install-1111111111", "installation-key");
  const second = activate.slot("install-2222222222", "installation-key");
  assert.notStrictEqual(first, second, "two installations name one place for their keys, so the second activation takes the first one's");

  store.keep("evalation", first, "the-first-installations-key");
  store.keep("evalation", second, "the-second-installations-key");
  assert.strictEqual(store.held("evalation", first), "the-first-installations-key", "writing the second installation's key changed what the first one holds");

  assert.throws(() => store.keepUntaken("evalation", first, "a-different-key"), "a key was written over a name already holding one");
  assert.strictEqual(store.held("evalation", first), "the-first-installations-key", "the refused write changed what was there anyway");

  assert.doesNotThrow(() => store.keepUntaken("evalation", first, "the-first-installations-key"), "writing back the value already held was refused, so an interrupted activation cannot finish");
  assert.doesNotThrow(() => store.keepUntaken("evalation", activate.slot("install-3333333333", "installation-key"), "a-third-key"), "a free name was refused");
});
