"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");
const { held, readingHeld } = require("../lib/prose.js");
const { checked } = require("../bin/evalation-findings");
const { write } = require("../bin/evalation-summary");

const tree = repository();
scanned(tree, []);

test("a reading or summary sentence in the first person is refused, and the plugin's own lines may speak as I", () => {
  for (const said of ["I found the word contractor in the README.", "We read every route.", "The handler in our tests is shared.",
    "The repository shows me a guard on every route.", "I'm unable to find a restore step."]) {
    assert.ok(readingHeld(said).includes("the first person"), said);
  }
  for (const said of ["Annex I lists the high-risk systems.", "The README names \"I agree\" as the consent label.", "The `my_users` table holds the accounts.",
    "Part I of the standard covers access."]) {
    assert.ok(!readingHeld(said).includes("the first person"), said);
  }
  assert.deepStrictEqual(held("I'll print the reports once both are done."), []);
});

test("a reading handing in an answer in the first person is told to rewrite it", () => {
  const document = run(tree);
  document.answers[0].looked_for[0].observed = "I found a session guard on every route in src/auth.js.";
  const said = checked(document, tree).filter((one) => one.includes("the first person"));
  assert.strictEqual(said.length, 1, JSON.stringify(checked(document, tree)));
});

test("a summary sentence in the first person is refused", () => {
  const file = join(mkdtempSync(join(tmpdir(), "evalation-first-person-")), "findings.json");
  writeFileSync(file, JSON.stringify({ ...run(tree), schema: "evalation.findings.v1" }));
  const said = write(file, "soc2", JSON.stringify({
    paragraph: [{ say: "We found access guarded, and no restore steps are written down.", rests_on: ["CC6.1"] }],
    weigh: [{ say: "Ask how the company would restore its data after a failure.", rests_on: ["CC6.1"] }],
  }));
  assert.strictEqual(said.written, false);
  assert.ok(said.problems.some((one) => one.includes("the first person")), JSON.stringify(said.problems));
});
