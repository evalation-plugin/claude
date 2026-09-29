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
        res.writeHead(200, { "content-type": "application/json" });
        res.end(typeof catalogue === "string" ? catalogue : JSON.stringify(catalogue));
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

test("a pack list the server sends broken says so and what to do", async () => {
  const ran = await packs(machine(), ["titles"], "<html>busy</html>");
  assert.strictEqual(ran.status, 1);
  assert.match(ran.stderr, /^packs-unreadable: .+support@evalation\.ai/);
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
  assert.strictEqual(line("ev-packs.damaged"), line("ev-account.damaged"), "every command gives a damaged sign-in the same advice");
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
  assert.match(broken.stderr, /^packs-unreadable: /);
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
  assert.match(flat, /Where they tick only `None of these` in every question, or tick exactly the packs `chosen` named, run nothing, show `evalation-say ev-packs\.nothing-changed titles="<titles>"`[^.]*and go to step 9\./);
  assert.doesNotMatch(flat, /pick Other and write that they want none/);
  assert.match(flat, /Pass the labels they ticked, leaving out `None of these`/);
});

test("a pack list that fails for a reason not named is still explained", () => {
  assert.match(flat, /Otherwise show the words after the colon exactly as printed and stop\./);
});

test("the next step says the person can pick other packs when they run a check", () => {
  assert.strictEqual(line("ev-packs.next"), "Next, run /ev-run to check a repository against these packs. It also lets you pick other packs for that check alone.");
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

test("the chooser offers None of these in every question beside at most three packs, each question worded apart, every header in 12 characters", async () => {
  for (const count of [2, 5, 9, 18]) {
    const catalogue = { revision: "1", packs: Array.from({ length: count }, (_, at) => ({ pack: `p${at}`, kind: "standard", body: { title: `Pack ${String(at).padStart(2, "0")}`, summary: "A pack." } })).reverse() };
    const ran = await packs(machine(), ["chooser"], catalogue);
    assert.strictEqual(ran.status, 0, ran.stderr);
    const { questions } = JSON.parse(ran.stdout);
    assert.strictEqual(questions.length, Math.ceil(count / 3), `${count} packs`);
    assert.ok(questions.every((one) => one.options.at(-1).label === "None of these"), `${count} packs: None of these closes every question`);
    assert.deepStrictEqual(questions.flatMap((one) => one.options.slice(0, -1).map((each) => each.label)), catalogue.packs.map((one) => one.body.title).reverse());
    assert.strictEqual(new Set(questions.map((one) => one.question)).size, questions.length, `${count} packs: no two questions read the same`);
    questions.forEach((one, at) => {
      assert.strictEqual(one.header, questions.length > 1 ? `Packs ${at + 1}/${questions.length}` : "Packs");
      assert.ok(one.header.length <= 12 && one.multiSelect && one.options.length >= 3 && one.options.length <= 4);
      assert.ok(one.options.slice(0, -1).every((each) => each.description === "A pack."));
    });
  }
});
