// A correction group is checked on its own: its findings' concerns count as read, and the verifier's
// own reasons, kept in a claim's history, are working notes no customer reads.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { found, repository, run, scanned } = require("./fixture.js");
const { checked } = require("../bin/evalation-findings");
const { focusOf } = require("../bin/evalation-verify");
const { facing } = require("../lib/prose.js");

const tree = repository();
scanned(tree, []);

function withFinding() {
  const document = run(tree);
  const hardening = document.packs[1];
  hardening.selected = ["SEC01", "SEC02"];
  hardening.entries_asked.push({ identifier: "SEC02", title: "Secrets", intent: "Where are secrets kept?" });
  document.accounted[0].id = "c-1";
  document.accounted[0].looked_for = [found(), { result: "found" }];
  document.accounted.push({ id: "c-2", pack: "hardening", concern: "SEC02", because: "Read the settings." });
  document.findings.push({ id: "f-1", pack: "hardening", concern: "SEC02", severity: "low", title: "A default secret",
    observed: "A default secret is set in code.", required: "Read it from the environment.",
    at: { path: "src/auth.js", from: 1, to: 1, quote: "export function guard", grade: "executable" } });
  return document;
}

test("a group of a concern row and another concern's finding is checked as read", () => {
  assert.deepStrictEqual(checked(focusOf(withFinding(), ["c-1", "f-1"]), tree), []);
});

test("a group of a finding alone brings its concern's row", () => {
  assert.deepStrictEqual(checked(focusOf(withFinding(), ["f-1"]), tree), []);
});

test("the verifier's reasons in a claim's history are not held to the writing rules", () => {
  const document = withFinding();
  document.findings[0].history = [{ round: 1, verdict: "refuted", why: "Eight modules carry it, not nine." }];
  assert.ok(!facing({ findings: document.findings }).some((one) => one.at.includes("history")));
  assert.deepStrictEqual(checked(document, tree).filter((one) => /history/.test(one)), []);
});
