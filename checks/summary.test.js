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
  document.findings = ["critical", "high", "medium", "low", "positive"].map((severity, at) => ({ pack: "hardening", concern: "SEC01", severity,
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
  const sheets = reportSheets(standard(20, 5, 0));
  const listed = (sheets[0].match(/<li data-entry="/g) ?? []).length;
  const more = Number((sheets[0].match(/data-more="(\d+)"/) ?? [])[1]);
  assert.ok(listed >= 5, `the page lists ${listed}`);
  assert.strictEqual(listed + more, 25);
  assert.doesNotMatch(sheets[0], /data-cut=/);
  assert.match(sheets[1], /class="facts"/);
});

const filledOf = (sheet) => Number((sheet.match(/data-filled="(\d+)"/) ?? [])[1]);

test("a summary too long for one page takes two, each filled, with the most serious items running onto page 2", () => {
  const document = standard(40, 30, 10);
  const pack = document.packs[0];
  pack.sections = Array.from({ length: 20 }, (_, at) => ({ identifier: `S${at + 1}`, title: `Section ${at + 1}` }));
  pack.entries_asked.forEach((one, at) => { one.section = `S${(at % 20) + 1}`; });
  const sheets = reportSheets(document);
  for (const sheet of sheets.slice(0, 2)) {
    assert.doesNotMatch(sheet, /data-cut=|data-others=/);
    assert.ok(filledOf(sheet) >= 80, `a summary page fills ${filledOf(sheet)}%`);
  }
  assert.strictEqual((sheets[0].match(/<tr data-section="/g) ?? []).length, 20);
  assert.match(sheets[1], /data-part="serious"/);
  assert.doesNotMatch(sheets[1], /class="facts"/);
  assert.match(sheets[2], /class="facts"/);
  const listed = sheets.slice(0, 2).reduce((sum, one) => sum + (one.match(/<li data-entry="/g) ?? []).length, 0);
  const more = Number((sheets[1].match(/data-more="(\d+)"/) ?? [0, 0])[1]);
  assert.strictEqual(listed + more, 70);
});

test("a summary whose purpose and section table outgrow page 1 carries the table on to page 2, and no page is cut", () => {
  const document = standard(40, 30, 10);
  const pack = document.packs[0];
  pack.description = PURPOSE.repeat(7);
  pack.sections = Array.from({ length: 30 }, (_, at) => ({ identifier: `S${at + 1}`, title: `Guidelines for section ${at + 1} of the manual` }));
  pack.entries_asked.forEach((one, at) => { one.section = `S${(at % 30) + 1}`; });
  const sheets = reportSheets(document);
  for (const sheet of sheets.slice(0, 3)) assert.doesNotMatch(sheet, /data-cut=/);
  const summary = sheets.slice(0, 2).join("");
  const shown = (summary.match(/<tr data-section="/g) ?? []).length;
  const folded = Number((summary.match(/<tr data-others="(\d+)"/) ?? [0, 0])[1]);
  assert.strictEqual(shown + folded, 30);
  assert.match(summary, /data-part="serious"/);
});

test("page 1 of a two-page summary never ends on one or two serious items", () => {
  for (let count = 26; count <= 34; count += 1) {
    const document = standard(40, 30, 10);
    const pack = document.packs[0];
    pack.sections = Array.from({ length: count }, (_, at) => ({ identifier: `S${at + 1}`, title: `Section ${at + 1}` }));
    pack.entries_asked.forEach((one, at) => { one.section = `S${(at % count) + 1}`; });
    const first = (reportSheets(document)[0].match(/<li data-entry="/g) ?? []).length;
    assert.ok(first === 0 || first >= 3, `with ${count} sections page 1 ends on ${first} serious items`);
  }
});

test("a summary folds its last sections into one row only where a second page would be left part empty, and keeps every count", () => {
  const document = standard(2, 0, 88);
  const pack = document.packs[0];
  pack.description = PURPOSE.repeat(6);
  pack.sections = Array.from({ length: 30 }, (_, at) => ({ identifier: `S${at + 1}`, title: `Section ${at + 1}` }));
  pack.entries_asked.forEach((one, at) => { one.section = `S${(at % 30) + 1}`; });
  const sheets = reportSheets(document);
  const sheet = sheets[0];
  assert.match(sheets[1], /class="facts"/);
  assert.doesNotMatch(sheet, /data-cut=/);
  const shown = (sheet.match(/<tr data-section="/g) ?? []).length;
  const folded = Number((sheet.match(/<tr data-others="(\d+)"/) ?? [])[1]);
  assert.ok(shown >= 4 && folded > 0, `${shown} sections shown, ${folded} folded`);
  assert.strictEqual(shown + folded, 30);
  const totals = [...sheet.match(/<tr class="total">([\s\S]*?)<\/tr>/)[1].matchAll(/<td[^>]*>(\d+)<\/td>/g)].map((one) => Number(one[1]));
  assert.strictEqual(totals.at(-1), 90);
  assert.ok((sheet.match(/<li data-entry="/g) ?? []).length >= 1);
});

test("the findings detail's total counts weaknesses and leaves out the controls found working", () => {
  const sheet = detailSheets()[0];
  const totals = [...sheet.match(/<tr class="total">([\s\S]*?)<\/tr>/)[1].matchAll(/<td[^>]*>(\d+)<\/td>/g)].map((one) => Number(one[1]));
  assert.strictEqual(totals.at(-1), 4);
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
