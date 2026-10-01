"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");

const { entries } = require("../lib/say.js");
const questions = require("../lib/questions.js");

const OURS = { attribution: "Evalation" };
const SERVED = [
  { pack: "cyber-insurance", body: { kind: "standard", title: "Evalation Cyber Insurance Risk", licence: OURS } },
  { pack: "soc2", body: { kind: "standard", title: "SOC 2 Trust Services Criteria" } },
  { pack: "iso27001", body: { kind: "standard", title: "ISO 27001" } },
];

test("a pack typed at the pack question is matched by handle or title, and a published standard is answered with what the person can do", () => {
  const { packNamed } = questions;
  assert.strictEqual(typeof packNamed, "function");
  const soc = packNamed(SERVED, "soc2");
  assert.deepStrictEqual([soc.kind, soc.pack], ["keeps-clauses", "soc2"]);
  assert.match(soc.said, /^SOC 2 Trust Services Criteria keeps its publisher's clauses, so your questions can extend one of your Evalation packs instead\.$/);
  assert.deepStrictEqual([packNamed(SERVED, "Cyber insurance").kind, packNamed(SERVED, "Cyber insurance").pack], ["extends", "cyber-insurance"]);
  assert.strictEqual(packNamed(SERVED, "ISO 27001").kind, "keeps-clauses");
  assert.strictEqual(packNamed(SERVED, "something else").kind, "unknown");
});

test("the pack question offers only packs the questions can extend, and nothing is said about the rest before it", () => {
  const asked = questions.packQuestion(SERVED);
  assert.strictEqual(asked, "only: Evalation Cyber Insurance Risk", "SOC 2 and ISO 27001 keep their publisher's clauses, so only the one extensible pack is offered, and nothing is asked");
  const at = mkdtempSync(join(tmpdir(), "evalation-cando-"));
  writeFileSync(join(at, "packs.json"), JSON.stringify({ packs: ["soc2"] }));
  const { packsSaid } = require("../bin/evalation-questions");
  assert.doesNotMatch(packsSaid(at, () => ({ packs: SERVED })), /published standards/i);
  const command = readFileSync(join(__dirname, "..", "commands", "ev-questions.md"), "utf8").replace(/\s+/g, " ");
  assert.match(command, /evalation-questions pack-named/);
  assert.doesNotMatch(command, /above the question/);
});

test("no line tells the person what they can't do before they ask for it", () => {
  const held = entries();
  assert.strictEqual(held["ev-activate.other-ways"], undefined);
  assert.strictEqual(held["ev-run.found-copy"], undefined);
  assert.match(held["ev-activate.other-way"].say, /^You can sign in with Google or Microsoft/);
  assert.doesNotMatch(held["ev-remove.uninstall"].say, /cannot/);
  assert.strictEqual(held["ev-questions.no-pack-takes"], undefined, "every question set extends a pack, so there is no line for taking none");
});
