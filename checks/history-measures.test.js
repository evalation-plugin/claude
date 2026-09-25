// What a year of git history says beyond who wrote it: how often the team releases, which areas
// nobody has touched, which rest on one person, and whether the pace has fallen. Each is a number,
// and an item names the one it rests on.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { found, missing, repository, run, scanned } = require("./fixture.js");
const { measured } = require("../bin/evalation-scan");
const { checked } = require("../bin/evalation-findings");

const NOW = Date.parse("2026-09-25T00:00:00Z");
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const commit = (days, who, ...files) => ({ at: ago(days), who, files });
const keys = (found) => found.map((one) => `${one.key} ${one.severity}`).sort();

test("a year with no release tags is medium, and a few releases are low", () => {
  const commits = [commit(10, "a", "src/a.js"), commit(20, "b", "src/b.js")];
  const tracked = ["src/a.js", "src/b.js"];
  assert.deepStrictEqual(keys(measured({ commits, tags: [], tracked, now: NOW })), ["history:releases medium"]);
  assert.deepStrictEqual(keys(measured({ commits, tags: [ago(30), ago(90)], tracked, now: NOW })), ["history:releases low"]);
  assert.deepStrictEqual(keys(measured({ commits, tags: [ago(30), ago(90), ago(150), ago(200)], tracked, now: NOW })), []);
});

test("a top-level area nobody changed in a year is named as dormant", () => {
  const commits = [commit(10, "a", "src/a.js"), commit(20, "b", "src/b.js")];
  const said = measured({ commits, tags: [ago(10), ago(60), ago(120), ago(180)], tracked: ["src/a.js", "legacy/old.js", "docs/x.md"], now: NOW });
  assert.deepStrictEqual(keys(said), ["history:dormant low"]);
  assert.match(said[0].body, /legacy, docs|docs, legacy/);
});

test("an area where one person made most of ten or more commits rests on that person", () => {
  const commits = [
    ...Array.from({ length: 9 }, (_, i) => commit(i + 1, "a", "billing/x.js")),
    commit(12, "b", "billing/y.js"),
    ...Array.from({ length: 10 }, (_, i) => commit(i + 1, i % 2 ? "a" : "b", "web/z.js")),
  ];
  const said = measured({ commits, tags: [ago(10), ago(60), ago(120), ago(180)], tracked: ["billing/x.js", "web/z.js"], now: NOW });
  assert.deepStrictEqual(keys(said), ["history:area:billing medium"]);
  assert.match(said[0].body, /90%/);
});

test("a pace that fell by more than half in the last three months is named", () => {
  const commits = [
    ...Array.from({ length: 45 }, (_, i) => commit(100 + i * 5, i % 2 ? "a" : "b", "src/a.js")),
    commit(10, "a", "src/a.js"), commit(40, "b", "src/a.js"),
  ];
  const said = measured({ commits, tags: [ago(10), ago(60), ago(120), ago(180)], tracked: ["src/a.js"], now: NOW });
  assert.deepStrictEqual(keys(said), ["history:slowing medium"]);
});

test("the first check says when the clone's newest commit was made, so a clone never pulled is caught", () => {
  const { branchOf } = require("../bin/evalation-run");
  const tree = repository();
  assert.match(branchOf(tree).newest, /^\d{4}-\d{2}-\d{2}T/);
});

test("a customer question's rule is held to its phase", () => {
  const { problems } = require("../lib/questions.js");
  const asked = (rule) => ({ name: "Board check", pack: "custom", questions: [{ identifier: "Q1", title: "Releases",
    intent: "How often does the team release?", looks_for: [
      { find: "Release notes for each version", proof: "written" },
      { find: "Releases tagged at least four times in the last year", proof: "scan", phase: "history", at_least: "low", rule },
    ] }] });
  assert.deepStrictEqual(problems(asked("history:releases")), []);
  assert.match(problems(asked("sca:next")).join(), /a rule starts with its phase/);
});

test("each history card says what fits its measure", () => {
  const { scanResults } = require("../lib/sheet.js");
  const scans = require("../lib/scans.js");
  const { consequences, remedies } = require("../lib/weaknesses.js");
  const findings = measured({ commits: [commit(10, "a", "src/a.js")], tags: [], tracked: ["src/a.js", "legacy/x.js"], now: NOW });
  const html = scanResults({ findings, intro: "x", tagWord: "", tagOf: () => [], phaseOf: scans.named, consequences, remedies,
    upgradeTo: scans.upgradeTo, compared: scans.compared, compatible: scans.compatible, cardOf: scans.cardOf });
  const todos = [...html.matchAll(/<b>What to do<\/b>([^<]*)/g)].map((one) => one[1]);
  assert.ok(todos.some((one) => /Tag each release/.test(one)), "releases");
  assert.ok(todos.some((one) => /still used/.test(one)), "dormant areas");
  assert.ok(!todos.some((one) => /second person/.test(one)), "no ownership advice on these");
});

test("a scan item naming a rule is settled by that rule alone", () => {
  const tree = repository();
  scanned(tree, [{ key: "history:dormant", phase: "history", severity: "low", title: "Areas nobody changed in a year" }]);
  const document = run(tree);
  document.packs[1].entries_asked[0].looks_for[1] = { find: "Releases tagged through the year", proof: "scan", phase: "history", rule: "history:releases", at_least: "low", severity: "medium" };
  document.accounted[0].looked_for = [found(), { result: "found" }];
  assert.deepStrictEqual(checked(document, tree).filter((one) => one.startsWith("hardening/SEC01")), []);
  document.packs[1].entries_asked[0].looks_for[1].rule = "history:dormant";
  assert.match(checked(document, tree).join(), /item 2: found, and the scan settles this item as missing/);
  assert.ok(missing());
});
