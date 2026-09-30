"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { CRITERIA, grid, save, verdict } = require("../lib/questions.js");

const ROOT = join(__dirname, "..");
const CLI = join(ROOT, "bin", "evalation-questions");
const item = (find) => ({ find, proof: "runs" });
const code = (id, title, asked, finds) => ({ identifier: id, title, intent: `${title}?`, asked, looks_for: finds.map(item) });
const organisation = (id, title, asked) => ({ identifier: id, title, intent: `${title}?`, asked, bears_on: "organisation",
  justification: "Only the organisation's own records hold this." });
const passed = (rows) => rows.flatMap((row) => row.criteria.map((one) => `${row.label} ${one.id}: ${one.fault === "YES" ? "NO" : "YES"}`)).join("\n");

function ran(at, verb, file) {
  const done = spawnSync(process.execPath, [CLI, verb, file], { env: { ...process.env, EVALATION_PLUGIN_HOME: at }, encoding: "utf8" });
  assert.strictEqual(done.status, 0, done.stderr);
  return done.stdout.trimEnd().split("\n");
}

const changesOf = (printed) => printed.slice(0, printed.findIndex((one) => /^Q\d+ /.test(one))).filter(Boolean);

test("show says each change to the person's own questions once, by title, and nothing about requirements the plugin drafted", () => {
  const at = mkdtempSync(join(tmpdir(), "evalation-drafting-"));
  const file = join(at, "Security questions.json");
  const scripts = "are we leaking data through third party scripts";
  const phishing = "is our team trained on phishing";
  const admin = "what happens if someone steals an admin login";
  const first = { name: "Security questions", pack: "custom", questions: [
    code("Q1", "Third party scripts", scripts, ["A list of the third party scripts the product loads", "An incident response plan"]),
    organisation("Q2", "Phishing training", phishing),
    code("Q3", "Phished password protections", phishing, ["A second sign-in step for staff accounts"]),
    code("Q4", "Admin sign-in protections", admin, ["A second sign-in step for admin accounts"]),
    code("Q5", "Admin session limits", admin, ["A session lifetime set in configuration for admin sessions"]),
    code("Q6", "Customer data downloads", "would we know if someone downloaded all our customer data", ["A log entry written for each customer data export"]),
  ] };
  writeFileSync(file, JSON.stringify(first));
  ran(at, "check", file);
  const q6 = grid(at, first, CRITERIA, "Q6").rows;
  verdict(at, first, passed(q6).replace("Q6 C1: YES", "Q6 C1: NO | \"customer data\""), CRITERIA, "Q6");
  ran(at, "check", file);

  const after = { ...first, questions: [{ ...first.questions[0], looks_for: [item("A list of the third party scripts the product loads")] },
    ...first.questions.slice(1, 5)] };
  writeFileSync(file, JSON.stringify(after));
  ran(at, "check", file);

  const shown = ran(at, "show", file);
  const changes = changesOf(shown);
  assert.deepStrictEqual(changes, [
    "Phishing training is kept as your organisation's, since only your organisation's own records can answer it, and I added Phished password protections to ask what the code does about the same risk.",
    "'what happens if someone steals an admin login' became Admin sign-in protections and Admin session limits, since it covers more than one topic and each topic is checked on its own.",
    "I left out your question Customer data downloads, since it asks about something a repository would not hold.",
  ]);
  assert.deepStrictEqual(shown.slice(changes.length, changes.length + 2), ["", "Q1 Third party scripts"], "the whole set follows the changes");
  for (const one of changes) assert.doesNotMatch(one, /\bQ\d+\b/, "a question is named by its title");
  assert.doesNotMatch(shown.join("\n"), /incident response|want it back/i, "a requirement the plugin drafted and dropped is never reported");
  assert.deepStrictEqual(changesOf(ran(at, "show", file)), [], "each change is said once");

  save(at, after);
  const answer = ran(at, "path", "Security questions").at(-1);
  const copy = readFileSync(answer, "utf8").trim();
  assert.deepStrictEqual(changesOf(ran(at, "show", copy)), [], "a saved set opened to change repeats nothing said when it was written");
});

test("no catalogue line offers to undo a change, and the command words no change line itself", () => {
  const catalogue = JSON.parse(readFileSync(join(ROOT, "lib", "say", "ev-questions.json"), "utf8"));
  const offers = Object.entries(catalogue).filter(([, one]) => /want (it|them) back/i.test(JSON.stringify(one))).map(([name]) => name);
  assert.deepStrictEqual(offers, []);
  const command = readFileSync(join(ROOT, "commands", "ev-questions.md"), "utf8");
  for (const name of ["split", "kept-organisation", "kept-organisation-added", "left-out"]) {
    assert.doesNotMatch(command, new RegExp(`evalation-say ev-questions\\.${name}\\b`), `${name} is printed by evalation-questions show`);
  }
});

test("the outside-its-question criterion keeps an item that evidences the question's own subject", () => {
  const at = mkdtempSync(join(tmpdir(), "evalation-subject-"));
  const set = { name: "Scripts", pack: "custom", questions: [
    code("Q1", "Third party scripts", "are we leaking data through third party scripts", ["A list of the third party scripts the product loads"])] };
  const row = grid(at, set, CRITERIA, "Q1").rows.find((one) => one.about === "item");
  const outside = row.criteria.find((one) => /outside its question/.test(one.says));
  assert.ok(outside, "the item row is asked whether it is outside its question");
  assert.match(outside.asks, /the question's own subject/, "the criterion says an item on the question's own subject is inside it");
  assert.match(outside.asks, /a list of the third party scripts/i, "the criterion carries this case as its example");
  const command = readFileSync(join(ROOT, "commands", "ev-questions.md"), "utf8");
  assert.match(command, /Right: A list of the third party scripts the product loads/, "the drafter carries the right version too");
});
