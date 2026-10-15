"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run } = require("./fixture.js");
const { page } = require("../bin/evalation-report");

const BIN = join(__dirname, "..", "bin");
const tree = repository();

function held() {
  const document = { schema: "evalation.findings.v1", ...run(tree) };
  document.packs[0].selected.push("CC1.2", "CC1.3");
  document.packs[0].entries_asked.push(
    { identifier: "CC1.2", title: "Board oversight", intent: "Who oversees the controls?", bears_on: "organisation" },
    { identifier: "CC1.3", title: "Repealed duty", intent: "What did the repealed duty require?", bears_on: "organisation", in_force: false },
  );
  document.answers.push(
    { pack: "soc2", entry: "CC1.2", status: "org-level", from: "authored", because: "The pack answers it.", justification: "No repository records oversight." },
    { pack: "soc2", entry: "CC1.3", status: "not-applicable", from: "authored", because: "The pack answers it.", justification: "The duty is repealed." },
  );
  return document;
}

const asking = (document) => new Map(document.packs.flatMap((pack) => (pack.entries_asked ?? []).map((one) => [`${pack.pack}/${one.identifier}`, one])));
const soc2 = (document) => document.answers.filter((one) => one.pack === "soc2");
const written = (document, leave) => page(document, soc2(document), asking(document), leave);
const apostrophes = (html) => html.replace(/&#39;/g, "'");

function printed(document, leave) {
  const folder = mkdtempSync(join(tmpdir(), "evalation-leave-"));
  const source = join(folder, "findings.json");
  writeFileSync(source, JSON.stringify(document));
  const ran = spawnSync(process.execPath, [join(BIN, "evalation-report"), source, join(folder, "out"), ...(leave ? ["--leave-out"] : [])], { encoding: "utf8" });
  assert.strictEqual(ran.status, 0, ran.stderr);
  const pdf = join(folder, "out", "Evalation SOC 2 Trust Services Criteria Evidence Pack.pdf");
  return { source, text: execFileSync("pdftotext", [pdf, "-"], { encoding: "utf8" }).replace(/\s+/g, " "), folder };
}

test("the page prints every clause as before, and with the flag drops the organisation's and the ones that do not apply", () => {
  const document = held();
  const every = written(document, false);
  for (const text of ["Where is conduct written down?", "Who oversees the controls?", "What did the repealed duty require?", "How does this repository restrict access?"]) assert.ok(every.includes(text), text);
  assert.ok(!every.includes("You asked to leave out"));
  const shorter = written(document, true);
  assert.ok(shorter.includes("How does this repository restrict access?"));
  for (const text of ["Where is conduct written down?", "Who oversees the controls?", "What did the repealed duty require?"]) assert.ok(!shorter.includes(text), text);
});

test("the main page says they were left out with how many of each, and still counts every entry", () => {
  const document = held();
  assert.ok(apostrophes(written(document, true)).includes("You asked to leave out 2 entries for the organisation to answer and one entry that doesn't apply."));
  assert.match(written(document, true), /<div class="n"[^>]*>2<\/div><div class="l">Org-level<\/div>/);
  assert.match(written(document, true), /<div class="n"[^>]*>1<\/div><div class="l">Not applicable<\/div>/);
  document.answers = document.answers.filter((one) => one.entry !== "CC1.3");
  assert.ok(written(document, true).includes("You asked to leave out 2 entries for the organisation to answer."));
});

test("a pack holding neither kind says nothing about leaving out, and still prints", () => {
  const document = held();
  document.answers = document.answers.filter((one) => one.status === "partial-gap");
  const shorter = written(document, true);
  assert.ok(!shorter.includes("You asked to leave out"));
  assert.ok(shorter.includes("How does this repository restrict access?"));
});

test("the PDF prints both ways and the findings file is the same either way", () => {
  const document = held();
  const every = printed(document, false);
  const shorter = printed(document, true);
  assert.ok(every.text.includes("Who oversees the controls?"));
  assert.ok(every.text.includes("What did the repealed duty require?"));
  assert.ok(!every.text.includes("You asked to leave out"));
  assert.ok(shorter.text.includes("How does this repository restrict access?"));
  for (const text of ["Who oversees the controls?", "What did the repealed duty require?", "Where is conduct written down?"]) assert.ok(!shorter.text.includes(text), text);
  assert.ok(shorter.text.includes("You asked to leave out 2 entries for the organisation to answer and one entry that doesn't apply."));
  assert.deepStrictEqual(JSON.parse(readFileSync(join(shorter.folder, "out", "Evalation Findings.json"), "utf8")), document);
  assert.deepStrictEqual(JSON.parse(readFileSync(shorter.source, "utf8")), document);
});

const sayLeaveOut = (document) => {
  const source = join(mkdtempSync(join(tmpdir(), "evalation-leave-say-")), "findings.json");
  writeFileSync(source, JSON.stringify(document));
  return spawnSync(process.execPath, [join(BIN, "evalation-run"), "--say", "leave-out", source], { encoding: "utf8", env: process.env });
};

test("the question counts only the kinds the run holds, and is not asked where it holds neither", () => {
  const both = sayLeaveOut(held());
  assert.strictEqual(both.status, 0, both.stderr);
  const asked = JSON.parse(both.stdout).questions[0];
  assert.strictEqual(asked.question, "Leave out 2 clauses for the organisation to answer and one clause that doesn't apply from the reports?");
  assert.deepStrictEqual(asked.options.map((one) => one.label), ["Leave them out", "Print every clause"]);
  const orgOnly = held();
  orgOnly.answers = orgOnly.answers.filter((one) => one.status !== "not-applicable");
  assert.strictEqual(JSON.parse(sayLeaveOut(orgOnly).stdout).questions[0].question, "Leave out 2 clauses for the organisation to answer from the reports?");
  const neither = held();
  neither.answers = neither.answers.filter((one) => one.status === "partial-gap");
  const none = sayLeaveOut(neither);
  assert.strictEqual(none.status, 0, none.stderr);
  assert.strictEqual(none.stdout, "");
});
