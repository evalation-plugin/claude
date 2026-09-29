"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
require("./fixture.js");
const { held } = require("../lib/prose.js");

const read = (name) => readFileSync(join(__dirname, "..", "commands", name), "utf8");
const START = read("ev-start.md");
const ACCOUNT = read("ev-account.md");
const flat = (text) => text.replace(/\s+/g, " ");

test("every state bullet starts on its own line, so none renders inside the one above it", () => {
  for (const [name, text] of [["ev-start.md", START], ["ev-account.md", ACCOUNT]]) {
    assert.deepStrictEqual(text.split("\n").filter((line) => /\S.*\s- \*{0,2}`state:/.test(line)), [], name);
  }
});

test("each status the machine can be in has its own plain line, and a refused machine is sent to support", () => {
  for (const [name, text] of [["ev-start.md", START], ["ev-account.md", ACCOUNT]]) {
    const words = flat(text);
    assert.match(words, /`reason: clock`[^`]*clock to the right time/, name);
    assert.match(words, /`reason: refused`[^`]*support@evalation\.ai/, name);
    assert.match(words, /`reason: ended`[^`]*support@evalation\.ai/, name);
    assert.doesNotMatch(words, /never in a file/, name);
  }
  assert.match(flat(ACCOUNT), /`sign-in: damaged`[^`]*"This machine's Evalation sign-in is damaged\. Run \/ev-activate to sign in again\."/);
});

test("the close of setting up hides git's error outside a repository and has an ending for no packs", () => {
  const words = flat(START);
  assert.match(words, /`git rev-parse --is-inside-work-tree 2>\/dev\/null`/);
  assert.doesNotMatch(words, /`git rev-parse --is-inside-work-tree`/);
  assert.match(words, /<M> is 0[^"]*"Run \/ev-packs when you are ready to choose what to check against\."/);
});

test("every line the two commands quote passes the plugin's own wording rules", () => {
  const quoted = [START, ACCOUNT].flatMap((text) => [...flat(text.replace(/```[\s\S]*?```/g, "")).matchAll(/"([^"`$]{12,300})"/g)].map((one) => one[1]));
  assert.deepStrictEqual(quoted.filter((line) => held(line).length > 0), []);
});
