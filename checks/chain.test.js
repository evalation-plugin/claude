"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const HOOK = join(ROOT, "bin", "evalation-chain");

function decided(command, tool = "Bash") {
  const done = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ tool_name: tool, tool_input: { command } }), encoding: "utf8" });
  return { status: done.status, said: done.stderr };
}

test("a command joining two or more plugin scripts is refused, with the session told to run each in its own call", () => {
  for (const command of [
    "evalation-questions show \"a.json\"; echo ====; evalation-questions approve \"a.json\"",
    "evalation-questions show a.json && evalation-questions approve a.json",
    "evalation-questions check a.json || evalation-say ev-questions.checking",
    "evalation-questions list | evalation-say ev-questions.listed-none",
    "evalation-questions show a.json\nevalation-questions approve a.json",
    "evalation-status & evalation-packs show",
    "X=1 ${CLAUDE_PLUGIN_ROOT}/bin/evalation-say one;/opt/plugin/bin/evalation-say two",
    "evalation-questions verdict a.json Q1 <<'EOF'\nQ1 C5: NO\nEOF\nevalation-questions check a.json",
  ]) {
    const { status, said } = decided(command);
    assert.strictEqual(status, 2, command);
    assert.match(said, /each in its own call/, command);
  }
});

test("one plugin script, with anything quoted, a heredoc body or other commands joined, passes", () => {
  for (const command of [
    "evalation-questions show \"a.json\"",
    "evalation-questions check \"a; evalation-questions approve b\"",
    "evalation-questions check 'a && evalation-say b'",
    "evalation-questions verdict a.json Q1 <<'EOF'\nQ1 C5: YES | \"once; then | evalation-say x\"\nEOF",
    "evalation-questions show a.json 2>&1; echo done",
    "ls | grep evalation-questions",
    "git status && git log -1",
  ]) {
    const { status, said } = decided(command);
    assert.strictEqual(status, 0, `${command}: ${said}`);
  }
  assert.strictEqual(decided("evalation-status; evalation-packs show", "Read").status, 0, "only Bash is judged");
});

test("the plugin registers the chain hook for Bash", () => {
  const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8")).hooks.PreToolUse;
  assert.ok(hooks.some((one) => one.matcher === "Bash" && one.hooks.some((each) => each.command.endsWith("/bin/evalation-chain"))));
});
