// What the plugin writes itself: the summary names only the severities it found, and the writing
// rules catch what a machine can decide while leaving quoted text alone.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { synthesise } = require("../lib/synthesise.js");
const { held, offences } = require("../lib/prose.js");

const findings = (mix) => mix.flatMap(([sev, n]) => Array.from({ length: n }, (_, i) => ({ id: `${sev}${i}`, sev, title: "t" })));
const said = (mix) => JSON.stringify(synthesise({ categories: [{ name: "Access", findings: findings(mix) }], hardness: {} }));

test("a summary with high findings and no critical ones never says critical and high", () => {
  const text = said([["High", 20], ["Medium", 9]]);
  assert.match(text, /Fixing the 20 high findings removes the serious risk/);
  assert.doesNotMatch(text, /critical and high|including 0 critical|Fixing the 0/);
});

test("one area is never named both the most and the least risky, and counts agree with their nouns", () => {
  const text = said([["High", 2]]);
  assert.doesNotMatch(text, /Access has the least risk/);
  assert.doesNotMatch(text, /All 1 disciplines/);
});

test("a summary names both ranks where both are there", () => {
  assert.match(said([["Critical", 1], ["High", 4]]), /Fixing the 1 critical and 4 high findings/);
});

test("the writing rules catch a comma followed by not, and leave quoted text alone", () => {
  assert.deepStrictEqual(held("This is a key, not an entry."), ["a flipped pair"]);
  assert.deepStrictEqual(held("The code says \"a, not b\" in one place."), []);
  assert.strictEqual(offences("  This is a key, not an entry.")[0].near, "This is a key, not a");
});
