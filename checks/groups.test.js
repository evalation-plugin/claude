"use strict";

const test = require("node:test");
const assert = require("node:assert");
require("./fixture.js");

const SHOWN = 30000;

const item = (n, at) => ({ find: `Thing ${at} entry ${n} asks for, written the way a long pack item reads, naming what a person would look for in the code ${"and what else it means ".repeat(6)}`, proof: "runs" });
const entry = (n) => ({
  identifier: `INV${String(n).padStart(2, "0")}`,
  title: `Question ${n}`,
  intent: `Does the repository hold everything question ${n} names, ${"each part of it spelled out ".repeat(8)}?`,
  section: "S1",
  locator: `Section 1 > Question ${n}`,
  looks_for: Array.from({ length: 7 }, (_, at) => item(n, at + 1)),
});
const runOf = (count) => ({
  packs: [{ pack: "investment-diligence", body: { kind: "standard" } }],
  to_read: [{ pack: "investment-diligence", entries: Array.from({ length: count }, (_, at) => entry(at + 1)) }],
});

test("every group a reader is handed prints in full, within what the host shows in one read", () => {
  const findings = require("../bin/evalation-findings");
  assert.strictEqual(typeof findings.groupsOf, "function", "the groups a run splits into can be asked for");
  const run = runOf(34);
  const groups = findings.groupsOf(run);
  const printed = groups.map((one) => JSON.stringify(findings.groupOf(run, one.group), null, 2).length + 1);
  assert.ok(printed.every((size) => size <= SHOWN), `a group printed ${Math.max(...printed)} characters, past the ${SHOWN} the host shows in one read`);
  assert.deepStrictEqual(groups.flatMap((one) => one.entries.map((each) => each.identifier)), run.to_read[0].entries.map((each) => each.identifier),
    "every question is read once, in the pack's own order");
  assert.ok(groups.every((one) => one.entries.length <= 25), "no group holds more than 25 questions");
});

test("a small pack stays one group", () => {
  const findings = require("../bin/evalation-findings");
  const run = runOf(3);
  assert.strictEqual(findings.groupsOf(run).length, 1);
});
