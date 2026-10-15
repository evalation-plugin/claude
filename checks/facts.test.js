"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { existsSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { home, repository } = require("./fixture.js");
const { served } = require("../bin/evalation-run");

const BIN = join(__dirname, "..", "bin");
const env = { ...process.env, EVALATION_PLUGIN_HOME: home, HOME: tmpdir() };

function sh(command, args, input) {
  return spawnSync(process.execPath, [join(BIN, command), ...args], { env, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

function ok(command, args, input) {
  const ran = sh(command, args, input);
  assert.strictEqual(ran.status, 0, `${command} ${args[0] ?? ""} refused:\n${ran.stderr}${ran.stdout}`);
  return ran.stdout;
}

const AD = "Does the system use Microsoft Active Directory, such as AD DS domain controllers?";
const CLASSIFIED = "Does the system hold SECRET or TOP SECRET information?";
const WIRELESS = "Does the system include wireless networks the organisation runs?";
const SSH = "Does the system run or configure Secure Shell (SSH) access?";

const entry = (identifier, facts) => ({ identifier, title: `Entry ${identifier}`, intent: `Does the repository meet ${identifier}?`, bears_on: "repository", ...(facts ? { facts } : {}) });
const packs = () => [
  { pack: "ism", kind: "standard", body: { pack: "ism", kind: "standard", title: "Information Security Manual", entries: [
    entry("A1", [AD]), entry("A2", [AD, CLASSIFIED]), entry("A3", [CLASSIFIED]), entry("A4"), entry("A5", [WIRELESS]), entry("A6", [SSH]),
  ] } },
  { pack: "other", kind: "standard", body: { pack: "other", kind: "standard", title: "Another Standard", entries: [entry("B1", [AD]), entry("B2")] } },
];

const cite = { path: "src/auth.js", from: 1, to: 2, quote: "if (!req.session)", grade: "executable" };
const denied = (fact) => ({ fact, result: "does-not-hold", searched: "Looked in the code and the settings for it and found none." });
const held = (fact) => ({ fact, result: "holds", evidence: [cite] });
const unknown = (fact) => ({ fact, result: "cannot-tell", searched: "Looked in the repository and its settings, and the code does not show it either way." });

function started(list = packs()) {
  const tree = repository();
  const folder = mkdtempSync(join(tmpdir(), "evalation-facts-"));
  const run = join(folder, "run.json");
  writeFileSync(run, JSON.stringify({ ...served({ run: "run-facts", packs: list, revision: "1.99", skill: "Read the repository.", remaining: 9, rubrics: [] }, [], tree),
    target: { repository: "acme/app", path: tree } }));
  return { tree, folder, run };
}

const left = (run) => JSON.parse(ok("evalation-findings", ["groups", run])).reduce((sum, one) => sum + one.entries, 0);

function settledWith(made, rows) {
  const group = JSON.parse(ok("evalation-findings", ["fact-group", made.run, "1"]));
  const answer = JSON.stringify({ facts: group.facts.map((one) => rows.find((row) => row.fact === one)) });
  if (rows.some((row) => row.result === "does-not-hold")) {
    const again = sh("evalation-findings", ["fact-part", made.run, "1", "-", made.tree], answer);
    assert.notStrictEqual(again.status, 0, "a fact said not to hold is searched for again before it is kept");
    assert.match(again.stderr, /Search again before saying the system lacks it/);
  }
  ok("evalation-findings", ["fact-part", made.run, "1", "-", made.tree], answer);
  return JSON.parse(ok("evalation-findings", ["settle", made.run]));
}

test("a malformed facts field is refused where it is read, with its cause and its remedy", () => {
  for (const [facts, cause] of [["Does it?", /names its facts as something other than a list of questions/], [[], /names its facts as something other than a list of questions/],
    [["It holds secrets"], /not a question ending in a question mark: It holds secrets/], [[AD, AD], /names one fact twice/], [[` ${AD}`], /not a question/], [[7], /not a question/]]) {
    const list = packs();
    list[0].body.entries[0].facts = facts;
    assert.throws(() => served({ run: "r", packs: list, revision: "1.99" }, [], null), (thrown) => {
      assert.match(thrown.message, cause);
      assert.match(thrown.message, /Entry A1 of the ism pack/);
      assert.match(thrown.remedyForReport, /facts field is a list of questions, each ending in a question mark and named once/);
      return true;
    });
  }
  const made = started();
  const document = JSON.parse(readFileSync(made.run, "utf8"));
  document.to_read[0].entries[0].facts = "Does it?";
  writeFileSync(made.run, JSON.stringify(document));
  const refused = sh("evalation-findings", ["facts", made.run]);
  assert.notStrictEqual(refused.status, 0);
  assert.match(refused.stderr, /Entry A1 of the ism pack names its facts as something other than a list of questions/);
  assert.match(refused.stderr, /release a new revision of the pack/);
});

test("a fact settled as not holding takes its entries out of the reading, and the rest are read as before", () => {
  const made = started();
  assert.strictEqual(left(made.run), 8);
  const groups = JSON.parse(ok("evalation-findings", ["facts", made.run]));
  assert.deepStrictEqual(groups, [{ group: 1, of: 1, facts: 4 }], "a fact named by entries of two packs is one fact");
  const summary = settledWith(made, [denied(AD), held(SSH), unknown(WIRELESS), unknown(CLASSIFIED)]);
  assert.deepStrictEqual(summary.does_not_hold, [AD]);
  assert.strictEqual(summary.holds, 1);
  assert.strictEqual(summary.cannot_tell, 2);
  assert.strictEqual(summary.answered_from_a_fact, 3, "A1, A2 and B1 name the Active Directory fact");
  assert.strictEqual(summary.to_read, 5);
  assert.strictEqual(left(made.run), 5);
  const run = JSON.parse(readFileSync(made.run, "utf8"));
  const fact = run.answered.filter((one) => one.from === "fact");
  assert.deepStrictEqual(fact.map((one) => `${one.pack}/${one.entry}`).sort(), ["ism/A1", "ism/A2", "other/B1"]);
  assert.ok(fact.every((one) => one.status === "not-applicable" && one.fact === AD && one.because.includes(AD) && one.justification));
  assert.strictEqual(ok("evalation-run", ["--say", "settled", made.run]).trim(), "3 questions don't apply to this system, so they aren't read. The report says why.");
  assert.strictEqual(JSON.parse(ok("evalation-findings", ["facts", made.run])).length, 0, "a settled run has nothing left to settle");
  const bytes = readFileSync(made.run, "utf8");
  assert.deepStrictEqual(JSON.parse(ok("evalation-findings", ["settle", made.run])), summary, "settling again changes nothing");
  assert.strictEqual(readFileSync(made.run, "utf8"), bytes, "and leaves the run file as it was");
  assert.strictEqual(left(made.run), 5);
});

test("a fact that holds, and a fact the code cannot tell, drop no entry", () => {
  const made = started();
  const summary = settledWith(made, [held(AD), unknown(CLASSIFIED), held(SSH), unknown(WIRELESS)]);
  assert.strictEqual(summary.answered_from_a_fact, 0);
  assert.strictEqual(summary.to_read, 8);
  assert.strictEqual(left(made.run), 8);
  const run = JSON.parse(readFileSync(made.run, "utf8"));
  assert.deepStrictEqual(run.answered.filter((one) => one.from === "fact"), []);
  assert.deepStrictEqual(run.facts.map((one) => one.result), ["holds", "cannot-tell", "cannot-tell", "holds"]);
  assert.strictEqual(ok("evalation-run", ["--say", "settled", made.run]).trim(), "");
});

test("an entry naming several facts is not applicable when any one does not hold", () => {
  const made = started();
  const summary = settledWith(made, [held(AD), denied(CLASSIFIED), held(SSH), unknown(WIRELESS)]);
  const run = JSON.parse(readFileSync(made.run, "utf8"));
  assert.deepStrictEqual(run.answered.filter((one) => one.from === "fact").map((one) => one.entry), ["A2", "A3"]);
  assert.strictEqual(summary.to_read, 6);
});

test("a part that leaves a fact out, adds one, or gives no account is refused, and settling waits for every part", () => {
  const made = started();
  const group = JSON.parse(ok("evalation-findings", ["fact-group", made.run, "1"]));
  const send = (rows) => sh("evalation-findings", ["fact-part", made.run, "1", "-", made.tree], JSON.stringify({ facts: rows }));
  const full = group.facts.map(unknown);
  assert.match(send(full.slice(1)).stderr, /holds a fact with no row/);
  assert.match(send([...full, unknown("Does the system fly?")]).stderr, /answers a fact this group does not hold/);
  assert.match(send([...full, full[0]]).stderr, /Two rows answer the same fact/);
  assert.match(send([{ fact: group.facts[0], result: "holds" }, ...full.slice(1)]).stderr, /says the fact holds and cites nothing/);
  assert.match(send([{ fact: group.facts[0], result: "does-not-hold" }, ...full.slice(1)]).stderr, /with no account of the search/);
  assert.match(send([{ fact: group.facts[0], result: "cannot-tell" }, ...full.slice(1)]).stderr, /with no account of the search/);
  assert.match(send([{ fact: group.facts[0], result: "maybe" }, ...full.slice(1)]).stderr, /A result is holds, does-not-hold or cannot-tell/);
  assert.match(send([{ ...held(group.facts[0]), evidence: [{ ...cite, quote: "not in the file" }] }, ...full.slice(1)]).stderr, /the quote is not there/);
  assert.match(send([{ ...unknown(group.facts[0]), searched: "It isn't there; it is elsewhere." }, ...full.slice(1)]).stderr, /a semicolon/);
  const several = send([{ fact: group.facts[0], result: "holds" }, { fact: group.facts[1], result: "maybe" }, ...full.slice(2, -1)]).stderr;
  assert.match(several, /observed: 3 things in part 1 of the facts to fix/, "every fault is reported in one result");
  assert.match(several, /says the fact holds and cites nothing/);
  assert.match(several, /A result is holds, does-not-hold or cannot-tell/);
  assert.match(several, /holds a fact with no row/);
  assert.ok(!existsSync(join(made.folder, "facts-1.json")), "nothing is kept from a refused part");
  const early = sh("evalation-findings", ["settle", made.run]);
  assert.notStrictEqual(early.status, 0);
  assert.match(early.stderr, /Group 1 of the facts has no part handed in/);
  assert.strictEqual(left(made.run), 8);
});

test("the reader agent prints a group of facts and hands in its rows, and settling stays the session's", () => {
  const gate = (command) => spawnSync(process.execPath, [join(BIN, "evalation-gate")], { encoding: "utf8", input: JSON.stringify({
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, agent_type: "evalation-plugin:reader", agent_id: "a-1", cwd: "/repo" }) }).status === 0;
  assert.ok(gate("${CLAUDE_PLUGIN_ROOT}/bin/evalation-findings fact-group /s/run.json 1"));
  assert.ok(gate("/x/bin/evalation-findings fact-part /s/run.json 1 - /repo <<'EOF'\n{\"facts\":[]}\nEOF"));
  assert.ok(!gate("/x/bin/evalation-findings settle /s/run.json"));
  assert.ok(!gate("/x/bin/evalation-findings facts /s/run.json"));
});

test("the findings check accepts an answer from a fact settled as not holding, and refuses one whose fact was not", () => {
  const made = started();
  settledWith(made, [denied(AD), held(CLASSIFIED), held(SSH), unknown(WIRELESS)]);
  const parts = JSON.parse(ok("evalation-findings", ["groups", made.run])).map((one) => {
    const group = JSON.parse(ok("evalation-findings", ["group", made.run, String(one.group)]));
    const file = join(made.folder, `part-${one.group}.json`);
    writeFileSync(file, JSON.stringify({ answers: group.entries.map((each) => ({ pack: group.pack, entry: each.identifier, status: "covered", because: "A shared guard checks the session.", evidence: [cite] })) }));
    return file;
  });
  const merged = ok("evalation-findings", ["merge", made.run, "--read-by", "Opus 5.5", ...parts]).trim();
  const written = JSON.parse(ok("evalation-findings", [merged, made.tree]));
  assert.strictEqual(written.answered_from_a_fact, 3);
  assert.strictEqual(written.read, 5);
  const document = JSON.parse(readFileSync(merged, "utf8"));
  assert.ok(document.packs.every((pack) => pack.selected.length === pack.entries_asked.length));
  assert.deepStrictEqual(document.facts.map((one) => one.fact), [AD, CLASSIFIED, WIRELESS, SSH]);

  const wrong = (change) => {
    const copy = JSON.parse(JSON.stringify(document));
    change(copy);
    const at = join(made.folder, "wrong.json");
    writeFileSync(at, JSON.stringify(copy));
    return sh("evalation-findings", [at, made.tree]);
  };
  const answerOf = (copy, name) => copy.answers.find((one) => one.entry === name);
  const heldFact = wrong((copy) => Object.assign(answerOf(copy, "A3"), { from: "fact", fact: CLASSIFIED, status: "not-applicable", justification: "Not read.", evidence: [] }));
  assert.notStrictEqual(heldFact.status, 0);
  assert.match(heldFact.stderr, /ism\/A3 is answered from a fact that was not settled as not holding: Does the system hold SECRET/);
  const tampered = wrong((copy) => Object.assign(copy.facts.find((one) => one.fact === AD), { result: "holds", evidence: [cite] }));
  assert.match(tampered.stderr, /ism\/A1 is answered from a fact that was not settled as not holding/);
  const foreign = wrong((copy) => Object.assign(answerOf(copy, "A1"), { fact: SSH }));
  assert.match(foreign.stderr, /ism\/A1 is answered from a fact its entry does not name/);
  const unsettled = wrong((copy) => Object.assign(answerOf(copy, "A1"), { fact: "Does the system fly?" }));
  assert.match(unsettled.stderr, /ism\/A1 is answered from a fact that was not settled as not holding: Does the system fly/);
  const covered = wrong((copy) => Object.assign(answerOf(copy, "A1"), { status: "covered" }));
  assert.match(covered.stderr, /a fact settles an entry as not applicable only/);
  const other = wrong((copy) => Object.assign(answerOf(copy, "A1"), { evidence: [cite] }));
  assert.match(other.stderr, /cites other evidence than the fact it rests on/);
});
