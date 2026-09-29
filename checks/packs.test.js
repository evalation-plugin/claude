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

const COMMAND = readFileSync(join(__dirname, "..", "commands", "ev-packs.md"), "utf8");
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

test("the chooser reads the short catalogue, never the whole one, and runs commands in the form its permissions allow", () => {
  assert.doesNotMatch(COMMAND, /evalation-packs list/);
  assert.match(COMMAND, /evalation-packs titles/);
  assert.doesNotMatch(COMMAND, /CLAUDE_PLUGIN_ROOT/);
  const allowed = COMMAND.match(/^allowed-tools: (.+)$/m)?.[1] ?? "";
  for (const run of COMMAND.matchAll(/^\s*(evalation-[a-z]+(?: [a-z]+)?)/gm)) {
    assert.ok(allowed.split(", ").some((one) => run[1].startsWith(one.replace(/^Bash\(/, "").replace(/:\*\)$/, ""))), run[1]);
  }
});

test("one pack is one pack credit", () => {
  assert.match(COMMAND, /one pack credit each time/);
});

const flat = COMMAND.replace(/\s+/g, " ");

test("keeping the usual packs says what they cost and what is left", () => {
  assert.match(flat, /On "Keep these packs"[^.]*, say "Your checks still use <titles>, <M> pack credits each time\. You have <N> pack credits left\."/);
  assert.doesNotMatch(flat, /Your code is still checked against|Your code will be checked against/);
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
  const damaged = flat.indexOf("`sign-in: damaged` line: say \"This machine's Evalation sign-in is damaged. Run /ev-activate to sign in again.\"");
  assert.ok(damaged > 0 && damaged < flat.indexOf("This machine is not signed in to Evalation yet."), "the damaged line comes first");
});

test("the usual packs are named in the question, and packs chosen now are marked in the chooser", () => {
  assert.match(flat, /ask "Keep your usual packs, <titles>\?"/);
  assert.match(flat, /Where `show` named the pack, end its description with "Chosen now\."/);
});

test("the same packs ticked again, or nothing ticked, change nothing and save nothing", () => {
  assert.match(flat, /Where they tick nothing in any question, or tick exactly the packs `show` named, run nothing, say "Nothing changed\. Your checks still use <titles>\."[^.]*and go to step 9\./);
  assert.match(flat, /Where they pick Other and write that they want none from that question, take it as nothing ticked there\./);
});

test("a pack list that fails for a reason not named is still explained", () => {
  assert.match(flat, /Otherwise say the words after the colon in plain words and stop\./);
});

test("the next step says the person can pick other packs when they run a check", () => {
  assert.match(flat, /"Next, run \/ev-run to check a repository against these packs\. It also lets you pick other packs for that check alone\."/);
});

test("what a pack is, is said only once the machine is known to be signed in", () => {
  assert.ok(flat.indexOf("A pack is one thing") > flat.indexOf("state: live"), "the pack line comes after the sign in check passes");
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

test("the chooser follows the question titles gives each pack, and its header fits in 12 characters", () => {
  assert.match(flat, /`question`/);
  const header = flat.match(/each headed "([^"]+)"/)?.[1] ?? "";
  assert.ok(header.includes("<k>") && header.includes("<n>"), header);
  assert.ok(header.replace("<k>", "10").replace("<n>", "10").length <= 12, header);
});

test("every answer the command offers carries its description", () => {
  const register = JSON.parse(readFileSync(join(__dirname, "..", "lib", "asked.json"), "utf8")).filter((one) => one.command === "ev-packs");
  for (const one of register) {
    const para = COMMAND.split(/\n\s*\n/).map((each) => each.replace(/\s+/g, " ")).find((each) => each.includes(`"${one.asks}"`)) ?? "";
    assert.doesNotMatch(para, /"[^"]+" and "[^"]+"/, one.asks);
    if (!/^Which packs/.test(one.asks)) assert.ok((para.match(/"[^"]+", described as "[^"]+"/g) ?? []).length >= 2, one.asks);
  }
});
