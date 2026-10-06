"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");
const { page } = require("../bin/evalation-report");
const { browser, settled } = require("../lib/print.js");

const tree = repository();
scanned(tree, []);
const LINE = "This report sets out evidence from the code and is not advice on whether to invest.";

const summaryOf = (name) => {
  const document = run(tree);
  document.packs[0].pack = name;
  for (const one of document.answers) if (one.pack === "soc2") one.pack = name;
  const asked = new Map();
  for (const pack of document.packs) for (const one of pack.entries_asked ?? []) asked.set(`${pack.pack}/${one.identifier}`, one);
  const file = join(mkdtempSync(join(tmpdir(), "evalation-closing-")), "page.html");
  writeFileSync(file, page(document, document.answers.filter((one) => one.pack === name), asked));
  return settled(browser(), file).split('<div class="sheet">')[1];
};

test("the investment pack's summary closes on the line saying it is not advice on whether to invest", () => {
  assert.match(summaryOf("investment-diligence"), new RegExp(`data-part="closing"[\\s\\S]*${LINE.replace(/\./g, "\\.")}`));
});

test("a pack with no closing line in the catalogue prints none", () => {
  const sheet = summaryOf("soc2");
  assert.doesNotMatch(sheet, /data-part="closing"/);
  assert.ok(!sheet.includes(LINE));
});
