"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync } = require("node:fs");
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

const laidOut = (document) => {
  const { writeFileSync } = require("node:fs");
  const { browser, settled } = require("../lib/print.js");
  const asked = new Map();
  for (const pack of document.packs) for (const one of pack.entries_asked ?? []) asked.set(`${pack.pack}/${one.identifier}`, one);
  const file = join(mkdtempSync(join(tmpdir(), "evalation-flow-")), "pack.html");
  writeFileSync(file, page(document, document.answers.filter((one) => one.pack === "soc2"), asked));
  return settled(browser(), file).split('<div class="sheet">').slice(1);
};

const many = (document, cards) => {
  const soc2 = document.packs[0];
  soc2.entries_asked = Array.from({ length: cards }, (_, at) => ({ identifier: `CC6.${at + 1}`, title: `Access rule ${at + 1}`,
    intent: "How does this repository restrict access to what each person may do?", bears_on: "repository",
    looks_for: Array.from({ length: 4 }, (_, n) => ({ find: `Thing ${n + 1} this rule looks for`, proof: "runs" })) }));
  soc2.selected = soc2.entries_asked.map((one) => one.identifier);
  document.answers = soc2.entries_asked.map((one) => ({ pack: "soc2", entry: one.identifier, status: "partial-gap",
    because: "A guard exists on most routes. Two routes skip it, and nothing written says why. The reading checked every route file.",
    remedy: "Put the two routes behind the shared guard.", looked_for: Array.from({ length: 4 }, () => ({ result: "found",
      evidence: [{ path: "src/auth.js", from: 1, to: 3, quote: "if (!req.session)\n  return deny()\nnext()", grade: "executable" }] })) }));
  return document;
};

test("a card that reaches the foot of a page flows on to the next, faded out and in, and says where it continues", () => {
  const sheets = laidOut(many(run(tree), 12));
  const flowed = sheets.findIndex((one) => /class="entry( [a-z-]+)*"[\s\S]*class="entry opens continues"/.test(one));
  assert.ok(flowed >= 0, "some card shares its page with the card before it and flows on");
  const opening = sheets[flowed].slice(sheets[flowed].indexOf('class="entry opens continues"'));
  assert.match(opening, /class="head"/);
  assert.match(opening, /class="asked"/);
  assert.match(opening, new RegExp(`class="onward">Continued on page ${flowed + 2}<`));
  const id = opening.match(/class="id">([^<]+)</)[1];
  const next = sheets[flowed + 1];
  assert.match(next.slice(next.indexOf("class=\"entry")), new RegExp(`^class="entry part( last)? fades-in resumes"[^>]*>\\s*<div class="again">${id.replace(".", "\\.")} Access rule \\d+, continued<`));
  for (const one of sheets) {
    for (const item of one.split('class="cite item"').slice(1)) assert.match(item, /^><div class="where">/, "an item is never split from its heading");
    for (const box of one.split('class="did"').slice(1)) assert.match(box, /^><b>/, "What to do is never split");
  }
});

test("a citation prints its whole range and its first three lines, marked where more follows", () => {
  const document = run(tree);
  document.answers[0].looked_for[0].evidence = [
    { path: "docs/overview.md", from: 17, to: 21, quote: "core differentiator is a", grade: "assertion",
      lines: "The core differentiator is a single view\nof time across calendars,\nkept in sync" },
    { path: "src/auth.js", from: 1, to: 2, quote: "if (!req.session)", grade: "executable",
      lines: "export function guard(req) {\n  if (!req.session) throw new Error(\"signed out\");" },
  ];
  const asked = new Map(document.packs.flatMap((pack) => pack.entries_asked.map((one) => [`${pack.pack}/${one.identifier}`, one])));
  const html = page(document, document.answers.filter((one) => one.pack === "soc2"), asked);
  assert.match(html, /docs\/overview\.md:17-21<\/span>/);
  assert.match(html, /<pre>The core differentiator is a single view\nof time across calendars,\nkept in sync …<\/pre>/);
  assert.match(html, /<pre>export function guard\(req\) \{\n  if \(!req\.session\) throw new Error\(&quot;signed out&quot;\);<\/pre>/);
  assert.doesNotMatch(html, /<pre>core differentiator is a<\/pre>/);
});

test("an answer counts as cited when an item it looked for cites lines", () => {
  const document = run(tree);
  const soc2 = document.answers.filter((one) => one.pack === "soc2");
  assert.strictEqual(citing(soc2), 1);
  soc2[0].looked_for = [{ result: "missing", searched: "Looked everywhere." }];
  assert.strictEqual(citing(soc2), 0);
});

test("a report that could not be signed gives the reason in plain words", () => {
  const { unsignedWhy } = require("../lib/print.js");
  const document = run(tree);
  const asked = new Map(document.packs.flatMap((pack) => pack.entries_asked.map((one) => [`${pack.pack}/${one.identifier}`, one])));
  const folder = mkdtempSync(join(tmpdir(), "evalation-sign-"));
  const done = print(page(document, document.answers.filter((one) => one.pack === "soc2"), asked), join(folder, "pack.html"),
    join(folder, "pack.pdf"), { run: "run-check" }, readingOf(document));
  assert.strictEqual(done.signed, false);
  assert.strictEqual(done.unsigned, "this machine isn't signed in to Evalation");
  assert.strictEqual(unsignedWhy("unreachable: https://api.evalation.ai/sign (fetch failed)"), "Evalation's server couldn't be reached");
  assert.strictEqual(unsignedWhy("refused 402: the entitlement for this installation has ended, so nothing further can be served"),
    "this machine's access to Evalation has ended");
  assert.strictEqual(unsignedWhy("refused 422: this server holds no document signing key | print the report marked as unsigned"),
    "Evalation's server couldn't sign it");
});

test("a page that fails its check stops the report with one plain line naming the file, never a trace", () => {
  const { writeFileSync } = require("node:fs");
  const { spawnSync } = require("node:child_process");
  const document = { ...run(tree), schema: "evalation.findings.v1" };
  document.target.repository = "{{ repository }}";
  const folder = mkdtempSync(join(tmpdir(), "evalation-unfit-"));
  const file = join(folder, "findings.json");
  writeFileSync(file, JSON.stringify(document));
  const said = (command) => spawnSync(process.execPath, [join(__dirname, "..", "bin", command), file, join(folder, command)], { encoding: "utf8" });
  const report = said("evalation-report");
  assert.strictEqual(report.status, 1);
  const lines = report.stderr.trim().split("\n");
  assert.deepStrictEqual(lines.slice(0, -1), [
    "Evalation SOC 2 Trust Services Criteria Evidence Pack.pdf wasn't written, because its pages failed the check before printing.",
    "Your findings are kept. Printing the reports again uses no pack credits.",
    "To get it fixed, email support@evalation.ai with this file attached:"]);
  assert.match(readFileSync(lines.at(-1), "utf8"), /an unfilled slot reached the page: "\{\{ repository \}\}"/);
  assert.doesNotMatch(report.stderr, /unfilled|\n\s+at /);
  const deliver = said("evalation-deliver");
  assert.strictEqual(deliver.status, 1);
  assert.match(deliver.stderr, /^Evalation Hardening Review (Pack|Detail)\.pdf wasn't written, because its pages failed the check before printing\.\n/);
  assert.doesNotMatch(deliver.stderr, /unfilled|\n\s+at /);
});

test("any other print failure gives one plain line naming the file, and names the reports already written", () => {
  const { unwritten } = require("../lib/print.js");
  let thrown;
  try {
    print("<p>A page</p>", join(tree, "no-such-folder", "B Pack.html"), join(tree, "no-such-folder", "B Pack.pdf"), null, []);
  } catch (caught) {
    thrown = caught;
  }
  const said = unwritten(thrown, [join(tree, "A Pack.pdf")]);
  assert.match(said, /^B Pack\.pdf wasn't written, because printing it stopped\.\nA Pack\.pdf was written, in the same folder\.\nYour findings are kept/);
  const built = unwritten(new Error("boom")).split("\n");
  assert.strictEqual(built[0], "The reports weren't written, because building them stopped.");
  assert.strictEqual(readFileSync(built.at(-1), "utf8").trim(), "boom");
  assert.match(unwritten(Object.assign(new Error("spawnSync chrome ETIMEDOUT"), { code: "ETIMEDOUT", file: "/r/C Pack.pdf" })),
    /^C Pack\.pdf wasn't written, because the browser took longer than two minutes to print it\.\n/);
});

test("a cited file whose name is spelled the US way prints, since the name is the repository's own", () => {
  const { copyFileSync } = require("node:fs");
  const document = run(tree);
  copyFileSync(join(tree, "src", "auth.js"), join(tree, "src", "sanitize-color.js"));
  document.answers[0].looked_for[0].evidence[0].path = "src/sanitize-color.js";
  document.answers[0].looked_for[0].find = "Sanitisation of input before use, such as removal of control characters";
  const { into, done } = printedFrom(document);
  done();
  assert.ok(existsSync(into));
});

test("a US spelling never stops a report, since the customer paid for it", () => {
  const document = run(tree);
  document.target.repository = "Color Center";
  const { into, done } = printedFrom(document);
  done();
  assert.ok(existsSync(into));
});

test("a report the check refuses never stops the other packs of the run from printing", () => {
  const { writeFileSync } = require("node:fs");
  const { spawnSync } = require("node:child_process");
  const document = { ...run(tree), schema: "evalation.findings.v1" };
  const soc2 = document.packs.find((one) => one.pack === "soc2");
  document.packs = [{ ...soc2, pack: "aaa", title: "{{ title }}" }, ...document.packs];
  document.answers = [...document.answers.filter((one) => one.pack === "soc2").map((one) => ({ ...one, pack: "aaa" })), ...document.answers];
  const folder = mkdtempSync(join(tmpdir(), "evalation-others-"));
  const file = join(folder, "findings.json");
  writeFileSync(file, JSON.stringify(document));
  const report = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-report"), file, join(folder, "out")], { encoding: "utf8" });
  assert.strictEqual(report.status, 1);
  assert.match(report.stderr, /wasn't written, because its pages failed the check before printing\.\nEvalation SOC 2 Trust Services Criteria Evidence Pack\.pdf was written, in the same folder\.\n/);
  assert.ok(existsSync(join(folder, "out", "Evalation SOC 2 Trust Services Criteria Evidence Pack.pdf")));
});

test("a browser that stops says how, so the fault kept for support holds the cause", () => {
  const { writeFileSync } = require("node:fs");
  const { settled } = require("../lib/print.js");
  const folder = mkdtempSync(join(tmpdir(), "evalation-browser-"));
  writeFileSync(join(folder, "page.html"), "<p>A page</p>");
  assert.throws(() => settled(process.execPath, join(folder, "page.html")), (thrown) =>
    /exit status 9/.test(thrown.message) && /bad option: --/.test(thrown.message));
});

test("a slot the reading did not write is still refused", () => {
  const document = run(tree);
  document.answers[0].remedy = "Add 'environment: ${{ inputs.target }}' to the workflow.";
  document.target.repository = "{{ repository }}";
  const { done } = printedFrom(document);
  assert.throws(done, /an unfilled slot reached the page: "\{\{ repository \}\}"/);
});
