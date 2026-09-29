"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { repository } = require("./fixture.js");
const { practices, scan } = require("../bin/evalation-scan");

const NOW = Date.parse("2026-09-25T00:00:00Z");
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const commit = (days, who, message, ...files) => ({ at: ago(days), who, message, files });
const keyed = (found, key) => found.filter((one) => one.key === key).map((one) => one.severity);
const measure = (commits, source = { lines: 0, markers: 0 }) => practices({ commits, now: NOW, source });

test("commits made by people with no commit in the last 90 days are rated by their share", () => {
  const spread = (gone) => [
    ...Array.from({ length: gone }, (_, at) => commit(120 + at, "left", "work #1", "src/a.js", "src/a.test.js")),
    ...Array.from({ length: 10 - gone }, (_, at) => commit(5 + at, "here", "work #2", "src/b.js", "src/b.test.js")),
  ];
  assert.deepStrictEqual(keyed(measure(spread(5)), "history:departed"), ["high"]);
  assert.deepStrictEqual(keyed(measure(spread(3)), "history:departed"), ["medium"]);
  assert.deepStrictEqual(keyed(measure(spread(2)), "history:departed"), []);
  const said = measure(spread(6)).find((one) => one.key === "history:departed");
  assert.match(said.body, /60%/);
  assert.doesNotMatch(said.body, /left|here/);
});

test("commits whose message names no ticket are low under half", () => {
  const messages = (named) => Array.from({ length: 10 }, (_, at) =>
    commit(5 + at, "a", at < named ? (at % 2 ? `Fix login (#${40 + at})` : `PAY-${at + 1} charge once`) : "Tidy things", "src/a.js", "tests/a.js"));
  assert.deepStrictEqual(keyed(measure(messages(4)), "history:tickets"), ["low"]);
  assert.deepStrictEqual(keyed(measure(messages(5)), "history:tickets"), []);
  assert.match(measure(messages(4)).find((one) => one.key === "history:tickets").body, /40%/);
});

test("commits changing source code that change no test file are medium under a fifth, told apart by path and name", () => {
  const tested = ["tests/a.py", "pkg/a_test.go", "src/a.test.ts", "web/a.spec.js", "spec/a_spec.rb", "src/__tests__/a.js", "app/test_a.py", "src/AppTest.java"];
  const withTests = (count) => Array.from({ length: 10 }, (_, at) =>
    commit(5 + at, "a", "PAY-1", "src/latest.js", ...(at < count ? [tested[at % tested.length]] : [])));
  assert.deepStrictEqual(keyed(measure(withTests(1)), "history:tests"), ["medium"]);
  assert.deepStrictEqual(keyed(measure(withTests(2)), "history:tests"), []);
  const eight = Array.from({ length: 8 }, (_, at) => commit(5 + at, "a", "PAY-1", "src/latest.js", tested[at]));
  assert.deepStrictEqual(keyed(measure(eight), "history:tests"), [], "each naming convention counts as a test file");
  const docs = [...withTests(2), ...Array.from({ length: 20 }, (_, at) => commit(5 + at, "a", "PAY-1", "README.md", "docs/guide.md"))];
  assert.deepStrictEqual(keyed(measure(docs), "history:tests"), [], "a commit changing no source code is not counted");
  const testsOnly = [...withTests(2), ...Array.from({ length: 20 }, (_, at) => commit(5 + at, "a", "PAY-1", "tests/b.py"))];
  assert.deepStrictEqual(keyed(measure(testsOnly), "history:tests"), [], "a commit changing only tests is not a source change");
});

test("commits that undo an earlier one are low at a twentieth and medium at a tenth", () => {
  const undone = (count) => Array.from({ length: 20 }, (_, at) => commit(5 + at, "a",
    at < count ? (at % 2 ? `Revert "PAY-${at} add retry"` : `PAY-${at} put it back\n\nThis reverts commit 1a2b3c4d.`) : `PAY-${at} work`, "src/a.js", "src/a.test.js"));
  assert.deepStrictEqual(keyed(measure(undone(0)), "history:reverts"), []);
  assert.deepStrictEqual(keyed(measure(undone(1)), "history:reverts"), ["low"]);
  assert.deepStrictEqual(keyed(measure(undone(2)), "history:reverts"), ["medium"]);
});

test("unfinished-work markers per thousand lines of source are low above 2 and medium above 5", () => {
  const busy = [commit(5, "a", "PAY-1", "src/a.js", "src/a.test.js")];
  assert.deepStrictEqual(keyed(measure(busy, { lines: 1000, markers: 2 }), "history:markers"), []);
  assert.deepStrictEqual(keyed(measure(busy, { lines: 1000, markers: 3 }), "history:markers"), ["low"]);
  assert.deepStrictEqual(keyed(measure(busy, { lines: 2000, markers: 11 }), "history:markers"), ["medium"]);
  assert.deepStrictEqual(keyed(measure(busy, { lines: 0, markers: 0 }), "history:markers"), []);
});

test("a scan of a checkout reads messages from git and counts markers in tracked source only", () => {
  const tree = repository();
  mkdirSync(join(tree, "legacy"), { recursive: true });
  writeFileSync(join(tree, "legacy", "old.js"), `${Array.from({ length: 99 }, (_, at) => `const a${at} = ${at};`).join("\n")}\n// TODO: remove\n`);
  writeFileSync(join(tree, "NOTES.md"), "TODO FIXME HACK XXX\n".repeat(50));
  const commitAs = (message, ...files) => {
    for (const one of files) writeFileSync(join(tree, one), `${message}\n`);
    execFileSync("git", ["-C", tree, "add", "-A"]);
    execFileSync("git", ["-C", tree, "-c", "user.name=Sam", "-c", "user.email=sam@x.io", "commit", "-qm", message]);
  };
  commitAs("Add billing", "src/billing.js");
  commitAs('Revert "Add billing"\n\nThis reverts commit 1a2b3c4d.', "src/billing.js");
  commitAs("Add tax", "src/tax.js");
  const found = scan(tree, ["history"]).document.findings;
  const of = (key) => found.find((one) => one.key === key);
  assert.strictEqual(of("history:tickets")?.severity, "low");
  assert.strictEqual(of("history:reverts")?.severity, "medium");
  assert.strictEqual(of("history:tests")?.severity, "medium");
  assert.strictEqual(of("history:markers")?.severity, "medium", "one marker in about 110 lines of source, the notes file left out");
  assert.doesNotMatch(JSON.stringify(found), /sam@x\.io|Sam\b/);
});

test("each new history card says what closes it", () => {
  const { scanResults } = require("../lib/sheet.js");
  const scans = require("../lib/scans.js");
  const { consequences, remedies } = require("../lib/weaknesses.js");
  const findings = measure([commit(120, "a", "Tidy", "src/a.js"), commit(100, "a", 'Revert "Tidy"', "src/a.js"), commit(10, "b", "Tidy", "src/b.js")],
    { lines: 1000, markers: 9 });
  assert.deepStrictEqual(findings.map((one) => one.key).sort(), ["history:departed", "history:markers", "history:reverts", "history:tests", "history:tickets"]);
  const html = scanResults({ findings, intro: "x", tagWord: "", tagOf: () => [], phaseOf: scans.named, consequences, remedies,
    upgradeTo: scans.upgradeTo, compared: scans.compared, compatible: scans.compatible, cardOf: scans.cardOf });
  const todos = [...html.matchAll(/<b>What to do<\/b>([^<]*)/g)].map((one) => one[1]);
  assert.strictEqual(todos.length, 5);
  assert.strictEqual(new Set(todos).size, 5, "each measure has advice of its own");
  assert.ok(!todos.some((one) => /second person/.test(one)), "none falls back to the ownership advice");
});
