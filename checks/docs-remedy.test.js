"use strict";

const test = require("node:test");
const assert = require("node:assert");
require("./fixture.js");
const { remedyOf } = require("../lib/docs-remedy.js");
const { line } = require("../lib/run-say.js");

const WRITTEN = { find: "A written incident response plan", proof: "written" };
const RUNS = { find: "A health check that reports whether the service is up", proof: "runs" };
const folder = () => line("report.docs-folder");

test("a missing document adds the line naming the folder to include in the next run", () => {
  const answer = { status: "partial-gap", remedy: "Write the plan.", looked_for: [{ result: "missing" }, { result: "found" }] };
  assert.strictEqual(remedyOf(answer, [WRITTEN, RUNS]), `Write the plan. ${folder()}`);
});

test("a remedy with no document missing is left as the reading wrote it", () => {
  const answer = { status: "partial-gap", remedy: "Add the health check.", looked_for: [{ result: "found" }, { result: "missing" }] };
  assert.strictEqual(remedyOf(answer, [WRITTEN, RUNS]), "Add the health check.");
});

test("a document found, or one that does not apply, adds nothing", () => {
  for (const result of ["found", "does-not-apply"]) {
    const answer = { status: "covered", remedy: "", looked_for: [{ result }, { result: "found" }] };
    assert.strictEqual(remedyOf(answer, [WRITTEN, RUNS]), "", result);
  }
});

test("a missing document with no remedy written still gets the line", () => {
  const answer = { status: "total-gap", looked_for: [{ result: "missing" }] };
  assert.strictEqual(remedyOf(answer, [WRITTEN]), folder());
});

test("an entry with no list of things to look for keeps the reading's remedy", () => {
  assert.strictEqual(remedyOf({ status: "partial-gap", remedy: "Fix it." }, undefined), "Fix it.");
});

test("the line tells the person to include the folder in the next run and says it costs no pack credits", () => {
  assert.match(folder(), /folder/);
  assert.match(folder(), /\/ev-run/);
  assert.match(folder(), /no extra pack credits/);
});
