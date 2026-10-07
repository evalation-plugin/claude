"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, mkdtempSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");

const ROOT = join(__dirname, "..");
const ERRORS = join(ROOT, "lib", "errors.js");
const RUN_SAY = join(ROOT, "lib", "run-say.js");

const envFor = (home) => {
  const env = { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local") };
  delete env.EVALATION_REPORTING;
  delete env.EVALATION_SERVER;
  return env;
};
const heldIn = (home) => (existsSync(join(home, "errors.jsonl"))
  ? readFileSync(join(home, "errors.jsonl"), "utf8").split("\n").filter(Boolean).map((one) => JSON.parse(one)) : []);
const ran = (script, home, cwd = home) => spawnSync(process.execPath, ["-e", script], { cwd, encoding: "utf8", env: envFor(home) });

test("a command that refuses its input holds one report with the refusal's scrubbed text", () => {
  const folder = join(mkdtempSync(join(tmpdir(), "evalation-refusal-")), "zebracorn");
  mkdirSync(folder);
  const home = mkdtempSync(join(tmpdir(), "evalation-refusal-"));
  const refusal = [
    "the findings are refused:",
    `  soc2/CC6.1: a semicolon. This is read by somebody deciding what to do about it, so it holds to the writing standard: "We store keys; rotate"`,
    `  ${folder}/src/app.js cites line 12, past the 9 lines it holds (fix)`,
  ].join("\n");
  const script = `require(${JSON.stringify(ERRORS)}); process.stderr.write(${JSON.stringify(`${refusal}\n`)}); process.exit(1);`;
  const said = ran(script, home, folder);
  assert.strictEqual(said.status, 1);
  assert.strictEqual(said.stderr, `${refusal}\n`);
  const held = heldIn(home);
  assert.strictEqual(held.length, 1, JSON.stringify(held));
  assert.strictEqual(held[0].failure, "input-refused");
  assert.strictEqual(held[0].subject, "the findings are refused:");
  assert.match(held[0].text, /^the findings are refused:\n<path> a semicolon\. This is read by somebody .* writing standard: <id>\n/);
  assert.match(held[0].text, /\n<path> cites line <n> past the <n> lines it holds fix$/);
  for (const secret of ["zebracorn", "We store", "rotate", "app.js", "/", tmpdir()]) assert.ok(!held[0].text.includes(secret), `${secret} reached ${held[0].text}`);
});

test("a command that ends well or misuses its arguments holds nothing, and a crash holds its own report alone", () => {
  for (const [code, status] of [["process.exit(0)", 0], ["process.exit(2)", 2]]) {
    const home = mkdtempSync(join(tmpdir(), "evalation-refusal-"));
    const said = ran(`require(${JSON.stringify(ERRORS)}); process.stderr.write("usage: x\\n"); ${code};`, home);
    assert.strictEqual(said.status, status);
    assert.deepStrictEqual(heldIn(home), [], code);
  }
  const home = mkdtempSync(join(tmpdir(), "evalation-refusal-"));
  ran(`require(${JSON.stringify(ERRORS)}); throw new Error("it broke");`, home);
  assert.deepStrictEqual(heldIn(home).map((one) => one.failure), ["uncaught-error"]);
});

test("a fault /ev-run stops on holds a report carrying the fault file's text", () => {
  const home = mkdtempSync(join(tmpdir(), "evalation-refusal-"));
  const detail = "evalation-findings: the findings are refused:\n  soc2/CC6.1: a semicolon";
  ran(`require(${JSON.stringify(ERRORS)}); require(${JSON.stringify(RUN_SAY)}).fault("stopped", ${JSON.stringify(detail)});`, home);
  const held = heldIn(home);
  assert.strictEqual(held.length, 1, JSON.stringify(held));
  assert.strictEqual(held[0].failure, "run-stopped");
  assert.strictEqual(held[0].text, "<id> the findings are refused:\n<path> a semicolon");
});

test("a report's text is held to its form, and a report held before text existed is still sent", () => {
  const { admitted, built, textOf } = require("../lib/errors.js");
  const good = built("input-refused", undefined, "refused", new Set(), null, "refused\nat line 3");
  assert.ok(admitted(good));
  assert.strictEqual(good.text, "refused\nat line <n>");
  for (const text of ["a_b", "x".repeat(2001), "tab\there", "open /srv/a"]) assert.ok(!admitted({ ...good, text }), text);
  assert.ok(admitted({ ...good, text: null }));
  const { text, ...older } = good;
  assert.ok(admitted(older));
  const long = textOf(Array.from({ length: 600 }, () => "word").join(" "), new Set());
  assert.ok(long.length <= 2000 && !long.endsWith(" "), String(long.length));
});
