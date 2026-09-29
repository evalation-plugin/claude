"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");
const { repository } = require("./fixture.js");

const tree = repository();

const catalogued = (text) => Object.values(require("../lib/say.js").entries()).filter((one) => one.say).some((one) =>
  new RegExp(`^${one.say.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/<[a-z][a-z0-9 -]*>/g, ".+")}$`).test(text));

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-start-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), randomBytes(32).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "keys", "evalation-plugin.box.receiving-key"), randomBytes(32).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ schema: "evalation.local.v1", installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

const SOC2 = { pack: "soc2", kind: "standard", title: "SOC 2 Trust Services Criteria", entries: [
  { identifier: "CC6.1", title: "Logical access", intent: "How does this repository restrict access?", bears_on: "repository",
    looks_for: [{ find: "No known high advisories in the pinned dependencies", proof: "scan", phase: "sca", at_least: "high" }] },
] };
const ISO = { pack: "iso27001", kind: "standard", title: "ISO/IEC 27001", entries: [
  { identifier: "A.5.1", title: "Policies", intent: "Where are the policies kept?", bears_on: "repository", looks_for: [{ find: "A written policy", proof: "written" }] },
] };
const RUBRIC = { id: "evalation.rubric.v1", pack: "soc2", defect_load: { critical: 25, high: 10, medium: 4, low: 1.5, info: 0 },
  base: { decay: 95 }, credit: { alpha: 0.25, softener: 8 }, weights: { SEC: 1 }, grades: { A: 90, B: 75, C: 60, D: 40, F: 0 } };

const served = { revision: "1.86", remaining: 83, already: false, skill: "Read the repository.",
  packs: [{ pack: "soc2", kind: "standard", entries: 1, body: SOC2 }], rubrics: [{ rubric: "soc2", body: RUBRIC }] };

function server(answers) {
  const asked = [];
  let at = 0;
  const held = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.url === "/run") asked.push(JSON.parse(body).run);
      const answer = answers[Math.min(at, answers.length - 1)];
      at += 1;
      if (answer === "drop") return req.socket.destroy();
      res.writeHead(answer.code === undefined ? 200 : answer.code, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify(answer.body));
    });
  });
  held.unref();
  return new Promise((resolve) => held.listen(0, "127.0.0.1", () => resolve({ held, asked })));
}

function started(home, port, ...args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-run"), ...args], { env: { ...process.env,
      EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
      EVALATION_SERVER: `http://127.0.0.1:${port}` } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

test("a run refused for want of credit says both numbers in one plain line, and that nothing was used", async () => {
  const { held } = await server([{ code: 402, body: { refusals: [{ at: "runs", failure: "entitlement-ended",
    observed: "this run asks for 2 packs and 1 pack credit is left",
    required: "top up, or run fewer packs, since a run spends one credit for each pack it reads" }] } }]);
  const ran = await started(machine(), held.address().port, tree, "soc2", "iso27001");
  held.close();
  assert.strictEqual(ran.code, 1);
  assert.strictEqual(ran.stderr, "This run reads 2 packs, which needs 2 pack credits, and you have 1. It did not start, and no pack credits were used. " +
    "To buy more pack credits, email support@evalation.ai, then run /ev-run again, or choose fewer packs.\n");
  assert.ok(catalogued(ran.stderr.trim()), `not a catalogue line: ${ran.stderr}`);
});

function routed(answers) {
  const held = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify(answers[req.url] ?? {}));
    });
  });
  held.unref();
  return new Promise((resolve) => held.listen(0, "127.0.0.1", () => resolve(held)));
}

const HARDENING = { pack: "hardening", kind: "concern-set", title: "Evalation Hardening Review", entries: [] };
const CYBER = { pack: "cyber-insurance", kind: "standard", title: "Evalation Cyber Insurance Risk", licence: { attribution: "Evalation" }, entries: [] };

test("the pack questions come from the run command ready to ask, with the balance, the usual packs and the sets in the catalogue's words", async () => {
  const home = machine();
  const held = await routed({ "/pin": {}, "/runs": { remaining: 3 }, "/sets": { sets: [] },
    "/packs": { revision: "1.86", packs: [{ pack: "soc2", body: SOC2 }, { pack: "iso27001", body: ISO }, { pack: "hardening", body: HARDENING },
      { pack: "cyber-insurance", body: CYBER }] } });
  const port = held.address().port;
  const asked = async (...args) => {
    const ran = await started(home, port, "--say", ...args);
    assert.strictEqual(ran.code, 0, ran.stderr);
    return ran.stdout.startsWith("{") ? JSON.parse(ran.stdout).questions : ran.stdout;
  };
  const [full] = await asked("packs", tree);
  assert.strictEqual(full.question, "Which packs should this run read? Tick each pack to read. Each one uses a pack credit, and you have 3. " +
    "Reading takes a while and uses a good part of your Claude usage.");
  assert.deepStrictEqual(full.options.map((one) => one.label), ["Evalation Cyber Insurance Risk", "Evalation Hardening Review", "ISO/IEC 27001",
    "SOC 2 Trust Services Criteria"]);
  writeFileSync(join(home, "packs.json"), JSON.stringify({ packs: ["soc2", "hardening"] }));
  mkdirSync(join(home, "questions"), { recursive: true });
  const question = { identifier: "Q1", title: "Sign in", asked: "do we check who is signed in", intent: "Where does this repository check who is signed in?",
    looks_for: [{ find: "A check of the signed-in session", proof: "runs" }] };
  writeFileSync(join(home, "questions", "Board.json"), JSON.stringify({ name: "Board", pack: "custom", questions: [question] }));
  writeFileSync(join(home, "questions", "Board two.json"), JSON.stringify({ name: "Board two", pack: "custom", questions: [question, question] }));
  const { target } = require("../bin/evalation-run");
  const [first] = await asked("packs", tree);
  assert.strictEqual(first.question, `Which packs should this run read for ${target(tree).repository}? Each pack uses one pack credit, and you have 3. ` +
    "Reading takes a while and uses a good part of your Claude usage.");
  assert.strictEqual(first.header, "Packs");
  assert.strictEqual(first.multiSelect, false);
  assert.deepStrictEqual(first.options, [
    { label: "Run my usual packs", description: "SOC 2 Trust Services Criteria and Evalation Hardening Review. Uses 2 pack credits." },
    { label: "Choose which packs to run", description: "Tick any packs from the full list." },
    { label: "Only my questions", description: "No Evalation pack is read and no pack credits are used, so the run answers your own questions and nothing else." },
  ]);
  const [usual] = await asked("usual");
  assert.strictEqual(usual.header, "Usual");
  assert.ok(usual.multiSelect);
  assert.deepStrictEqual(usual.options.map((one) => one.label), ["SOC 2 Trust Services Criteria", "Evalation Hardening Review"]);
  const [all] = await asked("all");
  assert.strictEqual(all.question, "Which packs should this run read? Tick each pack to read. Each one uses a pack credit, and you have 3.");
  const [only] = await asked("only");
  assert.deepStrictEqual(only.options, [{ label: "Board", description: "One question." }, { label: "Board two", description: "2 questions." }]);
  const closed = await started(home, port, "--say", "sets", "soc2");
  assert.strictEqual(closed.code, 1);
  assert.match(closed.stderr, /^The run stopped on a fault in Evalation\. No pack credits were used\. Please send this message to support@evalation\.ai:\n/);
  assert.doesNotMatch(closed.stderr, /can also take your own questions/);
  assert.strictEqual(await asked("sets", "cyber-insurance"), "Evalation Cyber Insurance Risk can also take your own questions, written with /ev-questions before a run.\n");
  writeFileSync(join(home, "questions", "Broker.json"), JSON.stringify({ name: "Broker", pack: "cyber-insurance", questions: [question, question] }));
  const [one] = await asked("sets", "cyber-insurance");
  assert.strictEqual(one.question, "Use your question set \"Broker\" with Evalation Cyber Insurance Risk? No extra pack credits.");
  assert.deepStrictEqual(one.options, [{ label: "Use Broker", description: "2 questions." },
    { label: "Read the pack alone", description: "Only the pack's own questions are read." }]);
  writeFileSync(join(home, "questions", "Insurer.json"), JSON.stringify({ name: "Insurer", pack: "cyber-insurance", questions: [question] }));
  const [many] = await asked("sets", "cyber-insurance");
  assert.ok(many.multiSelect);
  assert.deepStrictEqual(many.options, [{ label: "Broker", description: "2 questions." }, { label: "Insurer", description: "One question." },
    { label: "Read the pack alone", description: "Only the pack's own questions are read." }]);
  assert.strictEqual(await asked("short", "4"), "You have 3 pack credits and chose 4 packs. To buy more pack credits, email support@evalation.ai, " +
    "then run /ev-run again, or choose fewer packs.\n");
  held.close();
});

test("a run the server counts writes its own run file and rubric, and prints where they are", async () => {
  const home = machine();
  mkdirSync(join(home, "scans"), { recursive: true });
  writeFileSync(join(home, "scans", "2026-09-29T10-56-21-345Z-app.json"), JSON.stringify({ target: { path: tree }, at: "2026-09-29T10:56:21.345Z", phases: [], findings: [] }));
  const { held } = await server([{ body: served }]);
  const ran = await started(home, held.address().port, tree, "soc2");
  held.close();
  assert.strictEqual(ran.code, 0, ran.stderr);
  const said = JSON.parse(ran.stdout);
  assert.ok(said.written.startsWith(home));
  assert.strictEqual(JSON.parse(readFileSync(said.written, "utf8")).skill, "Read the repository.");
  assert.strictEqual(JSON.parse(readFileSync(said.written, "utf8")).scan.follows, "2026-09-29T10:56:21.345Z");
  assert.deepStrictEqual(said.rubrics.map((one) => one.pack), ["soc2"]);
  assert.deepStrictEqual(JSON.parse(readFileSync(said.rubrics[0].written, "utf8")), RUBRIC);
});

test("a reply lost on the way is asked again as the same run, so it is never counted twice", async () => {
  const { held, asked } = await server(["drop", { body: served }]);
  const ran = await started(machine(), held.address().port, tree, "soc2");
  held.close();
  assert.strictEqual(ran.code, 0, ran.stderr);
  assert.strictEqual(asked.length, 2);
  assert.strictEqual(asked[0], asked[1]);
});

test("a start that never got an answer says credits may have been used and how to see, and the next start is the same run", async () => {
  const home = machine();
  const lost = await server(["drop"]);
  const first = await started(home, lost.held.address().port, tree, "soc2", "iso27001");
  lost.held.close();
  assert.strictEqual(first.code, 1);
  assert.match(first.stderr, /not clear whether/);
  assert.match(first.stderr, /\/ev-account/);
  assert.match(first.stderr, /never charged twice/);
  assert.match(first.stderr, /with the same packs and question sets/);
  assert.doesNotMatch(first.stderr, /unreachable|fetch|http/);
  assert.ok(catalogued(first.stderr.trim()), `not a catalogue line: ${first.stderr}`);

  const back = await server([{ body: served }]);
  const second = await started(home, back.held.address().port, tree, "iso27001", "soc2");
  back.held.close();
  assert.strictEqual(second.code, 0, second.stderr);
  assert.strictEqual(back.asked[0], lost.asked[0]);

  const again = await server([{ body: served }]);
  await started(home, again.held.address().port, tree, "soc2", "iso27001");
  again.held.close();
  assert.notStrictEqual(again.asked[0], lost.asked[0]);
});

test("a start left unclear on one folder is a new run on another folder, and the same run back on the first", async () => {
  const home = machine();
  const lost = await server(["drop"]);
  await started(home, lost.held.address().port, tree, "soc2");
  lost.held.close();

  const other = await server([{ body: served }]);
  await started(home, other.held.address().port, repository(), "soc2");
  other.held.close();
  assert.notStrictEqual(other.asked[0], lost.asked[0]);

  const back = await server([{ body: served }]);
  await started(home, back.held.address().port, tree, "soc2");
  back.held.close();
  assert.strictEqual(back.asked[0], lost.asked[0]);
});

test("every start refused on this machine says in one plain line that no pack credits were used, and what to do", async () => {
  const home = machine();
  const { held } = await server([{ body: served }]);
  const port = held.address().port;
  const file = join(home, "a-file.txt");
  writeFileSync(file, "x");
  const bad = join(home, "bad-set.json");
  writeFileSync(bad, JSON.stringify({ name: "Board check", pack: "custom", questions: [] }));
  const unselected = join(home, "broker.json");
  writeFileSync(unselected, JSON.stringify({ name: "Broker", pack: "cyber-insurance", questions: [{ identifier: "Q1", title: "Sign in", asked: "do we check who is logged in",
    intent: "Where does this repository check who is signed in?", looks_for: [{ find: "A check of the signed-in session", proof: "runs" }, { find: "A test of signing out", proof: "runs" }] }] }));
  const refused = [
    await started(home, port, join(home, "no-such-folder"), "soc2"),
    await started(home, port, file, "soc2"),
    await started(home, port, tree),
    await started(home, port, tree, "soc2", "--questions", join(home, "missing.json")),
    await started(home, port, tree, "soc2", "--questions", bad),
    await started(home, port, tree, "soc2", "--questions", unselected),
    await started(home, port, "--solution", tree, "--name", "App"),
  ];
  held.close();
  for (const ran of refused) {
    assert.strictEqual(ran.code, 1);
    assert.match(ran.stderr, /^[A-Z][^\n]*[Nn]o pack credits were used\. [^\n]+\.\n$/);
    assert.doesNotMatch(ran.stderr, /^[a-z-]+:|cyber-insurance|\.json/);
    assert.ok(catalogued(ran.stderr.trim()), `not a catalogue line: ${ran.stderr}`);
  }
});

test("a balance that cannot be read says in a catalogue line what to do, and a fault in Evalation goes to support with its detail", async () => {
  const { held } = await server([{ body: {} }]);
  const port = held.address().port;
  const fresh = await started(mkdtempSync(join(tmpdir(), "evalation-fresh-")), port, "--say", "packs", tree);
  assert.strictEqual(fresh.code, 1);
  assert.strictEqual(fresh.stderr, "This machine is not set up for Evalation yet, so the run cannot go on. No pack credits were used. Run /ev-start to set it up.\n");
  const damaged = machine();
  writeFileSync(join(damaged, "keys", "evalation-plugin.box.installation-key"), "short");
  assert.match((await started(damaged, port, "--say", "packs", tree)).stderr, /sign-in is damaged.+same account as before/);
  const unknown = await started(machine(), port, "--say", "no-such-part");
  held.close();
  assert.strictEqual(unknown.code, 1);
  const [first, ...detail] = unknown.stderr.trim().split("\n");
  assert.strictEqual(first, "The run stopped on a fault in Evalation. No pack credits were used. Please send this message to support@evalation.ai:");
  assert.ok(detail.length > 0);
});

test("a catalogue larger than a mebibyte is read whole, so the scan question is answered", async () => {
  const big = { ...SOC2, note: "x".repeat(2 * 1024 * 1024) };
  const { held } = await server([{ body: { revision: "1.86", packs: [{ pack: "soc2", body: big }] } }]);
  const ran = await started(machine(), held.address().port, "--scan", "soc2");
  held.close();
  assert.strictEqual(ran.code, 0, ran.stderr);
  assert.deepStrictEqual(JSON.parse(ran.stdout), { wanted: true, phases: ["sca"], for: ["SOC 2 Trust Services Criteria"] });
});

test("packs that cannot be read for the scan question say so plainly, with no pack credits used", async () => {
  const { held } = await server([{ code: 500, body: { refusals: [{ observed: "the database is down" }] } }]);
  const ran = await started(machine(), held.address().port, "--scan", "soc2");
  held.close();
  assert.strictEqual(ran.code, 1);
  assert.match(ran.stderr, /^[A-Z][^\n]*[Nn]o pack credits were used\. [^\n]+\.\n$/);
  assert.doesNotMatch(ran.stderr, /refused|500|database|\(/);
  assert.ok(catalogued(ran.stderr.trim()), `not a catalogue line: ${ran.stderr}`);
});

test("the pack titles on a machine not signed in say plainly to sign in, with no code and no path", async () => {
  const home = mkdtempSync(join(tmpdir(), "evalation-signed-out-"));
  const { held } = await server([{ body: { revision: "1.86", packs: [{ pack: "soc2", body: SOC2 }] } }]);
  const ran = await started(home, held.address().port, "--titles");
  held.close();
  assert.strictEqual(ran.code, 1);
  assert.match(ran.stderr, /^This machine is not set up for Evalation yet, so the run cannot go on\. No pack credits were used\. Run \/ev-start to set it up\.\n$/);
  const damaged = machine();
  writeFileSync(join(damaged, "keys", "evalation-plugin.box.installation-key"), "short");
  const again = await server([{ body: { revision: "1.86", packs: [{ pack: "soc2", body: SOC2 }] } }]);
  const broken = await started(damaged, again.held.address().port, "--titles");
  again.held.close();
  assert.match(broken.stderr, /sign-in is damaged.+Run \/ev-activate and sign in with the same account as before/);
});

test("the pack titles on a signed in machine are printed as evalation-packs gives them", async () => {
  const { held } = await server([{ body: { revision: "1.86", packs: [{ pack: "soc2", body: SOC2 }, { pack: "iso27001", body: ISO }] } }]);
  const ran = await started(machine(), held.address().port, "--titles");
  held.close();
  assert.strictEqual(ran.code, 0, ran.stderr);
  assert.deepStrictEqual(JSON.parse(ran.stdout).map((one) => one.title), ["ISO/IEC 27001", "SOC 2 Trust Services Criteria"]);
});

test("the last run of a folder is found for printing its reports again, and a folder never run says so plainly", async () => {
  const home = machine();
  const { target } = require("../bin/evalation-run");
  const named = target(tree).repository;
  mkdirSync(join(home, "findings"), { recursive: true });
  const kept = (file, at, repository) => writeFileSync(join(home, "findings", file), JSON.stringify({ schema: "evalation.findings.v1", run: file, at,
    target: { repository }, packs: [{ pack: "soc2", kind: "standard", title: "SOC 2 Trust Services Criteria" }] }));
  kept("older.json", "2026-09-20T00:00:00.000Z", named);
  kept("newer.json", "2026-09-28T00:00:00.000Z", named);
  kept("other.json", "2026-09-29T00:00:00.000Z", "acme/other");
  const ran = await started(home, 9, "--last", tree);
  assert.strictEqual(ran.code, 0, ran.stderr);
  const said = JSON.parse(ran.stdout);
  assert.strictEqual(said.written, join(home, "findings", "newer.json"));
  assert.deepStrictEqual(said.packs, [{ pack: "soc2", kind: "standard", title: "SOC 2 Trust Services Criteria" }]);
  const none = await started(machine(), 9, "--last", tree);
  assert.strictEqual(none.code, 1);
  assert.strictEqual(none.stderr, "This folder has no earlier run on this machine, so there are no reports to print again. No pack credits were used.\n");
  assert.ok(catalogued(none.stderr.trim()), `not a catalogue line: ${none.stderr}`);
});

test("whether the chosen packs want the scanners is known before anything is spent", async () => {
  const { held, asked } = await server([{ body: { revision: "1.86", packs: [{ pack: "soc2", body: SOC2 }, { pack: "iso27001", body: ISO }] } }]);
  const home = machine();
  const port = held.address().port;
  const soc2 = JSON.parse((await started(home, port, "--scan", "soc2")).stdout);
  const iso = JSON.parse((await started(home, port, "--scan", "iso27001")).stdout);
  const none = await started(home, port, "--scan");
  held.close();
  assert.deepStrictEqual(soc2, { wanted: true, phases: ["sca"], for: ["SOC 2 Trust Services Criteria"] });
  assert.strictEqual(iso.wanted, false);
  assert.deepStrictEqual(JSON.parse(none.stdout), { wanted: false, phases: [], for: [] });
  assert.strictEqual(asked.length, 0);
  assert.ok(!existsSync(join(home, "runs")));
});
