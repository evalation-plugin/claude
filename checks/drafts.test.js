"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, sep } = require("node:path");
const { home } = require("./fixture.js");

const HOOK = join(__dirname, "..", "bin", "evalation-drafts");
const drafts = join(home, "drafts");
mkdirSync(drafts, { recursive: true });
const outside = mkdtempSync(join(tmpdir(), "evalation-outside-"));
writeFileSync(join(outside, "secret.txt"), "not ours\n");
mkdirSync(join(home, "drafts-evil"), { recursive: true });
writeFileSync(join(drafts, "answer-1.txt"), "an answer\n");

function decided(tool, path) {
  const ran = spawnSync(process.execPath, [HOOK], { encoding: "utf8", env: process.env,
    input: JSON.stringify({ tool_name: tool, tool_input: { file_path: path } }) });
  assert.strictEqual(ran.status, 0, ran.stderr);
  return ran.stdout.trim() ? JSON.parse(ran.stdout).hookSpecificOutput?.permissionDecision : undefined;
}

test("a Read or Write of a file in the plugin's drafts folder needs no permission prompt", () => {
  assert.strictEqual(decided("Read", join(drafts, "answer-1.txt")), "allow");
  assert.strictEqual(decided("Write", join(drafts, "claims.json")), "allow", "a file not written yet is allowed too");
});

test("anything outside the drafts folder is left to Claude Code to decide", () => {
  let linked = true;
  try {
    symlinkSync(join(outside, "secret.txt"), join(drafts, "link.txt"));
    symlinkSync(join(outside, "not-yet.txt"), join(drafts, "dangling.txt"));
  } catch {
    linked = false;
  }
  for (const path of [
    join(outside, "secret.txt"),
    `${drafts}${sep}..${sep}evalation.local`,
    join(home, "drafts-evil", "answer.txt"),
    "drafts/answer-1.txt",
    ...(linked ? [join(drafts, "link.txt"), join(drafts, "dangling.txt")] : []),
  ]) {
    assert.strictEqual(decided("Read", path), undefined, path);
    assert.strictEqual(decided("Write", path), undefined, path);
  }
  assert.strictEqual(decided("Bash", join(drafts, "answer-1.txt")), undefined);
});

test("the plugin registers the drafts hook for Read and Write", () => {
  const hooks = JSON.parse(readFileSync(join(__dirname, "..", "hooks", "hooks.json"), "utf8")).hooks.PreToolUse;
  assert.ok(hooks.some((one) => one.matcher === "Read|Write" && one.hooks.some((each) => each.command.endsWith("/bin/evalation-drafts"))));
});
