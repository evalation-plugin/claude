"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { removal } = require("../lib/remove.js");

const folderOf = (path) => realpathSync(path).replace(/[^A-Za-z0-9]/g, "-");

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-home-"));
  const claude = mkdtempSync(join(tmpdir(), "claude-home-"));
  const read = mkdtempSync(join(tmpdir(), "client-repo-"));
  const solution = mkdtempSync(join(tmpdir(), "client-solution-"));
  const unrelated = mkdtempSync(join(tmpdir(), "own-work-"));
  mkdirSync(join(home, "findings"), { recursive: true });
  writeFileSync(join(home, "findings", "run.json"), JSON.stringify({ run: "run-1", target: { path: read } }));
  mkdirSync(join(home, "solutions"), { recursive: true });
  writeFileSync(join(home, "solutions", "s.json"), JSON.stringify({ root: solution, name: "Client", leave: [] }));
  mkdirSync(join(home, "questions"), { recursive: true });
  writeFileSync(join(home, "questions", "Broker questions.json"), "{}");
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "client-box", secrets: {
    installation_key: "store:evalation/client-box.installation-key", receiving_key: "store:evalation/client-box.receiving-key" } }));
  for (const one of [read, solution, unrelated]) {
    mkdirSync(join(claude, "projects", folderOf(one)), { recursive: true });
    writeFileSync(join(claude, "projects", folderOf(one), "session.jsonl"), "{}\n");
  }
  writeFileSync(join(claude, "history.jsonl"), [read, solution, unrelated]
    .map((one) => JSON.stringify({ display: "a prompt", project: realpathSync(one) })).join("\n") + "\n");
  return { home, claude, read, solution, unrelated };
}

test("removal revokes the installation, forgets every key, deletes the hidden folder and clears the history of what was read", () => {
  const { home, claude, read, solution, unrelated } = machine();
  const forgot = [];
  let revoked = 0;
  const done = removal({ home, claude, cwd: read, clearHistory: true, revoke: () => { revoked += 1; }, forget: (service, account) => forgot.push(`${service}/${account}`) });
  assert.strictEqual(revoked, 1);
  assert.deepStrictEqual(forgot.sort(), ["evalation/client-box.installation-key", "evalation/client-box.receiving-key", "evalation/client-box.receiving-key-previous"]);
  assert.strictEqual(existsSync(home), false);
  assert.strictEqual(existsSync(join(claude, "projects", folderOf(read))), false);
  assert.strictEqual(existsSync(join(claude, "projects", folderOf(solution))), false);
  assert.strictEqual(existsSync(join(claude, "projects", folderOf(unrelated))), true);
  const left = readFileSync(join(claude, "history.jsonl"), "utf8").trim().split("\n").map((one) => JSON.parse(one).project);
  assert.deepStrictEqual(left, [realpathSync(unrelated)]);
  assert.deepStrictEqual(done.history.folders.sort(), [realpathSync(read), realpathSync(solution)].sort());
});

test("without a yes to clearing it, Claude Code's history is left alone", () => {
  const { home, claude, read } = machine();
  removal({ home, claude, cwd: read, clearHistory: false, revoke: () => {}, forget: () => {} });
  assert.strictEqual(existsSync(home), false);
  assert.strictEqual(existsSync(join(claude, "projects", folderOf(read))), true);
  assert.strictEqual(readFileSync(join(claude, "history.jsonl"), "utf8").trim().split("\n").length, 3);
});

test("where the server cannot revoke the installation, nothing is deleted, since the keys are what could revoke it later", () => {
  const { home, claude, read } = machine();
  assert.throws(() => removal({ home, claude, cwd: read, clearHistory: true, revoke: () => { throw new Error("offline"); }, forget: () => {} }),
    /could not revoke this installation \(offline\), so nothing was removed/);
  assert.strictEqual(existsSync(home), true);
  assert.strictEqual(existsSync(join(claude, "projects", folderOf(read))), true);
});
