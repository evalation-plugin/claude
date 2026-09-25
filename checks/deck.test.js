// The board pack carries what changed since the last run, on a slide of its own, where there is one.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { home } = require("./fixture.js");
const { reviewFindings } = require("../bin/evalation-deliver");
const { synthesise } = require("../lib/synthesise.js");
const { deck } = require("../bin/evalation-deck");
const pptx = require("../lib/pptx.js");

const hardening = (at, results, score) => ({
  run: `run-${at}`, at, revision: "1.82", read_by: "Opus 5.5", target: { repository: "acme/deck" },
  packs: [{ pack: "hardening", kind: "concern-set", title: "Evalation Hardening Review",
    entries_asked: [{ identifier: "SEC01", title: "Untrusted input", looks_for: [{ find: "Parameterised queries" }, { find: "An input test" }] }] }],
  answers: [],
  findings: [{ id: "f-1", pack: "hardening", concern: "SEC01", severity: "high", title: "Queries built from input",
    observed: "Queries are built from input.", required: "Use parameters.", at: { path: "src/a.js", from: 1, to: 1 } }],
  accounted: [{ pack: "hardening", concern: "SEC01", because: "Read the queries.", looked_for: results.map((result) => ({ result })) }],
  hardness: { score, grade: "C", bars: [{ category: "SEC", score }] },
});

const texts = (file) => file.entries.filter((one) => /^ppt\/slides\/slide\d+\.xml$/.test(one.name))
  .map((one) => pptx.shapes(one.content.toString("utf8")).map((shape) => shape.text).join(" "));

test("a deck read after an earlier run has a slide saying what changed", () => {
  mkdirSync(join(home, "findings"), { recursive: true });
  writeFileSync(join(home, "findings", "deck-earlier.json"), JSON.stringify(hardening("2026-09-23T00:00:00.000Z", ["found", "found"], 70)));
  const shaped = synthesise(reviewFindings(hardening("2026-09-25T00:00:00.000Z", ["found", "missing"], 64)));
  const { file } = deck(shaped, join(mkdtempSync(join(tmpdir(), "evalation-deck-")), "Pack.pdf"), { render: false });
  const slide = texts(file).find((one) => /What changed since 23 September 2026/.test(one));
  assert.ok(slide, "a slide headed with the date of the earlier run");
  assert.match(slide, /The hardness score moved from 70 to 64/);
  assert.match(slide, /SEC01 Untrusted input/);
  assert.doesNotMatch(slide, /What we think of how it/);
});

test("a short slide keeps every block's bar, and its blocks sit at the template's spacing", () => {
  mkdirSync(join(home, "findings"), { recursive: true });
  writeFileSync(join(home, "findings", "deck-earlier.json"), JSON.stringify(hardening("2026-09-23T00:00:00.000Z", ["found", "found"], 70)));
  const shaped = synthesise(reviewFindings(hardening("2026-09-25T00:00:00.000Z", ["found", "missing"], 64)));
  const { file } = deck(shaped, join(mkdtempSync(join(tmpdir(), "evalation-deck-")), "Pack.pdf"), { render: false });
  const part = file.entries.find((one) => /^ppt\/slides\/slide\d+\.xml$/.test(one.name) && /What changed since/.test(one.content.toString("utf8")));
  const all = pptx.shapes(pptx.blank(pptx.stripNotes(part.content.toString("utf8"))));
  const blocks = all.filter((one) => one.left > 700_000 && one.left < 800_000 && one.text.trim());
  const bars = all.filter((one) => !one.text.trim() && one.left === 502920 && one.top > 1_600_000 && one.top < 6_400_000);
  assert.strictEqual(bars.length, blocks.length, "one bar per block");
  assert.ok(blocks[1].top - blocks[0].top < 1_000_000, "blocks at the template's pitch, not spread over the slide");
});

test("a deck with no earlier run has no such slide", () => {
  const shaped = synthesise(reviewFindings({ ...hardening("2026-09-25T00:00:00.000Z", ["found", "missing"], 64), target: { repository: "acme/first" } }));
  const { file } = deck(shaped, join(mkdtempSync(join(tmpdir(), "evalation-deck-")), "Pack.pdf"), { render: false });
  assert.ok(!texts(file).some((one) => /What changed since/.test(one)));
});
