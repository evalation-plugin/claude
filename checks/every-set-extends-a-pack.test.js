"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { home, repository } = require("./fixture.js");
const { entries } = require("../lib/say.js");
const { packQuestion, setsQuestion } = require("../lib/questions.js");
const { packs: packsAsk } = require("../lib/run-say.js");

const OURS = { name: "Evalation's own questions.", attribution: "Evalation" };
const question = { identifier: "Q1", title: "Sign in", asked: "do we check who is signed in", intent: "Where does this repository check who is signed in?",
  looks_for: [{ find: "A check of the signed-in session", proof: "runs" }] };

test("no line or answer offers a run of the person's own questions alone", () => {
  const names = Object.keys(entries());
  assert.deepStrictEqual(names.filter((name) => /^ev-run\.(packs-only|only-sets)|^ev-questions\.(only-mine|next-run-alone|change-alone|no-pack-takes)/.test(name)), []);
  const packs = [{ pack: "investment-diligence", body: { kind: "standard", title: "Evalation Investment Diligence", licence: OURS } },
    { pack: "cyber-insurance", body: { kind: "standard", title: "Evalation Cyber Insurance Risk", licence: OURS } }];
  const asked = JSON.parse(packQuestion(packs)).questions[0];
  assert.deepStrictEqual(asked.options.map((one) => one.label), ["Evalation Investment Diligence", "Evalation Cyber Insurance Risk"]);
  const offline = JSON.parse(packQuestion(null)).questions[0];
  assert.ok(!offline.options.some((one) => /on their own/i.test(one.label)), "an unreachable pack list never offers running the questions alone");
  const question = JSON.parse(packsAsk({ repository: "shop", credits: 3, usual: ["soc2"], titles: [{ pack: "soc2", title: "SOC 2" }],
    sets: [{ name: "Mine", pack: "custom" }] })).questions[0];
  assert.ok(!question.options.some((one) => /my questions/i.test(one.label)));
});

test("a set saved with no pack is listed as needing one, and choosing it asks which pack it extends", () => {
  const listing = { account: "reached", sets: [{ name: "Old set", pack: "custom", where: "machine" }, { name: "Other", pack: "cyber-insurance", where: "machine" }] };
  const asked = JSON.parse(setsQuestion(listing, {}, 1, "change")).questions[0];
  assert.deepStrictEqual(asked.options[0], { label: "Fix Old set", description: "Pick the pack it extends." });
});

test("a run given a set with no pack stops before asking the server, and says how to give it one", () => {
  const set = join(mkdtempSync(join(tmpdir(), "evalation-no-pack-")), "Mine.json");
  writeFileSync(set, JSON.stringify({ name: "Mine", pack: "custom", questions: [question] }));
  const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-run"), repository(), "soc2", "--questions", set],
    { encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_SERVER: "http://127.0.0.1:9" } });
  assert.strictEqual(ran.status, 1);
  assert.strictEqual(ran.stderr, "Your question set Mine extends no pack, so the run didn't start. No pack credits were used. Run /ev-questions to pick a pack for it.\n");
});
