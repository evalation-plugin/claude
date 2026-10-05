"use strict";

const test = require("node:test");
const assert = require("node:assert");
require("./fixture.js");
const { docsLine } = require("../lib/docs-remedy.js");
const { line } = require("../lib/run-say.js");

const WRITTEN = { find: "A written incident response plan", proof: "written" };
const RUNS = { find: "A health check that reports whether the service is up", proof: "runs" };
const folder = () => line("report.docs-folder");

test("a missing document gives the line naming the folder to include in the next check", () => {
  const answer = { status: "partial-gap", remedy: "Write the plan.", looked_for: [{ result: "missing" }, { result: "found" }] };
  assert.strictEqual(docsLine(answer, [WRITTEN, RUNS]), folder());
});

test("an entry whose missing items all ask for something that runs gives no line", () => {
  const answer = { status: "partial-gap", remedy: "Add the health check.", looked_for: [{ result: "found" }, { result: "missing" }] };
  assert.strictEqual(docsLine(answer, [WRITTEN, RUNS]), "");
});

test("a document found, or one that does not apply, gives no line", () => {
  for (const result of ["found", "does-not-apply"]) {
    const answer = { status: "covered", looked_for: [{ result }, { result: "found" }] };
    assert.strictEqual(docsLine(answer, [WRITTEN, RUNS]), "", result);
  }
});

test("an entry with no list of things to look for gives no line", () => {
  assert.strictEqual(docsLine({ status: "partial-gap", remedy: "Fix it." }, undefined), "");
});

test("the line tells the person to include the folder in the next check and says it costs no pack credits", () => {
  assert.match(folder(), /folder/);
  assert.match(folder(), /\/ev-run/);
  assert.match(folder(), /no extra pack credits/);
});
