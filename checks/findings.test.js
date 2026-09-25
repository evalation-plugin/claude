// The findings check, driven with a run over a real tree: the rules a reading's answers are held to.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { found, missing, repository, run, scanned } = require("./fixture.js");
const { checked } = require("../bin/evalation-findings");

const tree = repository();
scanned(tree, []);
const about = (said, named) => said.filter((one) => one.startsWith(named));

test("an answer whose status is the count of its items passes", () => {
  assert.deepStrictEqual(about(checked(run(tree), tree), "soc2/CC6.1"), []);
});

test("an answer whose status differs from the count is refused, naming the count", () => {
  const document = run(tree);
  document.answers[0].status = "covered";
  assert.deepStrictEqual(about(checked(document, tree), "soc2/CC6.1"), [
    "soc2/CC6.1: covered, and it found 1 of the 2 items that apply, which makes it partial-gap",
  ]);
});

test("all items missing counts to total-gap, and that status passes", () => {
  const document = run(tree);
  document.answers[0].looked_for = [missing(), missing()];
  document.answers[0].status = "total-gap";
  assert.deepStrictEqual(about(checked(document, tree), "soc2/CC6.1"), []);
});

test("a concern's item rows are held to its list", () => {
  const document = run(tree);
  document.accounted[0].looked_for = [{ result: "found" }];
  assert.match(about(checked(document, tree), "hardening/SEC01").join(), /looked_for holds 1 rows, and the entry lists 2/);
  document.accounted[0].looked_for = [{ result: "found" }, { result: "found" }];
  assert.match(about(checked(document, tree), "hardening/SEC01").join(), /item 1: found and cites nothing/);
});

test("a scan item says what the scan says, and nothing else", () => {
  const busy = repository();
  scanned(busy, [{ key: "sca:next@16:CVE-1", phase: "sca", severity: "critical", title: "CVE-1 in next 16", package: "next", version: "16" }]);
  const document = run(busy);
  assert.match(about(checked(document, busy), "hardening/SEC01").join(), /item 2: found, and the scan settles this item as missing/);
  document.accounted[0].looked_for[1] = { result: "missing" };
  assert.deepStrictEqual(about(checked(document, busy), "hardening/SEC01"), []);
});

test("an answer naming another pack's entry is refused, and its own entries pass", () => {
  const document = run(tree);
  document.answers[0].because = "A guard exists, see SEC01, and restore steps are missing as CC6.1 records.";
  const said = checked(document, tree).filter((one) => /an entry of/.test(one));
  assert.strictEqual(said.length, 1);
  assert.match(said[0], /names SEC01, an entry of hardening, in the soc2 pack/);
});

test("a scanned finding rated below its card owes a reason", () => {
  const busy = repository();
  scanned(busy, [{ key: "sca:next@16:CVE-1", phase: "sca", severity: "critical", title: "CVE-1 in next 16", package: "next", version: "16" }]);
  const document = run(busy);
  document.accounted[0].looked_for[1] = { result: "missing" };
  document.findings.push({ pack: "hardening", concern: "SEC01", severity: "high", title: "next has advisories",
    observed: "next 16 carries a critical advisory.", required: "Upgrade next.", scanned: "sca:next@16:CVE-1",
    at: { path: "src/auth.js", from: 1, to: 1, quote: "export function guard", grade: "executable" } });
  assert.match(checked(document, busy).join(), /rated high, and the scanner rates next critical/);
  document.findings[0].below_scan = "the affected feature is switched off in this deployment";
  assert.doesNotMatch(checked(document, busy).join(), /the scanner rates/);
});

test("the pack settles only what it marks: org-level, or not applicable when not in force", () => {
  const document = run(tree);
  document.answers[1].status = "not-applicable";
  assert.match(about(checked(document, tree), "soc2/CC1.1").join(), /the pack settles it as org-level/);

  const lapsed = run(tree);
  Object.assign(lapsed.packs[0].entries_asked[1], { in_force: false, bears_on: "repository" });
  lapsed.answers[1].status = "not-applicable";
  assert.deepStrictEqual(about(checked(lapsed, tree), "soc2/CC1.1"), []);

  const dodged = run(tree);
  dodged.answers[0] = { pack: "soc2", entry: "CC6.1", status: "not-applicable", from: "authored", because: "x", justification: "y" };
  assert.match(about(checked(dodged, tree), "soc2/CC6.1").join(), /the pack has this entry read from the repository/);
});

test("found needs lines, and missing needs the search", () => {
  const document = run(tree);
  document.answers[0].looked_for = [{ result: "found" }, { result: "missing" }];
  const said = about(checked(document, tree), "soc2/CC6.1").join("\n");
  assert.match(said, /item 1: found and cites nothing/);
  assert.match(said, /item 2: missing with no account of the search/);
  document.answers[0].looked_for = [found(), missing()];
  assert.deepStrictEqual(about(checked(document, tree), "soc2/CC6.1"), []);
});
