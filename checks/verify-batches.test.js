// A verifier reads its grid whole or not at all: a command's output past about 30,000 characters is
// saved to a file the agent holds no tool to open, and five of a customer's seventeen batches were
// lost that way. Planning again also once deleted twelve batches of recorded answers before they
// were applied.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const VERIFY = join(__dirname, "..", "bin", "evalation-verify");
// What the agent is shown in place and in full. Output past it is saved to a file.
const SHOWN = 30000;

function verify(args, input) {
  return spawnSync(VERIFY, args, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/** A findings file of thirty findings, each citing forty long lines. */
function written() {
  const tree = mkdtempSync(join(tmpdir(), "evalation-batches-"));
  mkdirSync(join(tree, "src"));
  writeFileSync(join(tree, "src", "big.js"), Array.from({ length: 60 }, (_, at) => `const line${at} = "${"x".repeat(110)}";`).join("\n"));
  const findings = Array.from({ length: 30 }, (_, at) => ({ id: `f-${at}`, pack: "hardening", concern: "SEC01", severity: "low",
    title: `Finding ${at}`, observed: "Something is set in code.", at: { path: "src/big.js", from: 1, to: 40, quote: "const", grade: "executable" } }));
  const file = join(tree, "findings.json");
  writeFileSync(file, JSON.stringify({ packs: [], answers: [], accounted: [], findings }));
  return { tree, file };
}

test("every batch's grid is shown to its verifier whole", () => {
  const { tree, file } = written();
  const planned = JSON.parse(verify(["plan", file, tree]).stdout);
  for (let n = 1; n <= planned.batches; n += 1) {
    const grid = verify(["grid", file, String(n)]).stdout;
    assert.ok(grid.length <= SHOWN, `batch ${n} prints ${grid.length} characters`);
  }
});

test("planning again keeps answers recorded and not yet applied", () => {
  const { tree, file } = written();
  verify(["plan", file, tree]);
  verify(["record", file, "1"], "ROW 1: CONFIRMED | The cited lines hold it.");
  const again = verify(["plan", file, tree]);
  assert.notStrictEqual(again.status, 0);
  assert.match(again.stderr, /apply/);
  assert.match(verify(["grid", file, "1"]).stdout, /^ROW 2/);
});
