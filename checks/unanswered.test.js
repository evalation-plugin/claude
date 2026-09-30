"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { home, repository } = require("./fixture.js");

const BIN = join(__dirname, "..", "bin");
const script = (name, args, input) => spawnSync(process.execPath, [join(BIN, name), ...args], { encoding: "utf8", input, env: process.env });
const held = () => readdirSync(home, { recursive: true }).sort();

function solution() {
  const at = mkdtempSync(join(tmpdir(), "evalation-solution-"));
  repository(join(at, "api"));
  repository(join(at, "infra"));
  mkdirSync(join(at, "notes"));
  writeFileSync(join(at, "notes", "runbook.md"), "# Restore\n");
  return at;
}

const RECORDERS = (at) => [
  ["evalation-run", (answer) => ["--solution", at, "--name", answer]],
  ["evalation-run", (answer) => ["--solution", at, "--name", "Acme", "--leave", answer]],
  ["evalation-run", (answer) => [at, answer]],
  ["evalation-packs", (answer) => ["set", answer]],
  ["evalation-activate", (answer) => ["company", answer]],
  ["evalation-questions", (answer) => ["keep-on-account", answer]],
  ["evalation-remove", (answer) => ["keep-sets", answer]],
  ["evalation-buy", (answer) => ["checkout", answer]],
  ["evalation-scan", (answer) => ["install", answer]],
  ["evalation-scan", (answer) => ["decline", answer]],
];

test("every script that records an answer refuses a missing one, says so in a field and saves nothing", () => {
  const at = solution();
  for (const [name, args] of RECORDERS(at)) {
    for (const answer of ["[No preference]", "No preference", "", "  "]) {
      const before = held();
      const done = script(name, args(answer));
      const said = `${name} ${JSON.stringify(args(answer))}`;
      assert.strictEqual(done.status, 3, `${said} exits 3, got ${done.status}: ${done.stderr}`);
      assert.strictEqual(JSON.parse(done.stdout).kind, "unanswered", said);
      assert.deepStrictEqual(held(), before, `${said} saves nothing`);
    }
  }
});

const asked = (question, answer) => JSON.stringify({ tool_name: "AskUserQuestion", tool_input: { questions: [{ question }] },
  tool_response: { questions: [{ question }], answers: { [question]: answer } } });
const NAME = "What should the reports call this product?";

test("a dismissed Evalation question stops the command, and no answer is saved until the person speaks", () => {
  const at = solution();
  const stopped = script("evalation-unanswered", ["asked"], asked(NAME, "[No preference]"));
  assert.strictEqual(stopped.status, 0, stopped.stderr);
  assert.strictEqual(JSON.parse(stopped.stdout).decision, "block");
  const before = held();
  const refused = script("evalation-run", ["--solution", at, "--name", "Acme"]);
  assert.strictEqual(refused.status, 3, "a default the session picked in the person's place is refused too");
  assert.deepStrictEqual(held(), before);
  assert.strictEqual(script("evalation-unanswered", ["prompt"], "{}").status, 0);
  assert.strictEqual(script("evalation-run", ["--solution", at, "--name", "Acme"]).status, 0);
});

test("an answered Evalation question, or anyone else's question, passes untouched", () => {
  assert.strictEqual(script("evalation-unanswered", ["asked"], asked(NAME, "Use Acme")).stdout, "");
  assert.strictEqual(script("evalation-unanswered", ["asked"], asked("Which database should I use?", "[No preference]")).stdout, "");
  const told = (text) => JSON.stringify({ tool_input: { questions: [{ question: NAME }] }, tool_response: text });
  assert.strictEqual(script("evalation-unanswered", ["asked"], told(`The user answered: "${NAME}"="Use Acme".`)).stdout, "");
  assert.match(script("evalation-unanswered", ["asked"], told(`The user answered: "${NAME}"="[No preference]".`)).stdout, /"block"/);
  script("evalation-unanswered", ["prompt"], "{}");
});

test("a No preference a past run saved reads as unset", () => {
  const at = solution();
  const { choose, solutionOf } = require("../lib/solution.js");
  choose(at, { name: "No preference", leave: ["[No preference]", "notes"] });
  assert.strictEqual(solutionOf(at).name, null);
  assert.ok(solutionOf(at).left_out.some((one) => one.folder === "notes"));
});
