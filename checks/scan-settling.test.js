"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { repository } = require("./fixture.js");
const { scan } = require("../bin/evalation-scan");
const { settled } = require("../lib/scans.js");

test("an item naming a rule no measure produces is not checked, never found", () => {
  const held = scan(repository(), ["history"]).document;
  const nonesuch = settled({ proof: "scan", phase: "history", rule: "history:nonesuch", at_least: "low" }, held);
  assert.strictEqual(nonesuch.result, "not-checked");
  assert.match(nonesuch.why, /update the plugin and run it again/);
  assert.doesNotMatch(nonesuch.why, /history:nonesuch/, "a customer never reads a rule's internal key");
  const releases = settled({ proof: "scan", phase: "history", rule: "history:releases", at_least: "low" }, held);
  assert.strictEqual(releases.result, "missing", "a rule the phase does measure is still settled by its results");
  const area = settled({ proof: "scan", phase: "history", rule: "history:area:src", at_least: "low" }, held);
  assert.strictEqual(area.result, "found", "a keyed rule under a measure the phase produces is measured");
});

test("a scan from a plugin that recorded no measures settles a named rule as not checked", () => {
  const older = { at: "2026-09-30T00:00:00Z", phases: [{ phase: "history", ran: true }], findings: [] };
  assert.strictEqual(settled({ proof: "scan", phase: "history", rule: "history:departed" }, older).result, "not-checked");
  assert.strictEqual(settled({ proof: "scan", phase: "history" }, older).result, "found", "an item naming no rule is settled by the whole phase");
});

test("a phase that read only part of the repository settles its items as not checked, naming what it could not read", () => {
  const partial = { at: "2026-09-30T00:00:00Z", findings: [],
    phases: [{ phase: "licence", ran: true, measures: ["licence:restricted", "licence:unknown"], unread: ["services/Cargo.lock"] }] };
  const said = settled({ proof: "scan", phase: "licence", rule: "licence:restricted", at_least: "medium" }, partial);
  assert.strictEqual(said.result, "not-checked");
  assert.match(said.why, /services\/Cargo\.lock/);
  const whole = { ...partial, phases: [{ ...partial.phases[0], unread: [] }] };
  assert.strictEqual(settled({ proof: "scan", phase: "licence", rule: "licence:restricted", at_least: "medium" }, whole).result, "found");
});

test("the licence phase records the lockfiles it could not read on the phase", () => {
  const { licenceRead } = require("../bin/evalation-scan");
  const out = JSON.stringify({ Results: [
    { Class: "lang-pkgs", Target: "pnpm-lock.yaml", Packages: [{ Name: "a", Version: "1", Relationship: "direct", Licenses: ["MIT"] }] },
    { Class: "lang-pkgs", Target: "services/Cargo.lock", Packages: [{ Name: "serde", Version: "1", Relationship: "direct" }] },
  ] });
  const said = licenceRead(out, ["pnpm-lock.yaml", "services/Cargo.lock"]);
  assert.deepStrictEqual(said.unread, ["services/Cargo.lock"]);
});

test("the evidence pack prints the same reason the check settles on", () => {
  const { scannedLine } = require("../bin/evalation-report");
  const partial = { phases: [{ phase: "licence", ran: true, measures: ["licence:restricted"], unread: ["services/Cargo.lock"] }] };
  assert.match(scannedLine({ proof: "scan", phase: "licence", rule: "licence:restricted" }, { result: "not-checked" }, partial), /services\/Cargo\.lock/);
});
