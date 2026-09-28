"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");
const { citing, page } = require("../bin/evalation-report");
const { print } = require("../lib/print.js");
const { readingOf } = require("../lib/prose.js");

const tree = repository();
scanned(tree, []);

const printedFrom = (document) => {
  const asked = new Map();
  for (const pack of document.packs) for (const one of pack.entries_asked ?? []) asked.set(`${pack.pack}/${one.identifier}`, one);
  const own = document.answers.filter((one) => one.pack === "soc2");
  const folder = mkdtempSync(join(tmpdir(), "evalation-print-"));
  const into = join(folder, "pack.pdf");
  return { into, done: () => print(page(document, own, asked), join(folder, "pack.html"), into, null, readingOf(document)) };
};

test("a remedy quoting a GitHub Actions expression prints", () => {
  const document = run(tree);
  document.answers[0].remedy = "In .github/workflows/migrate-prod.yml add 'environment: ${{ inputs.target }}' and set " +
    "DIRECT_URL: ${{ inputs.target == 'production' && secrets.PROD_DIRECT_URL || secrets.STAGING_DIRECT_URL }}.";
  const { into, done } = printedFrom(document);
  assert.strictEqual(done().printed, true);
  assert.ok(existsSync(into));
});

const tall = (document, items, quotes) => {
  const cited = { result: "found", evidence: Array.from({ length: quotes }, (_, at) => ({
    path: `src/part-${at}.js`, from: 1, to: 4, quote: "line one\nline two\nline three\nline four", grade: "executable" })) };
  document.packs[0].entries_asked[0].looks_for = Array.from({ length: items }, (_, at) => ({ find: `Thing ${at + 1} the entry looks for`, proof: "runs" }));
  document.answers[0].looked_for = Array.from({ length: items }, () => cited);
  document.answers[0].remedy = "Write the restore steps and keep them beside the scripts they restore.";
  return document;
};

test("an entry taller than a page carries on to the next page and keeps its remedy", () => {
  const { into, done } = printedFrom(tall(run(tree), 14, 2));
  assert.strictEqual(done().printed, true);
  const text = execFileSync("pdftotext", [into, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  assert.match(text, /Thing 14 the entry looks for/);
  assert.match(text, /Write the restore steps and keep them beside the scripts they restore\./);
  assert.match(text, /SOC 2 TRUST SERVICES CRITERIA, CC6\.1, CONTINUED/);
});

test("one item citing more than a page of quotes carries on to the next page", () => {
  const { into, done } = printedFrom(tall(run(tree), 1, 40));
  assert.strictEqual(done().printed, true);
  const text = execFileSync("pdftotext", [into, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  assert.match(text, /src\/part-39\.js/);
  assert.match(text, /Write the restore steps and keep them beside the scripts they restore\./);
});

test("a quote and a remedy each longer than a page carry on line by line and word by word", () => {
  const document = run(tree);
  document.answers[0].looked_for[0].evidence[0].quote = Array.from({ length: 150 }, (_, at) => `quoted line ${at + 1}`).join("\n");
  document.answers[0].remedy = `${Array.from({ length: 1500 }, (_, at) => `step${at + 1}`).join(" ")} is the last step.`;
  const { into, done } = printedFrom(document);
  assert.strictEqual(done().printed, true);
  const text = execFileSync("pdftotext", [into, "-"], { encoding: "utf8" }).replace(/\s+/g, " ");
  assert.match(text, /quoted line 150/);
  assert.match(text, /step1500 is the last step\./);
});

test("an answer counts as cited when an item it looked for cites lines", () => {
  const document = run(tree);
  const soc2 = document.answers.filter((one) => one.pack === "soc2");
  assert.strictEqual(citing(soc2), 1);
  soc2[0].looked_for = [{ result: "missing", searched: "Looked everywhere." }];
  assert.strictEqual(citing(soc2), 0);
});

test("a slot the reading did not write is still refused", () => {
  const document = run(tree);
  document.answers[0].remedy = "Add 'environment: ${{ inputs.target }}' to the workflow.";
  document.target.repository = "{{ repository }}";
  const { done } = printedFrom(document);
  assert.throws(done, /an unfilled slot reached the page: "\{\{ repository \}\}"/);
});
