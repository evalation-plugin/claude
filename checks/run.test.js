// A whole run, driven through the commands in the order a session runs them: the run file, the scan,
// the reading's parts, the merge, verifying with a correction round, the score, both deliverables,
// and a second run that reports what changed. The reading's answers and the verifier's verdicts are
// written here, so it needs no model, and every seam between the commands is crossed as it is in a
// customer's run. Faults that each command's own checks missed were found by customers in these seams.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { home, repository } = require("./fixture.js");
const { served } = require("../bin/evalation-run");

const BIN = join(__dirname, "..", "bin");
const work = mkdtempSync(join(tmpdir(), "evalation-run-"));
const env = { ...process.env, EVALATION_HOME: home, HOME: work,
  EVALATION_SCA_CMD: `${process.execPath} ${join(__dirname, "fake-scanner.js")}` };

/** One command as a session runs it, refused loudly with what it printed. */
function sh(command, args, input) {
  const ran = spawnSync(join(BIN, command), args, { env, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (ran.status !== 0) throw new Error(`${command} ${args[0] ?? ""} refused:\n${ran.stderr}${ran.stdout}`);
  return ran.stdout;
}

const RUNS = { find: "A shared check every protected route passes through", proof: "runs" };
const DEPENDENCIES = { find: "No known critical or high advisories in the pinned dependencies", proof: "scan", phase: "sca", at_least: "high" };
const packs = [
  { pack: "soc2", kind: "standard", body: { pack: "soc2", kind: "standard", title: "SOC 2 Trust Services Criteria", entries: [
    { identifier: "CC6.1", title: "Logical access", intent: "How does this repository restrict access?", bears_on: "repository", looks_for: [RUNS, DEPENDENCIES] },
    { identifier: "CC1.1", title: "Integrity and ethical values", intent: "Where is conduct written down?", bears_on: "organisation", justification: "Conduct is set by people." },
  ] } },
  { pack: "hardening", kind: "concern-set", body: { pack: "hardening", kind: "concern-set", title: "Evalation Hardening Review", entries: [
    { identifier: "SEC01", title: "Untrusted input", intent: "Where can input reach an interpreter?", looks_for: [{ ...RUNS, severity: "critical" }, { find: "A test that sends hostile input", proof: "runs", severity: "medium" }] },
    { identifier: "SEC02", title: "Secrets", intent: "Where are secrets kept?", looks_for: [{ find: "Secrets read from the environment", proof: "runs", severity: "high" }, { find: "A written rule on secrets", proof: "written", severity: "low" }] },
  ] } },
];
const questions = { name: "Board check", pack: "custom", questions: [{ identifier: "Q1", title: "Sign in", intent: "Where does this repository check who is signed in?",
  looks_for: [{ find: "A check of the signed-in session", proof: "runs" }, { find: "A test of signing out", proof: "runs" }] }] };
const rubric = { id: "evalation.rubric.v1", pack: "hardening", defect_load: { critical: 25, high: 10, medium: 4, low: 1.5, info: 0 },
  base: { decay: 95 }, credit: { alpha: 0.25, softener: 8 }, weights: { SEC: 1 }, grades: { A: 90, B: 75, C: 60, D: 40, F: 0 } };

const cite = { path: "src/auth.js", from: 1, to: 2, quote: "if (!req.session)", grade: "executable" };
const found = () => ({ result: "found", evidence: [cite] });
const missing = () => ({ result: "missing", searched: "Looked in src and the tests and found none." });

/** What the reading writes for each group, as a reader would after reading the tree. */
function partFor(group, second) {
  if (group.pack === "soc2") {
    return { answers: [{ pack: "soc2", entry: "CC6.1", status: "partial-gap", because: "A shared guard exists, and the scan holds a high advisory.",
      remedy: "Upgrade the flagged dependency.", looked_for: [found(), { result: "missing" }] }] };
  }
  if (group.pack === "custom") {
    return { answers: [{ pack: "custom", entry: "Q1", status: second ? "covered" : "partial-gap", because: "The guard checks the session.",
      ...(second ? {} : { remedy: "Add a test of signing out." }), looked_for: [found(), second ? found() : missing()] }] };
  }
  return {
    accounted: [
      { pack: "hardening", concern: "SEC01", because: "Read the guard and the tests.", looked_for: [found(), missing()] },
      { pack: "hardening", concern: "SEC02", because: "Read the settings.", looked_for: [found(), missing()] },
    ],
    findings: [{ pack: "hardening", concern: "SEC02", severity: "low", title: "No written rule on secrets",
      observed: "Secrets are read from the environment, and no document says so.", required: "Write down where secrets are kept.", at: cite }],
  };
}

/** A run from the run file to a findings file, as steps 2 to 7 of ev-run take it. */
function read(tree, second) {
  const runFile = join(work, second ? "run-2.json" : "run-1.json");
  const setFile = join(work, "questions.json");
  writeFileSync(setFile, JSON.stringify(questions));
  sh("evalation-questions", ["check", setFile]);
  const run = served({ run: second ? "run-second" : "run-first", packs, revision: "1.82", skill: "Read the repository.", remaining: 9, rubrics: [rubric] }, [questions]);
  writeFileSync(runFile, JSON.stringify({ ...run, target: { repository: "acme/app", path: tree } }));
  sh("evalation-scan", ["run", tree, "--phases", run.scan.phases.join(",")]);
  assert.match(sh("evalation-findings", ["methodology", runFile]), /Read the repository\./);
  const groups = JSON.parse(sh("evalation-findings", ["groups", runFile]));
  const parts = groups.map((one) => {
    const group = JSON.parse(sh("evalation-findings", ["group", runFile, String(one.group)]));
    if (group.pack === "custom") assert.match(group.customer, /<<<CUSTOMER-QUESTIONS [0-9a-f]+/);
    const file = join(work, `part-${second ? 2 : 1}-${one.group}.json`);
    writeFileSync(file, JSON.stringify(partFor(group, second)));
    sh("evalation-findings", ["part", runFile, String(one.group), file, tree]);
    return file;
  });
  const merged = sh("evalation-findings", ["merge", runFile, "--read-by", "Opus 5.5", ...parts]);
  return JSON.parse(sh("evalation-findings", ["-", tree], merged)).written;
}

/** Verifying and one correction round, as step 8 takes it, doubting a concern row and another concern's finding. */
function verify(written, tree) {
  sh("evalation-verify", ["plan", written, tree]);
  const plan = JSON.parse(readFileSync(`${written}.verify/plan.json`, "utf8"));
  // SEC01's row and SEC02's finding, so a correction group holds a finding whose concern's row it
  // does not hold, which is the group a customer's run met.
  const doubted = new Set([
    JSON.parse(readFileSync(written, "utf8")).accounted.find((one) => one.concern === "SEC01").id,
    ...JSON.parse(readFileSync(written, "utf8")).findings.map((one) => one.id),
  ]);
  plan.batches.forEach((ids, at) => {
    sh("evalation-verify", ["grid", written, String(at + 1)]);
    const lines = ids.map((id, row) => (doubted.has(id)
      ? `ROW ${row + 1}: NOT-CONFIRMED | Eight modules carry it, not nine.`
      : `ROW ${row + 1}: CONFIRMED | The cited lines hold it.`));
    sh("evalation-verify", ["record", written, String(at + 1)], lines.join("\n"));
  });
  sh("evalation-verify", ["apply", written, "Opus 5.5"]);
  sh("evalation-verify", ["corrections", written, tree]);
  const groups = JSON.parse(readFileSync(`${written}.correct/plan.json`, "utf8")).groups;
  assert.ok(groups.some((ids) => ids.some((id) => id.startsWith("c-")) && ids.some((id) => id.startsWith("f-"))),
    "a correction group holds a concern row and a finding of another concern");
  groups.forEach((ids, at) => {
    sh("evalation-verify", ["correction", written, String(at + 1)]);
    const answer = { answers: [], findings: [], accounted: [] };
    for (const id of ids) {
      const list = id.startsWith("f-") ? "findings" : id.startsWith("c-") ? "accounted" : "answers";
      answer[list].push({ id, stands: "Read again against the lines cited, and it holds." });
    }
    const file = join(work, `correction-${at + 1}.json`);
    writeFileSync(file, JSON.stringify(answer));
    sh("evalation-verify", ["correct", written, String(at + 1), file]);
  });
  sh("evalation-verify", ["corrected", written]);
}

test("a whole run goes from the run file to both deliverables, and a second run says what changed", () => {
  const tree = repository();
  execFileSync("git", ["-C", tree, "tag", "v1"]);

  const first = read(tree, false);
  verify(first, tree);
  const rubricFile = join(work, "rubric.json");
  writeFileSync(rubricFile, JSON.stringify(rubric));
  const scored = JSON.parse(sh("evalation-score", [first, rubricFile]));
  assert.ok(Number.isInteger(scored.score));
  sh("evalation-deliver", [first, join(work, "out-1"), tree]);
  sh("evalation-report", [first, join(work, "out-1")]);

  const second = read(tree, true);
  const now = JSON.parse(readFileSync(second, "utf8"));
  const asked = new Map(now.packs.flatMap((pack) => pack.entries_asked.map((one) => [`${pack.pack}/${one.identifier}`, one])));
  const { page } = require("../bin/evalation-report");
  const custom = now.answers.filter((one) => one.pack === "custom");
  assert.match(page({ ...now, packs: now.packs.filter((one) => one.pack === "custom") }, custom, asked),
    /What changed since[\s\S]*Q1 Sign in: partial to covered/);
  sh("evalation-score", [second, rubricFile]);
  sh("evalation-deliver", [second, join(work, "out-2"), tree]);
  sh("evalation-report", [second, join(work, "out-2")]);
});
