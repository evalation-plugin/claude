"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join } = require("node:path");
require("./fixture.js");
const { reportsFolder } = require("../lib/reports.js");

const local = (at) => {
  const when = new Date(at);
  const two = (n) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}.${two(when.getMinutes())}`;
};

test("a run's reports go in a folder named by the local date and time it ran, never by its run id", () => {
  const document = { run: "run-57de2343956b", at: "2026-09-25T03:58:16.238Z", target: { repository: "sanaude/maycray" } };
  const folder = reportsFolder(document);
  assert.strictEqual(basename(folder), local(document.at));
  assert.doesNotMatch(folder, /run-/);
  assert.match(folder, /Evalation[\\/]sanaude-maycray[\\/]/);
});

test("a second run in the same minute gets its own folder, and the same run keeps its own", () => {
  const home = mkdtempSync(join(tmpdir(), "evalation-reports-"));
  const first = { run: "run-aaa", at: "2026-09-25T03:58:16.238Z", target: { repository: "acme/app" } };
  const folder = reportsFolder(first, home);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "Evalation Findings.json"), JSON.stringify({ run: "run-aaa" }));
  assert.strictEqual(reportsFolder(first, home), folder);
  const second = { ...first, run: "run-bbb", at: "2026-09-25T03:58:40.000Z" };
  assert.strictEqual(basename(reportsFolder(second, home)), `${local(first.at)} (2)`);
});
