// Authorship in git history, measured and never judged: how concentrated the last twelve months of
// commits are in one person, as shares with no name or address kept.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository } = require("./fixture.js");
const { authorship, scan } = require("../bin/evalation-scan");
const { phasesRead } = require("../lib/scans.js");

const log = (counts) => Object.entries(counts).flatMap(([who, n]) => Array(n).fill(who)).join("\n");

test("one person making most of a year's commits is a finding, with the share and no name", () => {
  const found = authorship(log({ "a@x.io": 8, "b@x.io": 2 }));
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].severity, "high");
  assert.match(found[0].body, /the most active person made 80% of them, across 2 people/);
  assert.doesNotMatch(JSON.stringify(found), /x\.io/);
});

test("a history spread across people finds nothing, and a bare majority is medium", () => {
  assert.deepStrictEqual(authorship(log({ a: 3, b: 3, c: 2, d: 2 })), []);
  assert.strictEqual(authorship(log({ a: 6, b: 4 }))[0].severity, "medium");
});

test("a single author is high, and a year with no commits says so", () => {
  assert.match(authorship(log({ a: 5 }))[0].title, /one person/);
  assert.match(authorship("")[0].body, /No commits/);
});

test("a history card says how to spread the work, never to change code", () => {
  const { scanResults } = require("../lib/sheet.js");
  const scans = require("../lib/scans.js");
  const { consequences, remedies } = require("../lib/weaknesses.js");
  const html = scanResults({ findings: authorship(log({ a: 9, b: 1 })), intro: "x", tagWord: "", tagOf: () => [],
    phaseOf: scans.named, consequences, remedies, upgradeTo: scans.upgradeTo, compared: scans.compared,
    compatible: scans.compatible, cardOf: scans.cardOf });
  const todo = html.match(/<b>What to do<\/b>([^<]*)/)[1];
  assert.match(todo, /second person/);
  assert.doesNotMatch(todo, /Change the code/);
});

test("the phase runs only for a pack whose items ask for it", () => {
  assert.deepStrictEqual(phasesRead([{ kind: "standard", entries: [{ looks_for: [{ proof: "scan", phase: "history", at_least: "medium" }] }] }]), ["history"]);
  assert.ok(!phasesRead([{ kind: "standard", entries: [{ looks_for: [{ proof: "runs" }] }] }]).includes("history"));
});

test("a scan of a checkout reads its history, and a folder with none says why", () => {
  const tree = repository();
  for (const [n, who] of [[1, "a@x.io"], [2, "a@x.io"], [3, "a@x.io"], [4, "b@x.io"]]) {
    writeFileSync(join(tree, `f${n}.txt`), String(n));
    execFileSync("git", ["-C", tree, "add", "-A"]);
    execFileSync("git", ["-C", tree, "-c", `user.email=${who}`, "-c", "user.name=x", "commit", "-qm", String(n)]);
  }
  const held = scan(tree, ["history"]).document;
  const phase = held.phases.find((one) => one.phase === "history");
  assert.ok(phase.ran);
  assert.match(held.findings.find((one) => one.phase === "history").body, /the most active person made 60% of them/);

  const loose = mkdtempSync(join(tmpdir(), "evalation-loose-"));
  const none = scan(loose, ["history"]).document.phases.find((one) => one.phase === "history");
  assert.strictEqual(none.ran, false);
  assert.match(none.why, /no git history/);
});
