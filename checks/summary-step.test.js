"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");
const { page } = require("../bin/evalation-report");
const { reviewFindings } = require("../bin/evalation-deliver");
const { browser, settled } = require("../lib/print.js");

const tree = repository();
scanned(tree, []);
const GATE = join(__dirname, "..", "bin", "evalation-gate");
const summaryOf = () => require("../bin/evalation-summary");

const findingsFile = (document = run(tree)) => {
  const file = join(mkdtempSync(join(tmpdir(), "evalation-summary-step-")), "findings.json");
  writeFileSync(file, JSON.stringify({ ...document, schema: "evalation.findings.v1" }));
  return file;
};

const GOOD = {
  paragraph: [{ say: "Access is guarded, and no restore steps are written down.", rests_on: ["CC6.1"] }],
  weigh: [{ say: "Ask how the company would restore its data after a failure.", rests_on: ["CC6.1"] }],
};

const sheetsOf = (document) => {
  const asked = new Map();
  for (const pack of document.packs) for (const one of pack.entries_asked ?? []) asked.set(`${pack.pack}/${one.identifier}`, one);
  const file = join(mkdtempSync(join(tmpdir(), "evalation-summary-step-")), "page.html");
  writeFileSync(file, page(document, document.answers.filter((one) => one.pack === "soc2"), asked));
  return settled(browser(), file).split('<div class="sheet">').slice(1);
};

test("the writer's summary is refused where a sentence rests on no entry, on one the pack does not hold, or breaks the writing rules", () => {
  const { write } = summaryOf();
  const file = findingsFile();
  const bad = [
    { paragraph: [{ say: "Access is guarded.", rests_on: [] }], weigh: GOOD.weigh },
    { paragraph: [{ say: "Access is guarded.", rests_on: ["CC9.9"] }], weigh: GOOD.weigh },
    { paragraph: [{ say: "Access control is a total-gap here.", rests_on: ["CC6.1"] }], weigh: GOOD.weigh },
    { paragraph: [], weigh: GOOD.weigh },
  ];
  for (const one of bad) {
    const said = write(file, "soc2", JSON.stringify(one));
    assert.strictEqual(said.written, false, JSON.stringify(one));
    assert.ok(said.problems.length > 0);
  }
  assert.strictEqual(JSON.parse(readFileSync(file, "utf8")).summaries, undefined);
  assert.strictEqual(write(file, "soc2", JSON.stringify(GOOD)).written, true);
  assert.strictEqual(JSON.parse(readFileSync(file, "utf8")).summaries.soc2.state, "asserted");
});

test("a summary keeps each sentence its checker confirms, drops each one it does not, and is left out only where it confirms none", () => {
  const { write, grid, record } = summaryOf();
  const kept = (file) => JSON.parse(readFileSync(file, "utf8")).summaries.soc2;
  const both = findingsFile();
  write(both, "soc2", JSON.stringify(GOOD));
  assert.match(grid(both, "soc2"), /SENTENCE 2/);
  record(both, "soc2", "SENTENCE 1: CONFIRMED | the entry says so\nSENTENCE 2: CONFIRMED | it follows");
  assert.strictEqual(kept(both).state, "verified");
  assert.deepStrictEqual([kept(both).paragraph.length, kept(both).weigh.length], [1, 1]);
  const one = findingsFile();
  write(one, "soc2", JSON.stringify(GOOD));
  record(one, "soc2", "SENTENCE 1: CONFIRMED | the entry says so\nSENTENCE 2: NOT-CONFIRMED | it tells the reader what to decide");
  assert.strictEqual(kept(one).state, "verified");
  assert.deepStrictEqual(kept(one).paragraph.map((row) => row.say), [GOOD.paragraph[0].say]);
  assert.deepStrictEqual(kept(one).weigh, []);
  const unanswered = findingsFile();
  write(unanswered, "soc2", JSON.stringify(GOOD));
  record(unanswered, "soc2", "SENTENCE 2: CONFIRMED | it follows");
  assert.deepStrictEqual([kept(unanswered).state, kept(unanswered).paragraph.length, kept(unanswered).weigh.length], ["verified", 0, 1]);
  const none = findingsFile();
  write(none, "soc2", JSON.stringify(GOOD));
  record(none, "soc2", "SENTENCE 1: NOT-CONFIRMED | not shown\nSENTENCE 2: NOT-CONFIRMED | not shown");
  assert.strictEqual(kept(none).state, "left-out");
});

test("a verified summary prints its paragraph and points to weigh, and one left out says so", () => {
  const document = run(tree);
  document.summaries = { soc2: { ...GOOD, state: "verified" } };
  const verified = sheetsOf(document)[0];
  assert.ok(verified.includes(GOOD.paragraph[0].say));
  assert.match(verified, /data-part="weigh"[\s\S]*Ask how the company would restore its data after a failure\./);
  document.summaries = { soc2: { ...GOOD, state: "left-out" } };
  const left = sheetsOf(document)[0];
  assert.ok(!left.includes(GOOD.paragraph[0].say));
  assert.ok(!left.includes(GOOD.weigh[0].say));
  assert.match(left, /data-unchecked/);
});

test("a pack's points to weigh print for each section holding a gap, and not for a section without one", () => {
  const document = run(tree);
  const pack = document.packs[0];
  pack.sections = [{ identifier: "A", title: "Access", weigh: ["Ask who can reach production data."] },
    { identifier: "B", title: "Conduct", weigh: ["Ask where conduct is written down."] }];
  pack.entries_asked[0].section = "A";
  pack.entries_asked[1].section = "B";
  const sheet = sheetsOf(document)[0];
  assert.match(sheet, /data-part="weigh"[\s\S]*Ask who can reach production data\./);
  assert.ok(!sheet.includes("Ask where conduct is written down."));
});

test("the findings detail prints the reading's summary of its concern set the same way", () => {
  const { page: detailPage } = require("../bin/evalation-detail");
  const { synthesise } = require("../lib/synthesise.js");
  const document = run(tree);
  document.findings = [{ pack: "hardening", concern: "SEC01", severity: "high", title: "Input reaches a query", observed: "Unescaped.", required: "Escape it.",
    at: { path: "src/auth.js", from: 1, to: 1, quote: "if (!req.session)", grade: "executable" } }];
  const say = "One high finding lets input reach a query unescaped.";
  document.summaries = { hardening: { paragraph: [{ say, rests_on: ["SEC-01"] }], weigh: [], state: "verified" } };
  const file = join(mkdtempSync(join(tmpdir(), "evalation-summary-step-")), "detail.html");
  writeFileSync(file, detailPage(synthesise(reviewFindings(document))));
  assert.ok(settled(browser(), file).split('<div class="sheet">')[1].includes(say));
});

test("only the summary writer writes a summary and only the summary checker records its verdict", () => {
  const gate = (command, agent) => {
    const ran = spawnSync(process.execPath, [GATE], { input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_input: { command }, ...(agent ? { agent_type: agent, agent_id: "a-1" } : {}), cwd: "/repo" }), encoding: "utf8" });
    return ran.status === 0;
  };
  const written = "/x/bin/evalation-summary write /f.json soc2 - <<'EOF'\n{}\nEOF";
  const recorded = "/x/bin/evalation-summary record /f.json soc2 <<'EOF'\nSENTENCE 1: CONFIRMED | holds\nEOF";
  assert.ok(gate(written, "evalation-plugin:summary-writer"));
  assert.ok(gate(recorded, "evalation-plugin:summary-checker"));
  assert.ok(gate("/x/bin/evalation-summary brief /f.json soc2", "evalation-plugin:summary-writer"));
  assert.ok(gate("/x/bin/evalation-summary grid /f.json soc2", "evalation-plugin:summary-checker"));
  for (const agent of [undefined, "general-purpose", "evalation-plugin:reader", "evalation-plugin:summary-writer"]) assert.strictEqual(gate(recorded, agent), false);
  for (const agent of [undefined, "general-purpose", "evalation-plugin:summary-checker"]) assert.strictEqual(gate(written, agent), false);
});
