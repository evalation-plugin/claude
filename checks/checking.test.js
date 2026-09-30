"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { CRITERIA, grid, verdict } = require("../lib/questions.js");

const CLI = join(__dirname, "..", "bin", "evalation-questions");
const question = (id, title, what) => ({ identifier: id, title, intent: `Where does this repository record each ${what} it takes?`, asked: `do we record each ${what}`,
  looks_for: [{ find: `Code that writes a record for each ${what}, such as a table insert`, proof: "runs" }] });
const answered = (rows) => rows.flatMap((row) => row.criteria.map((one) => `${row.label} ${one.id}: ${one.fault === "YES" ? "NO" : "YES"}`)).join("\n");

function checked(at, file) {
  const done = spawnSync(process.execPath, [CLI, "check", file], { env: { ...process.env, EVALATION_PLUGIN_HOME: at }, encoding: "utf8" });
  assert.strictEqual(done.status, 0, done.stderr);
  const printed = done.stdout.trimEnd().split("\n");
  assert.match(printed.at(-1), /answer-.*\.txt$/, "the answer file's path is the last line");
  return printed.slice(0, -1);
}

test("check says the checking line once per draft and each checked title once, so the session repeats neither", () => {
  const at = mkdtempSync(join(tmpdir(), "evalation-checking-"));
  const draft = { name: "Cyber Test Set", pack: "custom", questions: [question("Q1", "Payments are recorded", "payment"), question("Q2", "Refunds are recorded", "refund")] };
  const file = join(at, "Cyber Test Set.json");
  writeFileSync(file, JSON.stringify(draft));
  const checking = "Checking your questions. This can take a few minutes.";
  assert.deepStrictEqual(checked(at, file), [checking]);
  assert.deepStrictEqual(checked(at, file), [], "said once, even while questions still wait");
  verdict(at, draft, answered(grid(at, draft, CRITERIA, "Q1").rows), CRITERIA, "Q1");
  assert.deepStrictEqual(checked(at, file), ["Checked: Payments are recorded"]);
  verdict(at, draft, answered(grid(at, draft, CRITERIA, "Q2").rows), CRITERIA, "Q2");
  assert.deepStrictEqual(checked(at, file), ["Checked: Refunds are recorded"]);
  assert.deepStrictEqual(checked(at, file), []);
});

test("the command shows what check prints and never says the checking lines itself, and shows and approves in separate calls", () => {
  const command = readFileSync(join(__dirname, "..", "commands", "ev-questions.md"), "utf8");
  assert.doesNotMatch(command, /evalation-say ev-questions\.checking\b/);
  assert.doesNotMatch(command, /evalation-say ev-questions\.checked\b/);
  assert.match(command.replace(/\s+/g, " "), /each in a call of its own/);
});
