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
  assert.match(flat(ACCOUNT), /`sign-in: damaged`[^`]*"This machine's Evalation sign-in is damaged\. Your pack credits and reports are kept\. Run \/ev-activate to sign in again\."/);
  assert.match(flat(ACCOUNT), /`state: unreachable`[^`]*If it still fails, contact support@evalation\.ai\."/);
});

test("the account reply is worded exactly for each case, says the credits once, and says what a pack is in the words /ev-packs uses", () => {
  const words = flat(ACCOUNT);
  const packLine = flat(read("ev-packs.md")).match(/what a pack is, in these words: "([^"]+)"/)[1];
  assert.ok(words.includes(packLine), packLine);
  assert.match(words, /`state: not-set-up` alone: say "This machine is not set up for Evalation yet\. Run \/ev-start to set it up\."/);
  assert.match(words, /"You have <N> pack credits\."/);
  assert.match(words, /"You chose <titles>\. A run against them uses <M> pack credits, one for each pack it reads\. Run \/ev-run in a repository to check it against them\."/);
  assert.doesNotMatch(words, /and how many are left/);
  assert.match(words, /In place of the line above,/);
  assert.match(words, /<N> is 0[^"]*"To buy pack credits, email support@evalation\.ai\."/);
});

test("setting up opens and closes in fixed words, and names no pack credit before a pack is explained", () => {
  const words = flat(START);
  const step = (n) => words.slice(words.indexOf(` ${n}. **`), words.indexOf(` ${n + 1}. **`));
  assert.match(step(1), /"Evalation checks your code against the security and compliance standards you choose, and writes reports on what it finds\."/);
  assert.match(step(2), /`sign-in: damaged`[^"]*"This machine needs to sign in to Evalation again\. Your pack credits and reports are kept\."/);
  assert.match(step(3), /Say: "Signing in sets up your Evalation account, or links this machine to it if you already have one\."/);
  assert.doesNotMatch(step(3), /pack credit|in your own words/);
  assert.match(step(4), /"You are set up to check code against <titles>\."/);
  assert.match(step(5), /0 pack credits[^"]*"To buy pack credits, email support@evalation\.ai\."/);
  assert.match(words, /Close in up to four sentences/);
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
