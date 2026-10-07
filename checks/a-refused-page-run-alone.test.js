"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { reviewFindings } = require("../bin/evalation-deliver");
const { synthesise } = require("../lib/synthesise.js");

const ROOT = join(__dirname, "..");
const PRINT = join(ROOT, "lib", "print.js");

const run = {
  run: "run-1", at: "2026-10-06T00:00:00.000Z", revision: "1.82", read_by: "Opus 5.5", target: { repository: "acme/page" },
  packs: [{ pack: "hardening", kind: "concern-set", title: "Evalation Hardening Review",
    entries_asked: [{ identifier: "SEC01", title: "Untrusted input", looks_for: [{ find: "Parameterised queries" }] }] }],
  answers: [],
  findings: [{ id: "f-1", pack: "hardening", concern: "SEC01", severity: "high", title: "Queries built from input",
    observed: "Queries are built from input.", required: "Use parameters.", at: { path: "src/a.js", from: 1, to: 1 } }],
  accounted: [{ pack: "hardening", concern: "SEC01", because: "Read the queries.", looked_for: [{ result: "found" }] }],
  hardness: { score: 70, grade: "C", bars: [{ category: "SEC", score: 70 }] },
};

function refusing(folder) {
  const stub = join(folder, "refusing.js");
  writeFileSync(stub, [
    "const Module = require('node:module');",
    "const load = Module._load;",
    `const target = ${JSON.stringify(PRINT)};`,
    "Module._load = function (request, parent, main) {",
    "  const loaded = load.apply(this, arguments);",
    "  if (Module._resolveFilename(request, parent, main) !== target) return loaded;",
    "  return { ...loaded, print: (html, page, into) => { throw Object.assign(new Error('the page is not fit to send:\\n  a value reached the page as a programming artefact'), { unfit: true, faults: ['a value reached the page as a programming artefact'], file: into }); } };",
    "};",
  ].join("\n"));
  return stub;
}

function heldIn(home) {
  const file = join(home, "errors.jsonl");
  return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((one) => JSON.parse(one)) : [];
}

for (const [command, document] of [["evalation-deck", () => synthesise(reviewFindings(run))], ["evalation-detail", () => reviewFindings(run)]]) {
  test(`${command} run on its own says a refused page was not written, and reports no crash`, () => {
    const folder = mkdtempSync(join(tmpdir(), "evalation-refused-"));
    const home = mkdtempSync(join(tmpdir(), "evalation-refused-home-"));
    const source = join(folder, "findings.json");
    writeFileSync(source, JSON.stringify(document()));
    const ran = spawnSync(process.execPath, ["-r", refusing(folder), join(ROOT, "bin", command), source, join(folder, "Out.pdf")], {
      encoding: "utf8",
      env: { ...process.env, EVALATION_PLUGIN_HOME: home, NODE_TEST_CONTEXT: "" },
    });
    assert.strictEqual(ran.status, 1, `exit ${ran.status}: ${ran.stderr}`);
    assert.match(ran.stderr, /wasn't written, because its pages failed the check before printing/);
    assert.doesNotMatch(ran.stderr, /\n\s+at /, "a stack trace reached the person");
    assert.deepStrictEqual(heldIn(home).map((one) => one.failure), ["run-stopped"], "a refused page was reported as a crash, or not at all");
  });
}
