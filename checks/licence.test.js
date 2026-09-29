"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { repository } = require("./fixture.js");
const { licences, scan } = require("../bin/evalation-scan");
const scans = require("../lib/scans.js");

const pkg = (name, relation, ...held) => ({ ID: `${name}@1.0.0`, Name: name, Version: "1.0.0", Relationship: relation, ...(held.length ? { Licenses: held } : {}) });
const lockfile = (target, packages) => ({ Class: "lang-pkgs", Target: target, Type: "pnpm", Packages: packages });
const trivy = (...results) => JSON.stringify({ Results: [
  ...results,
  { Class: "license", Target: "pnpm-lock.yaml", Licenses: results.flatMap((one) => one.Packages.flatMap((each) =>
    (each.Licenses ?? []).map((name) => ({ PkgName: each.Name, FilePath: one.Target, Name: name, Category: "notice" })))) },
] });
const of = (said, key) => said.findings.find((one) => one.key === key);

test("a dependency under a restrictive licence is rated by the licence, and a choice of a permissive one is not counted", () => {
  const rated = (...held) => of(licences(trivy(lockfile("pnpm-lock.yaml", [pkg("fine", "direct", "MIT"), pkg("x", "indirect", ...held)])), ["pnpm-lock.yaml"]), "licence:restricted")?.severity ?? null;
  assert.strictEqual(rated("AGPL-3.0-only"), "critical");
  assert.strictEqual(rated("SSPL-1.0"), "critical");
  assert.strictEqual(rated("GPL-3.0-or-later"), "high");
  assert.strictEqual(rated("GPL-2.0"), "high");
  assert.strictEqual(rated("LGPL-3.0-or-later"), "medium");
  assert.strictEqual(rated("MPL-2.0"), "medium");
  assert.strictEqual(rated("EPL-2.0"), "medium");
  assert.strictEqual(rated("(MPL-2.0 OR Apache-2.0)"), null);
  assert.strictEqual(rated("MIT"), null);
  const said = of(licences(trivy(lockfile("pnpm-lock.yaml", [pkg("a", "direct", "GPL-3.0"), pkg("b", "indirect", "AGPL-3.0")])), ["pnpm-lock.yaml"]), "licence:restricted");
  assert.strictEqual(said.severity, "critical");
  assert.match(said.body, /b 1\.0\.0 \(AGPL-3\.0\)/);
  assert.match(said.body, /a 1\.0\.0 \(GPL-3\.0\)/);
});

test("the repository's own dependency declaring no licence is medium, where the lockfile's installed dependencies were read", () => {
  const said = licences(trivy(lockfile("pnpm-lock.yaml", [pkg("fine", "direct", "MIT"), pkg("bare", "direct"), pkg("platform-only", "indirect")])), ["pnpm-lock.yaml"]);
  assert.strictEqual(of(said, "licence:unknown").severity, "medium");
  assert.match(of(said, "licence:unknown").body, /bare 1\.0\.0/);
  assert.doesNotMatch(of(said, "licence:unknown").body, /platform-only/);
  assert.deepStrictEqual(said.unread, []);
});

test("a lockfile whose dependencies carry no licence at all is unread, never counted as declaring none", () => {
  const said = licences(trivy(lockfile("pnpm-lock.yaml", [pkg("fine", "direct", "MIT")]), lockfile("services/Cargo.lock", [pkg("serde", "direct"), pkg("tokio", "direct")])),
    ["pnpm-lock.yaml", "services/Cargo.lock"]);
  assert.strictEqual(of(said, "licence:unknown"), undefined);
  assert.deepStrictEqual(said.unread, ["services/Cargo.lock"]);
});

test("a lockfile that is not one of the repository's files is left out", () => {
  const said = licences(trivy(lockfile(".claude/worktrees/x/pnpm-lock.yaml", [pkg("copy", "direct", "GPL-3.0")])), ["pnpm-lock.yaml"]);
  assert.deepStrictEqual(said.findings, []);
});

test("the phase has a name a person reads, a pack item may name it, and trivy is asked for production dependencies only", () => {
  assert.strictEqual(scans.named("licence"), "dependency licences");
  const { problems } = require("../lib/questions.js");
  const asked = { name: "Board check", pack: "custom", questions: [{ identifier: "Q1", title: "Licences", asked: "licences",
    intent: "Are the product's dependencies free of restrictive licences?", looks_for: [
      { find: "No dependency under a restrictive licence", proof: "scan", phase: "licence", rule: "licence:restricted", at_least: "medium" },
    ] }] };
  assert.deepStrictEqual(problems(asked), []);
  const shown = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-scan"), "show", "--phases", "licence"], { encoding: "utf8" });
  assert.strictEqual(shown.status, 0, shown.stderr);
  assert.strictEqual(JSON.parse(shown.stdout).phases.licence.tool, "trivy");
  const { argvOf } = require("../bin/evalation-scan");
  const argv = argvOf("licence", "/repo");
  assert.ok(argv.includes("license") && !argv.includes("--include-dev-deps"));
});

test("the bill of materials makes no licence claim, since its copy holds no installed dependency", () => {
  const { adapterFor } = require("../bin/evalation-scan");
  const syft = JSON.stringify({ artifacts: [{ name: "a", version: "1", type: "npm", licenses: [] }, { name: "b", version: "2", type: "npm", licenses: [] }] });
  const held = adapterFor("sbom", "syft").read(syft);
  assert.deepStrictEqual(held.inventory, { components: 2, ecosystems: { npm: 2 } });
  const inventory = { phase: "sbom", ran: true, tool: "syft", inventory: { components: 934, ecosystems: { npm: 600 }, declaring_no_licence: 934, some_of_them: ["a@1"] } };
  assert.doesNotMatch(scans.said({ floor: "low", phases: [inventory], findings: [] }), /licence/);
  const { scanned } = require("../bin/evalation-detail");
  assert.doesNotMatch(scanned({ scan: { phases: [inventory] } }), /licence/);
});

test("a checkout with no installed dependencies says the licences were not read", () => {
  const tree = repository();
  const phase = scan(tree, ["licence"]).document.phases.find((one) => one.phase === "licence");
  assert.strictEqual(phase.ran, false);
});

test("each licence card says what could happen if it is left and what closes it", () => {
  const { scanResults } = require("../lib/sheet.js");
  const { consequences, remedies } = require("../lib/weaknesses.js");
  const { findings } = licences(trivy(lockfile("pnpm-lock.yaml", [pkg("a", "direct", "GPL-3.0"), pkg("b", "direct")])), ["pnpm-lock.yaml"]);
  const html = scanResults({ findings: findings.map((one) => ({ ...one, phase: "licence" })), intro: "x", tagWord: "", tagOf: () => [], phaseOf: scans.named, consequences, remedies,
    upgradeTo: scans.upgradeTo, compared: scans.compared, compatible: scans.compatible, cardOf: scans.cardOf });
  const lefts = [...html.matchAll(/<b>If it is left<\/b><p>([^<]*)/g)].map((one) => one[1]);
  const todos = [...html.matchAll(/<b>What to do<\/b>([^<]*)/g)].map((one) => one[1]);
  assert.strictEqual(lefts.length, 2);
  assert.strictEqual(new Set(todos).size, 2);
  assert.ok(todos.every((one) => !/Change the code/.test(one)));
});
