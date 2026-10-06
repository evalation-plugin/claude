"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");
const { page } = require("../bin/evalation-report");
const { reviewFindings } = require("../bin/evalation-deliver");
const { browser, settled } = require("../lib/print.js");
const { skeletonOf } = require("../bin/evalation-findings");

const tree = repository();
scanned(tree, []);

const PURPOSE = "For investors checking the software in a company they are investing in, from the company's repository.";
const SECTIONS = ["Product", "Risk", "Asset", "Growth", "People", "Ownership"];

const askedOf = (document) => {
  const asked = new Map();
  for (const pack of document.packs) for (const one of pack.entries_asked ?? []) asked.set(`${pack.pack}/${one.identifier}`, one);
  return asked;
};

const sheetsOf = (html) => {
  const file = join(mkdtempSync(join(tmpdir(), "evalation-summary-")), "page.html");
  writeFileSync(file, html);
  return settled(browser(), file).split('<div class="sheet">').slice(1);
};

const standard = (gaps, partials = 0, covered = 6) => {
  const document = run(tree);
  const pack = document.packs[0];
  pack.description = PURPOSE;
  pack.sections = SECTIONS.map((title, at) => ({ identifier: `S${at + 1}`, title }));
  const statuses = [...Array(gaps).fill("total-gap"), ...Array(partials).fill("partial-gap"), ...Array(covered).fill("covered")];
  pack.entries_asked = statuses.map((_, at) => ({ identifier: `INV${String(at + 1).padStart(2, "0")}`, title: `Question ${at + 1} about the product`,
    intent: "Does the code hold it?", section: `S${(at % SECTIONS.length) + 1}`, bears_on: "repository" }));
  pack.selected = pack.entries_asked.map((one) => one.identifier);
  document.answers = statuses.map((status, at) => ({ pack: pack.pack, entry: pack.entries_asked[at].identifier, status,
    because: "Read the code.", remedy: "Build it." }));
  return document;
};

const reportSheets = (document) => sheetsOf(page(document, document.answers.filter((one) => one.pack === "soc2"), askedOf(document)));

const detailSheets = () => {
  const { page: detailPage } = require("../bin/evalation-detail");
  const { synthesise } = require("../lib/synthesise.js");
  const document = run(tree);
  document.packs[1].description = PURPOSE;
  document.findings = ["critical", "high", "medium", "low"].map((severity, at) => ({ pack: "hardening", concern: "SEC01", severity,
    title: `Weakness ${at + 1}`, observed: "Input reaches a query unescaped.", required: "Escape it.",
    at: { path: "src/auth.js", from: 1, to: 1, quote: "if (!req.session)", grade: "executable" } }));
  return sheetsOf(detailPage(synthesise(reviewFindings(document))));
};

const parts = (sheet) => [...sheet.matchAll(/data-part="([a-z]+)"/g)].map((one) => one[1]);

test("an evidence pack and the findings detail open on the same summary layout, and the opening facts follow on page 2", () => {
  const report = reportSheets(standard(4, 3));
  const detail = detailSheets();
  assert.deepStrictEqual(parts(report[0]), ["purpose", "shows", "sections", "serious"]);
  assert.deepStrictEqual(parts(detail[0]), parts(report[0]));
  for (const sheets of [report, detail]) {
    assert.ok(sheets[0].includes(PURPOSE), "the summary states the pack's purpose");
    assert.doesNotMatch(sheets[0], /class="facts"/);
    assert.match(sheets[1], /<div class="flow"[^>]*><div class="block">\s*<ul class="facts">/);
  }
});

test("the summary counts each section, in the pack's order", () => {
  const sheet = reportSheets(standard(4, 3))[0];
  const rows = [...sheet.matchAll(/<tr data-section="([^"]+)">/g)].map((one) => one[1]);
  assert.deepStrictEqual(rows, SECTIONS);
});

test("a summary with more serious items than its page holds lists those that fit, says how many more, and stays on one page", () => {
  const sheets = reportSheets(standard(40, 10, 0));
  const listed = (sheets[0].match(/<li data-entry="/g) ?? []).length;
  const more = Number((sheets[0].match(/data-more="(\d+)"/) ?? [])[1]);
  assert.ok(listed >= 5, `the page lists ${listed}`);
  assert.strictEqual(listed + more, 50);
  assert.doesNotMatch(sheets[0], /data-cut=/);
  assert.match(sheets[1], /class="facts"/);
});

test("a summary with few serious items spreads to fill its page", () => {
  const filled = Number((reportSheets(standard(1, 1))[0].match(/data-filled="(\d+)"/) ?? [])[1]);
  assert.ok(filled >= 80, `the summary fills ${filled}% of its page`);
});

test("a folder list shows five folders and says how many more, and the appendix lists them all", () => {
  const document = standard(2, 2);
  document.target = { ...document.target, kind: "solution", name: "Acme",
    repositories: Array.from({ length: 8 }, (_, at) => ({ folder: `repo-${at + 1}`, repository: `acme/repo-${at + 1}`, vcs: "git" })),
    left_out: Array.from({ length: 7 }, (_, at) => ({ folder: `copy-${at + 1}`, why: "not chosen for this review" })) };
  const sheets = reportSheets(document);
  const opening = sheets.find((one) => one.includes('class="repos"'));
  assert.strictEqual((opening.match(/<li><b>acme\/repo-\d+<\/b>/g) ?? []).length, 5);
  assert.strictEqual((opening.match(/<li><b>copy-\d+<\/b>/g) ?? []).length, 5);
  assert.match(opening, /data-more="3"/);
  assert.match(opening, /data-more="2"/);
  const appendix = sheets.at(-1);
  assert.strictEqual((appendix.match(/<li><b>acme\/repo-\d+<\/b>/g) ?? []).length, 8);
  assert.strictEqual((appendix.match(/<li><b>copy-\d+<\/b>/g) ?? []).length, 7);
});

test("the findings file keeps each pack's stated purpose", () => {
  const held = skeletonOf({ run: "r", at: "2026-10-06T00:00:00.000Z", revision: "1.91", target: {},
    packs: [{ pack: "investment-diligence", body: { kind: "standard", title: "Investment", description: PURPOSE, entries: [] } }] }, "Opus 5.5");
  assert.strictEqual(held.packs[0].description, PURPOSE);
});
