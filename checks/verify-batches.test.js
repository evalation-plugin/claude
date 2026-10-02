// A verifier reads its grid whole or not at all: a command's output past about 30,000 characters is
// saved to a file the agent holds no tool to open, and five of a customer's seventeen batches were
// lost that way. Planning again also once deleted twelve batches of recorded answers before they
// were applied, which answers kept by claim make harmless.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");

const VERIFY = join(__dirname, "..", "bin", "evalation-verify");
// What the agent is shown in place and in full. Output past it is saved to a file.
const SHOWN = 30000;

function verify(args, input) {
  return spawnSync(process.execPath, [VERIFY, ...args], { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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

test("one claim citing long lines is still shown whole, and says where the rest of its lines are", () => {
  const tree = mkdtempSync(join(tmpdir(), "evalation-batches-"));
  writeFileSync(join(tree, "CHANGELOG.md"), Array.from({ length: 260 }, (_, at) => `- entry ${at} ${"y".repeat(1800)}`).join("\n"));
  const findings = ["a", "b"].map((id) => ({ id, pack: "hardening", concern: "SEC01", severity: "low", title: `Finding ${id}`,
    observed: "A changelog.", at: { path: "CHANGELOG.md", from: 105, to: 251, quote: "entry", grade: "assertion" } }));
  const file = join(tree, "findings.json");
  writeFileSync(file, JSON.stringify({ packs: [], answers: [], accounted: [], findings }));
  const planned = JSON.parse(verify(["plan", file, tree]).stdout);
  for (let n = 1; n <= planned.batches; n += 1) {
    const grid = verify(["grid", file, String(n)]).stdout;
    assert.ok(grid.length <= SHOWN, `batch ${n} prints ${grid.length} characters`);
    assert.match(grid, /entry 104 /, "the citation's first line is shown");
    assert.match(grid, /evalation-read \S+ read CHANGELOG\.md \d+ 251/, "the verifier is told how to read the lines not shown");
  }
});

test("a missing item that cites the mechanism lacking the control shows its verifier those lines", () => {
  const tree = mkdtempSync(join(tmpdir(), "evalation-batches-"));
  mkdirSync(join(tree, "src"));
  writeFileSync(join(tree, "src", "auth.js"), "export function signIn(user) {\n  return session(user);\n}\n");
  const { itemShown } = require("../bin/evalation-verify");
  const shown = itemShown(tree, { find: "A second factor checked in the sign-in flow", proof: "runs", result: "missing", searched: "Looked for a second factor.",
    evidence: [{ path: "src/auth.js", from: 1, to: 3, quote: "return session(user)", grade: "executable" }] }, 0).join("\n");
  assert.match(shown, /searched: Looked for a second factor\./);
  assert.match(shown, /return session\(user\)/);
});

test("the reader and the verifier are both told an item is found only where the lines are what it means within its question", () => {
  const { tree, file } = written();
  verify(["plan", file, tree]);
  const grid = verify(["grid", file, "1"]).stdout.replace(/\s+/g, " ");
  const FINDINGS = join(__dirname, "..", "bin", "evalation-findings");
  const shape = spawnSync(process.execPath, [FINDINGS, "shape"], { encoding: "utf8" }).stdout.replace(/\s+/g, " ");
  for (const told of [grid, shape]) {
    assert.match(told, /what the item means within the entry's question/);
    assert.match(told, /product doing its own job/);
  }
});

test("planning again keeps answers recorded and not yet applied, each on its own claim", () => {
  const { tree, file } = written();
  verify(["plan", file, tree]);
  verify(["record", file, "1"], "ROW 1: CONFIRMED | The cited lines hold it.");
  const again = verify(["plan", file, tree]);
  assert.strictEqual(again.status, 0, again.stderr);
  // The new plan leaves out the claim answered, so its first row is another claim.
  verify(["record", file, "1"], "ROW 1: NOT-CONFIRMED | The lines do not hold it.");
  assert.strictEqual(verify(["apply", file, "a model"]).status, 0);
  const findings = new Map(JSON.parse(readFileSync(file, "utf8")).findings.map((one) => [one.id, one.verification.verdict]));
  assert.strictEqual(findings.get("f-0"), "confirmed");
  assert.strictEqual(findings.get("f-1"), "not-confirmed");
});
