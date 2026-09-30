"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");
const { repository } = require("./fixture.js");
const { entries, say } = require("../lib/say.js");

const BIN = join(__dirname, "..", "bin");
const LINES = entries();
const OWNER = "jane@acme.com";
const flat = (text) => text.replace(/\s+/g, " ");
const command = (name) => flat(readFileSync(join(__dirname, "..", "commands", name), "utf8"));

const REFUSED = {
  "awaiting-approval": { observed: `your request to join Acme is waiting for ${OWNER} to approve it`, required: `ask ${OWNER} to approve you` },
  declined: { observed: "your request to join Acme was declined", required: `ask ${OWNER} if you think this is a mistake` },
  removed: { observed: "you've been removed from Acme", required: `ask ${OWNER} if you think this is a mistake` },
  "machine-awaiting-approval": { observed: `this machine is waiting for ${OWNER} to approve it`, required: `ask ${OWNER} to approve it` },
  "machine-declined": { observed: "this machine was declined for Acme", required: `ask ${OWNER} if you think this is a mistake` },
};
const SUFFIX = { "awaiting-approval": "awaiting", declined: "declined", removed: "removed", "machine-awaiting-approval": "machine-awaiting", "machine-declined": "machine-declined" };
const refusal = (kind, owner = OWNER, organisation = "Acme") => ({ refusals: [{ at: "membership", ...REFUSED[kind], failure: kind,
  ...(owner === null ? {} : { owner }), ...(organisation === null ? {} : { organisation }) }] });

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-approval-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  for (const one of ["installation-key", "receiving-key"]) {
    writeFileSync(join(home, "keys", `evalation-plugin.box.${one}`), randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ schema: "evalation.local.v1", installation: "box", signed_in_as: "bob@acme.com", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

function standIn(answer) {
  const asked = [];
  let back = null;
  const held = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const parsed = body ? JSON.parse(body) : null;
      asked.push({ path: req.url, body: parsed });
      if (req.url === "/activate/start") back = parsed.redirect_uri;
      const [code, reply] = req.url === "/activate/start" ? [200, { state: "S", authorization_url: "https://example.test/signin" }] : answer(req.url, parsed);
      res.writeHead(code, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify(reply));
    });
  });
  held.unref();
  return new Promise((resolve) => held.listen(0, "127.0.0.1", () => resolve({ held, asked, back: () => back, base: `http://127.0.0.1:${held.address().port}` })));
}

function ran(script, args, env, told) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(BIN, script), ...args], { env: { ...process.env, EVALATION_KEY_STORE: "file", ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (told) told(stderr); });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

const on = (home, base) => ({ EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_SERVER: base });

test("a refusal of each approval kind is read from its failure and owner fields, and anything else is not one", () => {
  const { approvalOf } = require("../lib/approval.js");
  for (const kind of Object.keys(REFUSED)) {
    assert.deepStrictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal(kind))}`), { kind, owner: OWNER, organisation: "Acme", line: SUFFIX[kind] });
    assert.deepStrictEqual(approvalOf(`refused: refused 403: ${JSON.stringify(refusal(kind))}`), { kind, owner: OWNER, organisation: "Acme", line: SUFFIX[kind] });
  }
  assert.deepStrictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal("removed", OWNER, null))}`), { kind: "removed", owner: OWNER, organisation: null, line: "removed" });
  assert.strictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal("removed", OWNER, "Acme\nstate: live"))}`).organisation, null);
  assert.strictEqual(approvalOf(`refused 401: ${JSON.stringify(refusal("declined"))}`), null);
  assert.strictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal("declined", null))}`), null);
  assert.strictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal("declined", "jane@acme.com\nstate: live"))}`), null);
  assert.strictEqual(approvalOf(`refused 403: ${JSON.stringify({ refusals: [{ observed: "declined", failure: "not-operator", owner: OWNER }] })}`), null);
  assert.strictEqual(approvalOf("refused 403: <html>Forbidden</html>"), null);
  assert.strictEqual(approvalOf("unreachable: http://127.0.0.1:9/pin (fetch failed)"), null);
});

const ACCOUNT = {
  "awaiting-approval": ["Your request to use Acme's Evalation credits is waiting for jane@acme.com to approve it.",
    "Your request to use your organisation's Evalation credits is waiting for jane@acme.com to approve it."],
  declined: ["Acme declined your request to use its Evalation credits. If that's a mistake, ask jane@acme.com.",
    "Your organisation declined your request to use its Evalation credits. If that's a mistake, ask jane@acme.com."],
  removed: ["Acme removed you, so you can't use its Evalation credits any more. If that's a mistake, ask jane@acme.com.",
    "Your organisation removed you, so you can't use its Evalation credits any more. If that's a mistake, ask jane@acme.com."],
  "machine-awaiting-approval": ["This machine is waiting for jane@acme.com to approve it.",
    "This machine is waiting for jane@acme.com to approve it."],
  "machine-declined": ["Acme declined this machine. If that's a mistake, ask jane@acme.com.",
    "Your organisation declined this machine. If that's a mistake, ask jane@acme.com."],
};

test("the account check prints each approval state, the owner's address and the line naming the organisation", async () => {
  for (const kind of Object.keys(REFUSED)) {
    for (const [at, organisation] of [[0, "Acme"], [1, null]]) {
      const { held, base } = await standIn(() => [403, refusal(kind, OWNER, organisation)]);
      const said = await ran("evalation-status", [], on(machine(), base));
      held.close();
      assert.strictEqual(said.code, 0, said.stderr);
      assert.strictEqual(said.stdout, `state: not-live\nsigned in as: bob@acme.com\nreason: ${kind}\nowner: ${OWNER}\n${
        organisation ? "organisation: Acme\n" : ""}said: ${ACCOUNT[kind][at]}\n`);
    }
  }
  const { held, base } = await standIn(() => [403, refusal("declined", null)]);
  const unnamed = await ran("evalation-status", [], on(machine(), base));
  held.close();
  assert.strictEqual(unnamed.stdout, "state: not-live\nsigned in as: bob@acme.com\nreason: other\n");
});

test("every command that checks the account shows the account check's own line for an approval state", () => {
  for (const file of ["ev-account.md", "ev-start.md", "ev-packs.md"]) {
    const text = command(file);
    assert.match(text, /`reason: awaiting-approval`, `declined`, `removed`, `machine-awaiting-approval` or `machine-declined`: show the text after `said: ` exactly as printed/, file);
    assert.doesNotMatch(text, /owner=<owner>/, file);
  }
  assert.match(command("ev-remove.md"), /`state: live`, or `state: not-live` for any other reason: go on/);
});

test("a run refused for approval says so in one catalogue line naming the owner, at the start and before it", async () => {
  const tree = repository();
  const run = {
    "awaiting-approval": "The run didn't start, because jane@acme.com hasn't approved your request to use Acme's Evalation credits yet. No pack credits were used.\n",
    declined: "The run didn't start, because Acme declined your request to use its Evalation credits. No pack credits were used. If that's a mistake, ask jane@acme.com.\n",
    removed: "The run didn't start, because Acme removed you. No pack credits were used. If that's a mistake, ask jane@acme.com.\n",
    "machine-awaiting-approval": "The run didn't start, because this machine is waiting for jane@acme.com to approve it. No pack credits were used.\n",
    "machine-declined": "The run didn't start, because Acme declined this machine. No pack credits were used. If that's a mistake, ask jane@acme.com.\n",
  };
  const { held: bare, base: plain } = await standIn(() => [403, refusal("removed", OWNER, null)]);
  const unnamed = await ran("evalation-run", [tree, "soc2"], on(machine(), plain));
  bare.close();
  assert.strictEqual(unnamed.stderr, "The run didn't start, because your organisation removed you. No pack credits were used. If that's a mistake, ask jane@acme.com.\n");
  for (const kind of Object.keys(REFUSED)) {
    const { held, base } = await standIn(() => [403, refusal(kind)]);
    const home = machine();
    const started = await ran("evalation-run", [tree, "soc2"], on(home, base));
    const titles = await ran("evalation-run", ["--titles"], on(home, base));
    const asked = await ran("evalation-run", ["--say", "short", "2"], on(home, base));
    held.close();
    for (const one of [started, titles, asked]) {
      assert.strictEqual(one.code, 1);
      assert.strictEqual(one.stderr, run[kind]);
    }
  }
});

async function signedIn(complete, answer = () => [200, { revision: "1.86" }], provider = "google") {
  const server = await standIn((path, body) => (path === "/activate/complete" ? complete(body) : answer(path, body)));
  const home = mkdtempSync(join(tmpdir(), "evalation-approval-sign-in-"));
  let sent = false;
  const signing = await ran("evalation-activate", [provider], { PATH: mkdtempSync(join(tmpdir(), "evalation-no-browser-")), ...on(home, server.base) }, (stderr) => {
    if (!sent && server.back() && /Waiting for you/.test(stderr)) {
      sent = true;
      fetch(`${server.back()}?code=c&state=S`).catch(() => {});
    }
  });
  const company = (...args) => ran("evalation-activate", ["company", ...args], on(home, server.base));
  return { signing, out: signing.code === 0 ? JSON.parse(signing.stdout) : null, company, server };
}

const done = (membership, company = "Acme") => (body) => [200, { installation: body.installation, email: "bob@acme.com",
  ...(company === null ? {} : { company }), ...(membership === undefined ? {} : { membership }) }];
const WAITING = { state: "awaiting-approval", organisation: "Acme", owner: OWNER };

test("every sign-in asks which company it is for, with the name the server gave as the ready answer", async () => {
  const { signing, out, server } = await signedIn(done(WAITING));
  server.held.close();
  assert.strictEqual(signing.code, 0, signing.stderr);
  assert.strictEqual(out.said, undefined, "nothing is said about approval before the company is answered, since the request waits for it");
  const asked = JSON.parse(out.question).questions[0];
  assert.strictEqual(asked.question, "Which company are you using Evalation for? Pick Acme, or type another name, such as a client's.");
  assert.deepStrictEqual(asked.options, [{ label: "Acme", description: "Saves this sign-in as being for Acme." },
    { label: "Leave it for now", description: "You'll be asked next time you sign in." }]);
  assert.ok(!server.asked.some((one) => one.path === "/pin" || one.path === "/activate/company"));
  const named = await signedIn(done(WAITING, "Robust Systems; Ltd"));
  named.server.held.close();
  assert.strictEqual(JSON.parse(named.out.question).questions[0].options[0].label, "Robust Systems; Ltd", "a company's own name is kept as the server gave it");
});

test("a sign-in the server gives no company for asks the same question with no ready answer", async () => {
  const { out, server } = await signedIn(done(null, null));
  server.held.close();
  const asked = JSON.parse(out.question).questions[0];
  assert.strictEqual(asked.question, "Which company are you using Evalation for? Pick Other and type its name, such as a client's.");
  assert.deepStrictEqual(asked.options, [{ label: "I'll type the name", description: "Pick Other and type the company's name." },
    { label: "Leave it for now", description: "You'll be asked next time you sign in." }]);
  const blank = await signedIn(done(null, "   "));
  blank.server.held.close();
  assert.strictEqual(JSON.parse(blank.out.question).questions[0].options[0].label, "I'll type the name");
  assert.match(command("ev-activate.md"), /Where they pick the answer to type the name and type nothing, ask the question again\./);
});

test("the company answer is sent signed, and the reply says who the request went to", async () => {
  const request = { company: "Company ABC", request: { ...WAITING, emailed: true, refusal: null } };
  const { company, server } = await signedIn(done(WAITING), (path) => (path === "/activate/company" ? [200, request] : [200, {}]));
  const answered = await company("Company ABC");
  server.held.close();
  assert.strictEqual(answered.code, 0, answered.stderr);
  const sent = server.asked.find((one) => one.path === "/activate/company");
  assert.deepStrictEqual(sent.body, { company: "Company ABC" });
  const out = JSON.parse(answered.stdout);
  assert.strictEqual(out.approval, "awaiting-approval");
  assert.strictEqual(out.said, "Signed in as bob@acme.com. Your request to use Acme's Evalation credits went to jane@acme.com. You can run Evalation once they approve it.");
});

test("a new machine for someone approved says it waits for its approver, and an email that failed says so", async () => {
  const machineWaiting = { state: "machine-awaiting-approval", organisation: "Acme", owner: OWNER };
  const one = await signedIn(done(machineWaiting), () => [200, { company: "Acme", request: { ...machineWaiting, emailed: true, refusal: null } }]);
  const said = JSON.parse((await one.company("Acme")).stdout);
  one.server.held.close();
  assert.strictEqual(said.approval, "machine-awaiting-approval");
  assert.strictEqual(said.said, "Signed in as bob@acme.com. This machine needs jane@acme.com to approve it, and we've asked them.");
  const failed = await signedIn(done(WAITING), () => [200, { company: "Acme", request: { ...WAITING, emailed: false,
    refusal: { at: "approval", observed: "we couldn't email Acme's owner to approve you", required: "tell support@evalation.ai", failure: "approval-unavailable" } } }]);
  const unsent = JSON.parse((await failed.company("Acme")).stdout);
  failed.server.held.close();
  assert.strictEqual(unsent.approval, "approval-unavailable");
  assert.strictEqual(unsent.said, "Signed in as bob@acme.com. Evalation couldn't email jane@acme.com for their approval. Email support@evalation.ai and we'll send it.");
});

test("a company answer that sent no request learns any refusal from the account check that follows", async () => {
  for (const kind of ["awaiting-approval", "declined", "removed", "machine-declined"]) {
    const { company, server } = await signedIn(done(), (path) => (path === "/activate/company" ? [200, { company: "Acme", request: null }] : [403, refusal(kind)]));
    const out = JSON.parse((await company("Acme")).stdout);
    server.held.close();
    assert.strictEqual(out.approval, kind);
    assert.strictEqual(out.said, `Signed in as bob@acme.com. ${ACCOUNT[kind][0]}`);
  }
  const plain = await signedIn(done(), (path) => (path === "/activate/company" ? [200, { company: "Acme", request: null }] : [200, { revision: "1.86" }]));
  const out = JSON.parse((await plain.company("Acme")).stdout);
  plain.server.held.close();
  assert.deepStrictEqual(out, {});
});

test("leaving the company unanswered sends nothing, and says the request goes shortly and the question comes back", async () => {
  const { company, server } = await signedIn(done(WAITING));
  const later = JSON.parse((await company("--later")).stdout);
  server.held.close();
  assert.ok(!server.asked.some((one) => one.path === "/activate/company"));
  assert.strictEqual(later.said, "Signed in as bob@acme.com. We'll send your request to use Acme's Evalation credits to jane@acme.com shortly. You'll be asked which company this is for next time you sign in.");
  const machineWaiting = await signedIn(done({ state: "machine-awaiting-approval", organisation: "Acme", owner: OWNER }));
  const machineLater = JSON.parse((await machineWaiting.company("--later")).stdout);
  machineWaiting.server.held.close();
  assert.strictEqual(machineLater.said, "Signed in as bob@acme.com. We'll ask jane@acme.com to approve this machine shortly. You'll be asked which company this is for next time you sign in.");
  const personal = await signedIn(done(null));
  const nothing = JSON.parse((await personal.company("--later")).stdout);
  personal.server.held.close();
  assert.deepStrictEqual(nothing, {});
});

test("a company name that is empty or too long is refused before it is sent, so the question can be asked again", async () => {
  const { company, server } = await signedIn(done(WAITING));
  const blank = await company("   ");
  assert.strictEqual(blank.code, 3);
  assert.strictEqual(JSON.parse(blank.stdout).kind, "unanswered");
  const long = await company("x".repeat(121));
  assert.strictEqual(long.code, 1);
  assert.match(long.stderr, /^company-unusable: /);
  server.held.close();
  assert.ok(!server.asked.some((one) => one.path === "/activate/company"));
  assert.strictEqual(say(LINES, "ev-activate.company-unusable"), "Type a company name of up to 120 characters.");
});

test("a sign-in with an address its provider did not confirm says, once the company is answered, that it stays an account of its own", async () => {
  const unverified = { state: "personal", reason: "unverified-address" };
  const google = await signedIn(done(unverified, "acme.com"), () => [200, { company: "acme.com", request: null }]);
  const fromGoogle = JSON.parse((await google.company("acme.com")).stdout);
  google.server.held.close();
  assert.strictEqual(fromGoogle.approval, "unverified-address");
  assert.strictEqual(fromGoogle.said, "Signed in as bob@acme.com. Google hasn't confirmed this address is yours, so you can't use your organisation's Evalation credits. Confirm the address in your Google account, then run /ev-remove and /ev-activate.");
  const microsoft = await signedIn(done(unverified, "acme.com"), () => [200, { company: "acme.com", request: null }], "microsoft");
  const fromMicrosoft = JSON.parse((await microsoft.company("--later")).stdout);
  microsoft.server.held.close();
  assert.strictEqual(fromMicrosoft.said, "Signed in as bob@acme.com. Microsoft hasn't confirmed this address is yours, so you can't use your organisation's Evalation credits. Email support@evalation.ai and we'll help.");
});

test("the sign-in command asks the company question, sends the answer, and shows what it says in place of the ready lines", () => {
  const text = command("ev-activate.md");
  assert.match(text, /Where it prints `question`, ask it with AskUserQuestion/);
  assert.match(text, /`evalation-activate company "<answer>"`/);
  assert.match(text, /`evalation-activate company --later`/);
  assert.match(text, /`company-unusable`[^`]*`evalation-say ev-activate\.company-unusable`/);
  assert.match(text, /Where it prints `said`, show it exactly as printed in place of the lines below, and stop\./);
  assert.match(command("ev-start.md"), /Where it showed its `said` line, about the person's organisation approving them, stop\./);
});
