"use strict";

const test = require("node:test");
const assert = require("node:assert");
require("./fixture.js");
const { atEdition, editionsOf, monthOf } = require("../lib/editions.js");
const { served } = require("../bin/evalation-run");
const words = require("../lib/run-say.js");

const RUNS = { find: "A shared check every protected route passes through", proof: "runs" };
const ism = {
  pack: "ism", kind: "standard", title: "Australian Information Security Manual", version: "September 2026",
  entries: [
    { identifier: "ISM-0001", title: "Kept", intent: "What does it hold now?", bears_on: "repository", looks_for: [RUNS] },
    { identifier: "ISM-0002", title: "Reworded", intent: "What does it hold now?", bears_on: "repository", looks_for: [RUNS],
      editions: ["2026-09"], earlier: [{ editions: ["2024-09", "2025-03"], intent: "What did it hold then?" }] },
    { identifier: "ISM-0003", title: "Added", intent: "Is the new control met?", bears_on: "repository", looks_for: [RUNS], editions: ["2026-09"] },
    { identifier: "ISM-0004", title: "Withdrawn", intent: "Was the old control met?", bears_on: "repository", looks_for: [RUNS], editions: ["2024-09", "2025-03"] },
  ],
};

test("a pack with no edition tags has no editions to choose", () => {
  assert.deepStrictEqual(editionsOf({ entries: [{ identifier: "CC6.1" }] }), []);
});

test("a pack's editions are every edition its entries name, newest first", () => {
  assert.deepStrictEqual(editionsOf(ism), ["2026-09", "2025-03", "2024-09"]);
});

test("an edition is named as the month it took effect", () => {
  assert.strictEqual(monthOf("2026-09"), "September 2026");
  assert.strictEqual(monthOf("2025-03"), "March 2025");
});

test("an edition holds its own entries in the wording it used", () => {
  const held = atEdition(ism, "2024-09");
  assert.deepStrictEqual(held.entries.map((one) => one.identifier), ["ISM-0001", "ISM-0002", "ISM-0004"]);
  assert.strictEqual(held.entries[1].intent, "What did it hold then?");
  assert.strictEqual(held.entries[1].title, "Reworded");
  assert.ok(held.entries.every((one) => !("earlier" in one) && !("editions" in one)));
  assert.strictEqual(held.version, "September 2024");
});

test("the latest edition holds the latest wording and leaves out what it withdrew", () => {
  const held = atEdition(ism, "2026-09");
  assert.deepStrictEqual(held.entries.map((one) => one.identifier), ["ISM-0001", "ISM-0002", "ISM-0003"]);
  assert.strictEqual(held.entries[1].intent, "What does it hold now?");
});

test("a run reads the edition chosen, and the latest where none was chosen", () => {
  const answer = { run: "run-1", revision: "1.91", packs: [{ pack: "ism", kind: "standard", body: ism }] };
  const chosen = served(answer, [], null, { ism: "2025-03" });
  assert.strictEqual(chosen.packs[0].body.version, "March 2025");
  assert.deepStrictEqual(chosen.to_read[0].entries.map((one) => one.identifier), ["ISM-0001", "ISM-0002", "ISM-0004"]);
  const latest = served(answer, [], null, {});
  assert.strictEqual(latest.packs[0].body.version, "September 2026");
  assert.deepStrictEqual(latest.to_read[0].entries.map((one) => one.identifier), ["ISM-0001", "ISM-0002", "ISM-0003"]);
});

test("a run of a pack with no edition tags reads it as it was served", () => {
  const body = { pack: "soc2", kind: "standard", title: "SOC 2", version: "2017", entries: [{ identifier: "CC6.1", bears_on: "repository", looks_for: [RUNS] }] };
  const read = served({ run: "run-2", revision: "1.91", packs: [{ pack: "soc2", kind: "standard", body }] }, [], null, {});
  assert.deepStrictEqual(read.packs[0].body, body);
});

test("the edition question offers the latest first and an earlier edition, then each year, then its editions", () => {
  const editions = ["2026-09", "2026-06", "2026-03", "2025-12", "2025-09", "2025-06", "2025-03", "2024-12", "2024-09"];
  const first = JSON.parse(words.editionAsk({ title: ism.title, editions }));
  const labels = (asked) => asked.questions[0].options.map((one) => one.label);
  assert.deepStrictEqual(labels(first), ["September 2026", "An earlier edition"]);
  assert.deepStrictEqual(labels(JSON.parse(words.editionAsk({ title: ism.title, editions, earlier: true }))), ["2026", "2025", "2024"]);
  assert.deepStrictEqual(labels(JSON.parse(words.editionAsk({ title: ism.title, editions, year: "2025" }))),
    ["December 2025", "September 2025", "June 2025", "March 2025"]);
  assert.deepStrictEqual(labels(JSON.parse(words.editionAsk({ title: ism.title, editions, year: "2026" }))),
    ["June 2026", "March 2026"]);
});
