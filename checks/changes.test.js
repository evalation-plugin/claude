// What changed since the last run of the same repository: the answers that moved and the items that
// moved them, the scanner results that arrived or went, and the score.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { changes, changesSection, earlierFor } = require("../lib/changes.js");

const run = (at, over = {}) => ({
  run: `run-${at}`, at, revision: "1.81", target: { repository: "acme/app" },
  packs: [{ pack: "soc2", title: "SOC 2", entries_asked: [
    { identifier: "CC6.1", title: "Logical access", looks_for: [{ find: "A shared check" }, { find: "A tenant check" }] },
    { identifier: "CC7.1", title: "Detecting vulnerabilities" },
  ] }],
  answers: [
    { id: "a-1", pack: "soc2", entry: "CC6.1", status: "partial-gap", looked_for: [{ result: "found" }, { result: "missing" }] },
    { id: "a-2", pack: "soc2", entry: "CC7.1", status: "covered" },
  ],
  scan: { relevant: [{ key: "sca:next@16:CVE-1", phase: "sca", severity: "critical", title: "CVE-1 in next 16", package: "next" }] },
  hardness: { score: 70, grade: "C", bars: [{ category: "SEC", score: 60 }] },
  ...over,
});

const later = () => {
  const now = run("2026-09-25T00:00:00.000Z");
  now.answers[0] = { ...now.answers[0], status: "covered", looked_for: [{ result: "found" }, { result: "found" }] };
  now.answers[1] = { ...now.answers[1], status: "total-gap" };
  now.scan = { relevant: [{ key: "sca:axios@1:CVE-9", phase: "sca", severity: "high", title: "CVE-9 in axios 1", package: "axios" }] };
  now.hardness = { score: 78, grade: "B", bars: [{ category: "SEC", score: 75 }] };
  return now;
};

test("a run finds the newest earlier run of the same repository, and never itself", () => {
  const home = mkdtempSync(join(tmpdir(), "evalation-home-"));
  mkdirSync(join(home, "findings"));
  const write = (name, document) => writeFileSync(join(home, "findings", name), JSON.stringify(document));
  write("a.json", run("2026-09-20T00:00:00.000Z"));
  write("b.json", run("2026-09-23T00:00:00.000Z"));
  write("c.json", run("2026-09-24T00:00:00.000Z", { target: { repository: "acme/other" } }));
  write("b.json.correct", run("2026-09-24T12:00:00.000Z"));
  const now = later();
  write("d.json", now);
  assert.strictEqual(earlierFor(now, home).at, "2026-09-23T00:00:00.000Z");
  assert.strictEqual(earlierFor(run("2026-09-19T00:00:00.000Z"), home), null);
});

test("answers that moved read as improved or worsened, with the items that moved them", () => {
  const said = changes(later(), run("2026-09-23T00:00:00.000Z"));
  assert.deepStrictEqual(said.answers.map((one) => [one.entry, one.from, one.to, one.direction]), [
    ["CC6.1", "partial-gap", "covered", "improved"],
    ["CC7.1", "covered", "total-gap", "worsened"],
  ]);
  assert.deepStrictEqual(said.answers[0].items, [{ at: 2, find: "A tenant check", from: "missing", to: "found" }]);
});

test("scanner results that arrived and went are named, and so is the score", () => {
  const said = changes(later(), run("2026-09-23T00:00:00.000Z"));
  assert.deepStrictEqual(said.scan.arrived.map((one) => one.key), ["sca:axios@1:CVE-9"]);
  assert.deepStrictEqual(said.scan.gone.map((one) => one.key), ["sca:next@16:CVE-1"]);
  assert.deepStrictEqual(said.hardness, { from: 70, to: 78, grade: { from: "C", to: "B" } });
});

test("a concern's items that moved are named, and the hardness score's move is said", () => {
  const concern = (at, results) => ({
    ...run(at),
    packs: [{ pack: "hardening", kind: "concern-set", entries_asked: [{ identifier: "SEC01", title: "Untrusted input",
      looks_for: [{ find: "Parameterised queries" }, { find: "An input test" }] }] }],
    answers: [],
    accounted: [{ pack: "hardening", concern: "SEC01", looked_for: results.map((result) => ({ result })) }],
  });
  const now = concern("2026-09-25T00:00:00.000Z", ["found", "missing"]);
  now.hardness = { score: 64, grade: "C", bars: [] };
  const said = changes(now, concern("2026-09-23T00:00:00.000Z", ["found", "found"]));
  assert.deepStrictEqual(said.concerns, [{ pack: "hardening", concern: "SEC01", title: "Untrusted input",
    items: [{ at: 2, find: "An input test", from: "found", to: "missing" }] }]);
  const html = changesSection(said, "hardening");
  assert.match(html, /SEC01 Untrusted input: item 2, An input test, is now missing/);
  assert.match(html, /The hardness score moved from 70 to 64/);
});

test("an evidence pack and a hardening detail open with the section where an earlier run is kept", () => {
  const home = process.env.EVALATION_HOME;
  mkdirSync(join(home, "findings"), { recursive: true });
  writeFileSync(join(home, "findings", "earlier.json"), JSON.stringify(run("2026-09-23T00:00:00.000Z")));
  const now = later();
  const { page } = require("../bin/evalation-report");
  const asked = new Map(now.packs[0].entries_asked.map((one) => [`soc2/${one.identifier}`, one]));
  assert.match(page(now, now.answers, asked), /What changed since 23 September 2026/);

  const { reviewFindings } = require("../bin/evalation-deliver");
  const hardening = { ...later(), packs: [{ pack: "hardening", kind: "concern-set", entries_asked: [] }], answers: [], findings: [], accounted: [] };
  writeFileSync(join(home, "findings", "earlier-hardening.json"), JSON.stringify({ ...run("2026-09-23T00:00:00.000Z"), packs: hardening.packs }));
  assert.strictEqual(reviewFindings(hardening).changes.since, "2026-09-23T00:00:00.000Z");
});

test("the section says what changed in plain words, and that nothing did when nothing did", () => {
  const html = changesSection(changes(later(), run("2026-09-23T00:00:00.000Z")), "soc2");
  assert.match(html, /What changed since 23 September 2026/);
  assert.match(html, /CC6\.1 Logical access.*partial.*to.*covered/s);
  assert.match(html, /1 improved and 1 worsened/);
  const still = changesSection(changes(run("2026-09-25T00:00:00.000Z"), run("2026-09-23T00:00:00.000Z")), "soc2");
  assert.match(still, /Nothing changed/);
  assert.strictEqual(changesSection(null, "soc2"), "");
});
