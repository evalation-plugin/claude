"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");
require("./fixture.js");
const { entries, say } = require("../lib/say.js");

const COMMAND = readFileSync(join(__dirname, "..", "commands", "ev-packs.md"), "utf8");
const LINES = entries();
const line = (name, values) => say(LINES, name, values);
const CATALOGUE = { revision: "1", packs: [
  { pack: "soc2", kind: "standard", body: { title: "SOC 2 Trust Services Criteria", description: "Long and ours." } },
  { pack: "gdpr", kind: "standard", body: { title: "General Data Protection Regulation (GDPR)", summary: "EU rules on handling personal data." } },
] };

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-packs-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  for (const one of ["installation-key", "receiving-key"]) {
    writeFileSync(join(home, "keys", `evalation-plugin.box.${one}`), randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

function packs(home, args, catalogue = CATALOGUE) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        const { status = 200, body = catalogue } = catalogue?.status ? catalogue : {};
        res.writeHead(status, { "content-type": "application/json" });
        res.end(typeof body === "string" ? body : JSON.stringify(body));
      });
    }).listen(0, "127.0.0.1", () => {
      const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-packs"), ...args], { env: { ...process.env,
        EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
        EVALATION_SERVER: `http://127.0.0.1:${server.address().port}` } });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", (status) => server.close(() => resolve({ status, stdout, stderr })));
    });
  });
}

test("set refuses a pack the catalogue does not offer and writes nothing", async () => {
  const home = machine();
  const ran = await packs(home, ["set", "soc2", "soc-2"]);
  assert.strictEqual(ran.status, 1);
  assert.match(ran.stderr, /^unknown-pack: soc-2\b/);
  assert.strictEqual(existsSync(join(home, "packs.json")), false);
  const kept = await packs(home, ["set", "soc2", "gdpr"]);
  assert.strictEqual(kept.status, 0, kept.stderr);
  const shown = JSON.parse((await packs(home, ["show"])).stdout);
  assert.deepStrictEqual(shown.packs, ["soc2", "gdpr"]);
  assert.match(shown.chosen, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
});

const STEP = (at) => flat.slice(flat.indexOf(`${at}. **`), flat.indexOf(`${at + 1}. **`));

test("every way the pack list can fail starts with one word the command turns into a catalogue line, and nothing a script or the server wrote is shown", async () => {
  const cases = [
    ["unreadable", "<html>busy</html>"],
    ["unreachable", { status: 503, body: { observed: "the database is down", required: "try later" } }],
    ["clock", { status: 401, body: { observed: "the proof was made 900 seconds from now, which is outside the window", required: "a fresh proof" } }],
    ["refused", { status: 401, body: { observed: "nothing we issued signed this", required: "sign in again" } }],
  ];
  for (const [word, served] of cases) {
    for (const verb of ["chosen", "chooser", "titles"]) {
      const ran = await packs(machine(), [verb], served);
      assert.strictEqual(ran.status, 1, `${word} ${verb}`);
      assert.match(ran.stderr, new RegExp(`^${word}: `), `${word} ${verb}: ${ran.stderr}`);
      assert.strictEqual(ran.stdout, "", `${word} ${verb}`);
    }
  }
  const home = machine();
  writeFileSync(join(home, "packs.json"), "{ not json");
  const unread = await packs(home, ["chosen"]);
  assert.strictEqual(unread.status, 1);
  assert.match(unread.stderr, /^choice-unreadable: /);
  const chooser = await packs(home, ["chooser"]);
  assert.strictEqual(chooser.status, 0, "a choice that will not read offers every pack unmarked");
  for (const [word, name] of [["unreachable", "unreachable"], ["refused", "refused"], ["clock", "clock"], ["damaged", "damaged"], ["not-set-up", "not-signed-in"], ["unreadable", "unreadable"], ["choice-unreadable", "choice-unreadable"]]) {
    assert.ok(flat.includes(`\`${word}\`: \`evalation-say ev-packs.${name}\``), word);
  }
  assert.match(flat, /any other word: `evalation-say ev-packs\.other`/);
  assert.doesNotMatch(STEP(2), /exactly as printed|words after the colon/);
  assert.match(line("ev-packs.unreadable"), /^Evalation sent a pack list this plugin can't read\./);
  assert.doesNotMatch(readFileSync(join(__dirname, "..", "bin", "evalation-packs"), "utf8"), /support@|Try again/);
});

test("titles gives each pack a one-line summary, the served one where there is one", async () => {
  const ran = await packs(machine(), ["titles"]);
  assert.strictEqual(ran.status, 0, ran.stderr);
  const [gdpr, soc2] = JSON.parse(ran.stdout);
  assert.strictEqual(gdpr.summary, "EU rules on handling personal data.");
  assert.strictEqual(typeof soc2.summary, "string");
  assert.ok(soc2.summary.length > 0 && soc2.summary.length <= 120);
  assert.strictEqual(require("../lib/prose.js").held(soc2.summary).length, 0);
});

test("the command reads no pack data itself, and runs commands in the form its permissions allow", () => {
  assert.doesNotMatch(COMMAND, /evalation-packs (list|titles|show)/);
  assert.match(COMMAND, /evalation-packs chosen/);
  assert.match(COMMAND, /evalation-packs chooser/);
  assert.doesNotMatch(COMMAND, /CLAUDE_PLUGIN_ROOT/);
  const allowed = COMMAND.match(/^allowed-tools: (.+)$/m)?.[1] ?? "";
  for (const run of COMMAND.matchAll(/(?:^\s*|`)(evalation-[a-z]+(?: [a-z]+)?)/gm)) {
    assert.ok(allowed.split(", ").some((one) => run[1].startsWith(one.replace(/^Bash\(/, "").replace(/:\*\)$/, ""))), run[1]);
  }
});

test("one pack is one pack credit", () => {
  assert.strictEqual(line("ev-packs.kept-one", { titles: "SOC 2" }), "Your checks still use SOC 2, one pack credit each time.");
  assert.match(line("ev-packs.saved-one", { titles: "SOC 2" }), /one pack credit each time/);
  assert.match(COMMAND, /ev-packs\.kept-one/);
  assert.match(COMMAND, /ev-packs\.saved-one/);
});

const flat = COMMAND.replace(/\s+/g, " ");

test("keeping the usual packs says what they cost and what is left", () => {
  assert.strictEqual(`${line("ev-packs.kept", { titles: "SOC 2", count: 2 })} ${line("ev-packs.credits-left", { credits: 5 })}`,
    "Your checks still use SOC 2, 2 pack credits each time. You have 5 pack credits left.");
  assert.match(flat, /On `Keep these packs`, show the lines `evalation-say ev-packs\.kept[^`]*` and `evalation-say ev-packs\.credits-left[^`]*` print/);
  assert.doesNotMatch(JSON.stringify(LINES), /Your code is still checked against|Your code will be checked against/);
});

test("set takes the titles a person reads and prints only those titles", async () => {
  const home = machine();
  const ran = await packs(home, ["set", "SOC 2 Trust Services Criteria", "gdpr"]);
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.strictEqual(ran.stdout, "SOC 2 Trust Services Criteria\nGeneral Data Protection Regulation (GDPR)\n");
  assert.deepStrictEqual(JSON.parse((await packs(home, ["show"])).stdout).packs, ["soc2", "gdpr"]);
  assert.match(flat, /evalation-packs set "<title>" \["<title>"\.\.\.\]/);
  assert.doesNotMatch(flat, /set <pack>/);
});

test("a damaged sign-in is told to sign in again, ahead of the line for a machine never signed in", () => {
  assert.strictEqual(line("ev-packs.damaged"), "This machine's Evalation sign-in is damaged. Run /ev-activate and sign in with the same account as before.", "the account holds the pack credits, and the reports never depend on it");
  assert.strictEqual(line("ev-packs.not-signed-in"), line("ev-account.not-set-up"), "a machine never signed in is sent to /ev-start everywhere");
  const damaged = flat.indexOf("`sign-in: damaged` line: show `evalation-say ev-packs.damaged`");
  assert.ok(damaged > 0 && damaged < flat.indexOf("ev-packs.not-signed-in"), "the damaged line comes first");
});

test("the chosen packs are named by title in one line, with a pack no longer offered said plainly", async () => {
  const home = machine();
  assert.deepStrictEqual(JSON.parse((await packs(home, ["chosen"])).stdout), { titles: null, packs: 0 });
  writeFileSync(join(home, "packs.json"), JSON.stringify({ packs: ["soc2", "retired", "gdpr"] }));
  const ran = await packs(home, ["chosen"]);
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.deepStrictEqual(JSON.parse(ran.stdout), { titles: "General Data Protection Regulation (GDPR), SOC 2 Trust Services Criteria and a pack Evalation no longer offers", packs: 3 });
  writeFileSync(join(home, "packs.json"), JSON.stringify({ packs: ["soc2", "gdpr"] }));
  assert.strictEqual(JSON.parse((await packs(home, ["chosen"])).stdout).titles, "General Data Protection Regulation (GDPR) and SOC 2 Trust Services Criteria", "the order a selection was saved in never changes the order it is named in");
  const broken = await packs(home, ["chosen"], "<html>busy</html>");
  assert.strictEqual(broken.status, 1);
  assert.match(broken.stderr, /^unreadable: /);
});

test("the usual packs are named in the question, and packs chosen now are marked in the chooser", async () => {
  const asked = JSON.parse(line("ev-packs.keep", { titles: "SOC 2 Trust Services Criteria" })).questions[0];
  assert.strictEqual(asked.question, "Keep your usual packs, SOC 2 Trust Services Criteria?");
  assert.deepStrictEqual(asked.options.map((one) => one.label), ["Keep these packs", "Choose packs again"]);
  const home = machine();
  writeFileSync(join(home, "packs.json"), JSON.stringify({ packs: ["soc2"] }));
  const ran = await packs(home, ["chooser"]);
  assert.strictEqual(ran.status, 0, ran.stderr);
  const [gdpr, soc2] = JSON.parse(ran.stdout).questions[0].options;
  assert.strictEqual(gdpr.description, "EU rules on handling personal data.");
  assert.match(soc2.description, /\. Chosen now\.$/);
});

test("a served summary that breaks the wording rules gives way to the plugin's own, so the chooser still asks", async () => {
  const served = { revision: "1", packs: [
    { pack: "soc2", kind: "standard", body: { title: "SOC 2 Trust Services Criteria", summary: "Security; availability" } },
    { pack: "gdpr", kind: "standard", body: { title: "General Data Protection Regulation (GDPR)", summary: "EU rules on handling personal data." } },
  ] };
  const ran = await packs(machine(), ["chooser"], served);
  assert.strictEqual(ran.status, 0, ran.stderr);
  const soc2 = JSON.parse(ran.stdout).questions[0].options.find((one) => one.label.startsWith("SOC 2"));
  assert.strictEqual(soc2.description, "The US security audit most business software customers ask for.");
});

test("the same packs ticked again, or nothing ticked, change nothing and save nothing", () => {
  assert.strictEqual(line("ev-packs.nothing-changed", { titles: "SOC 2" }), "Nothing changed. Your checks still use SOC 2.");
  assert.match(flat, /Where they tick nothing in every question, or tick exactly the packs `chosen` named, run nothing, show `evalation-say ev-packs\.nothing-changed titles="<titles>"`[^.]*and go to step 9\./);
  assert.doesNotMatch(flat, /pick Other and write that they want none/);
  assert.match(flat, /Pass the labels they ticked, each in double quotes/);
  assert.doesNotMatch(flat, /None of these/);
});

test("what set prints is never shown, since the saved line says it", () => {
  assert.match(STEP(7), /Show nothing it prints\./);
  assert.doesNotMatch(STEP(7), /It prints the titles it saved/);
});

test("a pack list with nothing ticked adds no pack and the command carries on", () => {
  assert.match(STEP(5), /A question with nothing ticked adds no pack, and the command carries on to the next\./);
});

test("every pack summary is a catalogue line, one per pack handle, and the chooser uses it where the server sends none", async () => {
  const handles = ["cyber-insurance", "dora", "eu-ai-act", "gdpr", "hardening", "hipaa", "investment-diligence", "ism", "iso27001", "iso42001", "nist-ai-rmf",
    "nist-csf", "nist-ssdf", "nz-privacy-act", "owasp-agentic-threats", "owasp-agentic-top-ten", "owasp-asvs", "pci-dss", "soc2"];
  for (const one of handles) assert.ok(LINES[`ev-packs.summary-${one}`]?.say, one);
  const catalogue = { revision: "1", packs: handles.map((one) => ({ pack: one, kind: "standard", body: { title: `Pack ${one}` } })) };
  const ran = await packs(machine(), ["chooser"], catalogue);
  assert.strictEqual(ran.status, 0, ran.stderr);
  const described = Object.fromEntries(JSON.parse(ran.stdout).questions.flatMap((one) => one.options).map((one) => [one.label, one.description]));
  for (const one of handles) assert.strictEqual(described[`Pack ${one}`], line(`ev-packs.summary-${one}`), one);
});

test("the next step says the person can pick other packs when they run a check", () => {
  assert.strictEqual(line("ev-packs.next"), "Next, run /ev-run to check a repository.");
  assert.match(flat, /`evalation-say ev-packs\.next`/);
});

test("what a pack is, is said only once the machine is known to be signed in", () => {
  assert.ok(flat.indexOf("ev-packs.what-a-pack") > flat.indexOf("state: live"), "the pack line comes after the sign in check passes");
});

test("titles spreads the packs so every chooser question offers two to four, in alphabetical order", async () => {
  for (const count of [2, 5, 9, 17, 18, 21, 37]) {
    const catalogue = { revision: "1", packs: Array.from({ length: count }, (_, at) => ({ pack: `p${at}`, kind: "standard", body: { title: `Pack ${String(at).padStart(2, "0")}`, summary: "A pack." } })).reverse() };
    const ran = await packs(machine(), ["titles"], catalogue);
    assert.strictEqual(ran.status, 0, ran.stderr);
    const shown = JSON.parse(ran.stdout);
    assert.deepStrictEqual(shown.map((one) => one.title), catalogue.packs.map((one) => one.body.title).reverse(), `${count} packs keep their order`);
    const sizes = shown.reduce((held, one) => ({ ...held, [one.question]: (held[one.question] ?? 0) + 1 }), {});
    assert.deepStrictEqual(Object.keys(sizes).map(Number), Array.from({ length: Math.ceil(count / 4) }, (_, at) => at + 1), `${count} packs fill questions 1 onwards`);
    assert.ok(Object.values(sizes).every((size) => size >= 2 && size <= 4), `${count} packs: ${JSON.stringify(sizes)}`);
    assert.ok(shown.every((one, at) => at === 0 || one.question >= shown[at - 1].question), `${count} packs run through the questions in order`);
  }
});

test("the chooser offers only packs, at most four to a question, each question worded apart, every header in 12 characters", async () => {
  for (const count of [2, 5, 9, 18]) {
    const catalogue = { revision: "1", packs: Array.from({ length: count }, (_, at) => ({ pack: `p${at}`, kind: "standard", body: { title: `Pack ${String(at).padStart(2, "0")}`, summary: "A pack." } })).reverse() };
    const ran = await packs(machine(), ["chooser"], catalogue);
    assert.strictEqual(ran.status, 0, ran.stderr);
    const { questions } = JSON.parse(ran.stdout);
    assert.strictEqual(questions.length, Math.ceil(count / 4), `${count} packs`);
    assert.deepStrictEqual(questions.flatMap((one) => one.options.map((each) => each.label)), catalogue.packs.map((one) => one.body.title).reverse());
    assert.strictEqual(new Set(questions.map((one) => one.question)).size, questions.length, `${count} packs: no two questions read the same`);
    questions.forEach((one, at) => {
      assert.strictEqual(one.header, questions.length > 1 ? `Packs ${at + 1}/${questions.length}` : "Packs");
      assert.ok(one.header.length <= 12 && one.multiSelect && one.options.length >= 2 && one.options.length <= 4);
      assert.ok(one.options.every((each) => each.description === "A pack."));
    });
  }
});

test("several pack lists with one ticked and the rest left empty save the ticked pack and nothing stops", async () => {
  const session = "packs-lists";
  const catalogue = { revision: "1", packs: Array.from({ length: 18 }, (_, at) => ({ pack: `p${at}`, kind: "standard", body: { title: `Pack ${String(at).padStart(2, "0")}`, summary: "A pack." } })) };
  const home = machine();
  const { questions } = JSON.parse((await packs(home, ["chooser"], catalogue)).stdout);
  const ticked = questions[0].options[0].label;
  const answers = Object.fromEntries(questions.slice(0, 4).map((one, at) => [one.question, at === 0 ? ticked : "[No preference]"]));
  const hook = require("node:child_process").spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-unanswered"), "asked"], { encoding: "utf8",
    env: { ...process.env, EVALATION_PLUGIN_HOME: home, CLAUDE_CODE_SESSION_ID: session },
    input: JSON.stringify({ session_id: session, tool_input: { questions: questions.slice(0, 4) }, tool_response: { answers } }) });
  assert.strictEqual(hook.stdout, "", "a tick list left empty chooses none from it, so the command carries on");
  process.env.CLAUDE_CODE_SESSION_ID = session;
  const saved = await packs(home, ["set", ticked], catalogue);
  delete process.env.CLAUDE_CODE_SESSION_ID;
  assert.strictEqual(saved.status, 0, saved.stderr);
  assert.deepStrictEqual(JSON.parse(readFileSync(join(home, "packs.json"), "utf8")).packs, ["p0"]);
});
