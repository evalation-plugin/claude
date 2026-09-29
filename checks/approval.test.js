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
  "awaiting-approval": { observed: `your request to join Acme went to its owner, ${OWNER}, and is waiting for approval`,
    required: `ask ${OWNER} to approve it from the email they were sent, since this machine runs nothing and spends nothing until then` },
  declined: { observed: "your request to join Acme was declined", required: `ask the owner, ${OWNER}, if this is a mistake, since only the owner or an admin can let you in` },
  removed: { observed: "you were removed from Acme, so this machine no longer draws on its credits", required: `ask the owner, ${OWNER}, if this is a mistake` },
};
const SUFFIX = { "awaiting-approval": "awaiting", declined: "declined", removed: "removed" };
const refusal = (kind, owner = OWNER) => ({ refusals: [{ at: "membership", ...REFUSED[kind], failure: kind, ...(owner === null ? {} : { owner }) }] });

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
  const held = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      asked.push({ path: req.url, body: body ? JSON.parse(body) : null });
      const [code, reply] = answer(req.url, body ? JSON.parse(body) : null);
      res.writeHead(code, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify(reply));
    });
  });
  held.unref();
  return new Promise((resolve) => held.listen(0, "127.0.0.1", () => resolve({ held, asked, base: `http://127.0.0.1:${held.address().port}` })));
}

function ran(script, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(BIN, script), ...args], { env: { ...process.env, EVALATION_KEY_STORE: "file", ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

const on = (home, base) => ({ EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_SERVER: base });

test("a refusal of each approval kind is read from its failure and owner fields, and anything else is not one", () => {
  const { approvalOf } = require("../lib/approval.js");
  for (const kind of Object.keys(REFUSED)) {
    assert.deepStrictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal(kind))}`), { kind, owner: OWNER, line: SUFFIX[kind] });
    assert.deepStrictEqual(approvalOf(`refused: refused 403: ${JSON.stringify(refusal(kind))}`), { kind, owner: OWNER, line: SUFFIX[kind] });
  }
  assert.strictEqual(approvalOf(`refused 401: ${JSON.stringify(refusal("declined"))}`), null);
  assert.strictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal("declined", null))}`), null);
  assert.strictEqual(approvalOf(`refused 403: ${JSON.stringify(refusal("declined", "jane@acme.com\nstate: live"))}`), null);
  assert.strictEqual(approvalOf(`refused 403: ${JSON.stringify({ refusals: [{ observed: "declined", failure: "not-operator", owner: OWNER }] })}`), null);
  assert.strictEqual(approvalOf("refused 403: <html>Forbidden</html>"), null);
  assert.strictEqual(approvalOf("unreachable: http://127.0.0.1:9/pin (fetch failed)"), null);
});

test("the account check names each approval state and the owner's address, as the server sent it", async () => {
  for (const kind of Object.keys(REFUSED)) {
    const { held, base } = await standIn(() => [403, refusal(kind)]);
    const said = await ran("evalation-status", [], on(machine(), base));
    held.close();
    assert.strictEqual(said.code, 0, said.stderr);
    assert.strictEqual(said.stdout, `state: not-live\nsigned in as: bob@acme.com\nreason: ${kind}\nowner: ${OWNER}\n`);
  }
  const { held, base } = await standIn(() => [403, refusal("declined", null)]);
  const unnamed = await ran("evalation-status", [], on(machine(), base));
  held.close();
  assert.strictEqual(unnamed.stdout, "state: not-live\nsigned in as: bob@acme.com\nreason: other\n");
});

test("every command that checks the account shows the approval line for each state, with the owner's address", () => {
  for (const file of ["ev-account.md", "ev-start.md", "ev-packs.md"]) {
    const text = command(file);
    for (const kind of Object.keys(REFUSED)) {
      const found = text.match(new RegExp(`\`reason: ${kind}\`[^\`]*\`evalation-say (ev-account\\.${SUFFIX[kind]}) owner=<owner>\``));
      assert.ok(found, `${file} shows a line for reason ${kind}, passing the owner line's address`);
      assert.match(LINES[found[1]].say, /<owner>/);
    }
    assert.match(text, /`owner:` line/, file);
  }
  const remove = command("ev-remove.md");
  assert.match(remove, /`state: live`, or `state: not-live` for any other reason: go on/);
});

test("the account lines say what happened and what to do, in the owner's words", () => {
  const line = (name) => say(LINES, name, { owner: OWNER });
  assert.strictEqual(line("ev-account.awaiting"), "Your request to use your organisation's Evalation credits went to jane@acme.com. You can run Evalation once they approve you.");
  assert.strictEqual(line("ev-account.declined"), "Your organisation declined your request to use its Evalation credits, so you can't run Evalation. If you think that's a mistake, ask its owner, jane@acme.com.");
  assert.strictEqual(line("ev-account.removed"), "Your organisation removed you, so you can't use its Evalation credits any more. If you think that's a mistake, ask its owner, jane@acme.com.");
});

test("a run refused for approval says so in one catalogue line naming the owner, at the start and before it", async () => {
  const tree = repository();
  const run = {
    "awaiting-approval": "The run didn't start, because jane@acme.com hasn't approved your request to use your organisation's Evalation credits yet. No pack credits were used. You can run Evalation once they approve you.\n",
    declined: "The run didn't start, because your organisation declined your request to use its Evalation credits. No pack credits were used. If you think that's a mistake, ask its owner, jane@acme.com.\n",
    removed: "The run didn't start, because your organisation removed you and you can't use its Evalation credits any more. No pack credits were used. If you think that's a mistake, ask its owner, jane@acme.com.\n",
  };
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

function signingIn(complete, pin = () => [200, { revision: "1.86" }], provider = "google") {
  return new Promise((resolve) => {
    let back = null;
    standIn((path, body) => {
      if (path === "/activate/start") {
        back = body.redirect_uri;
        return [200, { state: "S", authorization_url: "https://example.test/signin" }];
      }
      if (path === "/activate/complete") return complete(body);
      return pin(path);
    }).then(({ held, asked, base }) => {
      const home = mkdtempSync(join(tmpdir(), "evalation-approval-sign-in-"));
      const child = spawn(process.execPath, [join(BIN, "evalation-activate"), provider], { env: { ...process.env,
        PATH: mkdtempSync(join(tmpdir(), "evalation-no-browser-")), EVALATION_KEY_STORE: "file", ...on(home, base) } });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (back && /Waiting for you/.test(stderr)) {
          const to = back;
          back = null;
          fetch(`${to}?code=c&state=S`).catch(() => {});
        }
      });
      child.on("exit", (code) => held.close(() => resolve({ code, stdout, stderr, asked })));
    });
  });
}

const done = (membership) => (body) => [200, { installation: body.installation, email: "bob@acme.com", ...(membership === undefined ? {} : { membership }) }];

test("a sign-in that sent a request says who it went to, and that Evalation runs once they approve", async () => {
  const signed = await signingIn(done({ state: "waiting", organisation: "Acme", owner: OWNER }));
  assert.strictEqual(signed.code, 0, signed.stderr);
  const out = JSON.parse(signed.stdout);
  assert.strictEqual(out.approval, "awaiting-approval");
  assert.strictEqual(out.said, "Signed in as bob@acme.com. Your request to use Acme's Evalation credits went to jane@acme.com. You can run Evalation once they approve you.");
  assert.ok(!signed.asked.some((one) => one.path === "/pin"), "the answer already said where the person stands");
});

test("a sign-in by someone already waiting, declined or removed learns it from the account check that follows", async () => {
  for (const kind of Object.keys(REFUSED)) {
    const signed = await signingIn(done(), () => [403, refusal(kind)]);
    assert.strictEqual(signed.code, 0, signed.stderr);
    const out = JSON.parse(signed.stdout);
    assert.strictEqual(out.approval, kind);
    assert.strictEqual(out.said, `Signed in as bob@acme.com. ${say(LINES, `ev-account.${SUFFIX[kind]}`, { owner: OWNER })}`);
  }
  const plain = await signingIn(done(null));
  const out = JSON.parse(plain.stdout);
  assert.strictEqual(out.approval, undefined);
  assert.strictEqual(out.said, undefined);
  assert.strictEqual(out.signed_in_as, "bob@acme.com");
});

test("a sign-in with an address its provider did not confirm says it stays an account of its own, and what to do", async () => {
  const google = JSON.parse((await signingIn(done({ state: "personal", reason: "unverified-address" }))).stdout);
  assert.strictEqual(google.approval, "unverified-address");
  assert.strictEqual(google.said, "Signed in as bob@acme.com. Google hasn't confirmed this address is yours, so you're signed in on an account of your own and can't use your organisation's Evalation credits. To use them, confirm the address in your Google account, then run /ev-remove and /ev-activate to sign in again.");
  const microsoft = JSON.parse((await signingIn(done({ state: "personal", reason: "unverified-address" }), undefined, "microsoft")).stdout);
  assert.strictEqual(microsoft.said, "Signed in as bob@acme.com. Microsoft hasn't confirmed this address is yours, so you're signed in on an account of your own and can't use your organisation's Evalation credits. Email support@evalation.ai and we'll help you use them.");
});

test("a sign-in the server could not email about fails with its own kind, and the command has a line for it", async () => {
  const signed = await signingIn(() => [503, { refusals: [{ at: "approval", observed: "RESEND_API_KEY is not set, so no approval email can be sent",
    required: "tell support@evalation.ai, then sign in again once they say it is fixed, since nothing was created", failure: "approval-unavailable" }] }]);
  assert.strictEqual(signed.code, 1);
  assert.match(signed.stderr, /\napproval-unavailable: [^\n]*\n$/);
  assert.doesNotMatch(signed.stderr, /RESEND|server-error/);
  const text = command("ev-activate.md");
  const found = text.match(/`approval-unavailable`[^`]*`evalation-say (ev-activate\.[a-z-]+)`/);
  assert.ok(found, "ev-activate.md names a line for approval-unavailable");
  assert.strictEqual(LINES[found[1]].say, "Evalation couldn't send the email asking your organisation to approve you, so nothing was created. Email support@evalation.ai, then run /ev-activate again once we've fixed it.");
});

test("the sign-in command shows the approval line in place of the ready lines and stops, and setting up stops with it", () => {
  const text = command("ev-activate.md");
  assert.match(text, /Where it prints `said`, show it exactly as printed in place of the lines below, and stop\./);
  assert.match(command("ev-start.md"), /Where it showed its `said` line, about the person's organisation approving them, stop\./);
});
