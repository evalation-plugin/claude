"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdtempSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");
const { page } = require("../bin/evalation-report");
const { print } = require("../lib/print.js");
const { readingOf } = require("../lib/prose.js");

const tree = repository();
scanned(tree, []);

const RESULTS = ["found", "missing", "does-not-apply", "not-checked", "no-evidence"];
const STATUSES = ["total-gap", "partial-gap", "covered", "no-evidence", "org-level", "not-applicable"];
const LONG = "Where the system takes payments, cancellations by its own customers carried out by code, such as a call to the payment provider or a billing portal";

const crowded = () => {
  const document = run(tree);
  const soc2 = document.packs[0];
  soc2.entries_asked = STATUSES.map((status, at) => ({ identifier: `CC6.${at + 1}`, title: `${LONG} ${status}`,
    obligation: at % 2 ? "addressable" : "mandatory", intent: "How does this repository restrict access?", bears_on: "repository",
    looks_for: RESULTS.map((result) => ({ find: `${LONG}, ${result}`, proof: "runs" })) }));
  soc2.selected = soc2.entries_asked.map((one) => one.identifier);
  document.answers = soc2.entries_asked.map((one, at) => ({ pack: "soc2", entry: one.identifier, status: STATUSES[at],
    model: "Opus 5.5 with a long reader name", because: "Read every route.", remedy: "Put the routes behind the guard.",
    looked_for: RESULTS.map((result) => result === "found"
      ? { result, evidence: [{ path: `src/${"deep/".repeat(12)}auth.js`, from: 107, to: 145, quote: "guard()", grade: "configuration" }] }
      : { result, searched: "Looked everywhere.", why: "No payments are taken." }) }));
  return document;
};

const printed = (document, squeeze = "") => {
  const asked = new Map();
  for (const pack of document.packs) for (const one of pack.entries_asked ?? []) asked.set(`${pack.pack}/${one.identifier}`, one);
  const folder = mkdtempSync(join(tmpdir(), "evalation-labels-"));
  const html = page(document, document.answers.filter((one) => one.pack === "soc2"), asked).replace(`<div id="source">`, `${squeeze}<div id="source">`);
  return print(html, join(folder, "pack.html"), join(folder, "pack.pdf"), null, readingOf(document));
};

test("every status, result, grade and obligation label on a crowded report prints on one line", () => {
  assert.strictEqual(printed(crowded()).printed, true);
});

test("a page whose label runs onto a second line is refused before it prints", () => {
  const squeeze = "<style>.pill{white-space:normal!important;width:0.3in!important;flex:none!important}</style>";
  assert.throws(() => printed(crowded(), squeeze), (thrown) => thrown.unfit === true &&
    thrown.faults.some((one) => /^a label runs onto a second line: "CC6\.\d+ /.test(one)));
});
