"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const { connect } = require("node:net");
const { mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { held } = require("../lib/prose.js");
const { WAITING } = require("../bin/evalation-activate");
const { entries } = require("../lib/say.js");

const ACTIVATE = join(__dirname, "..", "bin", "evalation-activate");
const COMMAND = readFileSync(join(__dirname, "..", "commands", "ev-activate.md"), "utf8");

function signIn(answer, env = {}, args = ["google"]) {
  return new Promise((resolve) => {
    const asked = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        asked.push(JSON.parse(body));
        const [status, reply] = answer(req.url);
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify(reply));
      });
    }).listen(0, "127.0.0.1", () => {
      const home = mkdtempSync(join(tmpdir(), "evalation-activate-"));
      const child = spawn(process.execPath, [ACTIVATE, ...args], { env: { ...process.env,
        PATH: mkdtempSync(join(tmpdir(), "evalation-no-browser-")), EVALATION_PLUGIN_HOME: home,
        EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
        EVALATION_SERVER: `http://127.0.0.1:${server.address().port}`, ...env } });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", (status) => server.close(() => resolve({ status, stderr, asked })));
    });
  });
}

function refusedAt(port) {
  return new Promise((resolve) => {
    const socket = connect(port, "127.0.0.1");
    socket.on("connect", () => { socket.destroy(); resolve(false); });
    socket.on("error", () => resolve(true));
  });
}

function signedInHome({ keyThere }) {
  const { mkdirSync } = require("node:fs");
  const home = mkdtempSync(join(tmpdir(), "evalation-signed-in-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  if (keyThere) writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), Buffer.alloc(32, 7).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ schema: "evalation.local.v1", installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

test("a machine already signed in is told so in plain words and sent to /ev-account, with no promise of an account name", () => {
  const home = signedInHome({ keyThere: true });
  const ran = spawnSync(process.execPath, [ACTIVATE, "google"], { env: { ...process.env, EVALATION_PLUGIN_HOME: home,
    EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file" }, encoding: "utf8" });
  assert.strictEqual(ran.status, 1);
  assert.strictEqual(ran.stderr, "already-activated: this machine is already signed in to Evalation. Run /ev-account to see its pack credits.\n");
});

test("settings whose sign-in key is gone count as damaged, and signing in again replaces them", async () => {
  const home = signedInHome({ keyThere: false });
  const ran = await signIn(() => [400, { refusals: [{ observed: "stopped here by the check" }] }],
    { EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local") });
  assert.doesNotMatch(ran.stderr, /already-activated/);
  assert.ok(ran.asked.length > 0, "the sign-in went ahead and asked the server to start");
});

test("settings naming no installation, or a sign-in key of the wrong size, count as damaged too", async () => {
  for (const damage of ["no-installation", "wrong-size"]) {
    const home = signedInHome({ keyThere: true });
    const settings = JSON.parse(readFileSync(join(home, "evalation.local"), "utf8"));
    if (damage === "no-installation") delete settings.installation;
    else writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), Buffer.alloc(16, 7).toString("base64"), { mode: 0o600 });
    writeFileSync(join(home, "evalation.local"), JSON.stringify(settings));
    const ran = await signIn(() => [400, { refusals: [{ observed: "stopped here by the check" }] }],
      { EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local") });
    assert.doesNotMatch(ran.stderr, /already-activated/, damage);
  }
});

const LINES = entries();
const FLAT = COMMAND.replace(/\s+/g, " ");
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function line(marker) {
  const at = FLAT.match(new RegExp(`${escaped(marker)}[^\`]*\`evalation-say ([a-z0-9.-]+)`));
  assert.ok(at, `${marker} names a line from the catalogue`);
  assert.ok(LINES[at[1]], `${at[1]} is a line the plugin holds`);
  return LINES[at[1]];
}

const PROVIDERS = ["Google, including Google Workspace work accounts", "Microsoft, personal or work accounts"];
const answers = (one) => one.options.map((each) => [each.label, each.description]);

test("the sign-in command text says what it can keep true on every machine, and answers every line the script prints", () => {
  assert.doesNotMatch(FLAT, /kept in this machine's password store/);
  assert.match(line("`sign-in-unclear`").say, /nothing was changed/);
  assert.match(FLAT, /Never mention keys, installations or digital signatures to them\./);
  const which = "Which account will you sign in with? This machine stays signed in with the account you choose.";
  const now = "Which account will you sign in with now? This machine stays signed in with the account you choose.";
  const google = ["Sign in with Google", PROVIDERS[0]];
  const microsoft = ["Sign in with Microsoft", PROVIDERS[1]];
  const stop = ["Stop for now", "Leave this machine signed out. Nothing was created."];
  assert.deepStrictEqual([line("Ask which provider").ask, answers(line("Ask which provider"))], [which, [google, microsoft]]);
  assert.deepStrictEqual([line("offer Microsoft first").ask, answers(line("offer Microsoft first"))], [which, [microsoft, google]]);
  assert.deepStrictEqual([line("Google was not the one declined").ask, answers(line("Google was not the one declined"))], [now, [google, microsoft, stop]]);
  assert.deepStrictEqual([line("Microsoft was not the one declined").ask, answers(line("Microsoft was not the one declined"))], [now, [microsoft, google, stop]]);
  assert.doesNotMatch(FLAT, /Sign in again\?/);
  assert.match(FLAT, /`state: not-set-up`: go on to step 2/);
});

test("the sign-in command text shows the address at once, hears the person during the wait, and words every line the same way each run", () => {
  assert.match(FLAT, /`sign-in address:`/);
  assert.strictEqual(line("`could not open a browser`").say, "No browser opened, so open this address to sign in:");
  assert.strictEqual(line("where no such line follows").say, "A browser should now show the sign-in page. If it does not, open this address:");
  assert.strictEqual(line("wait for it to end").say, "It waits up to five minutes. If the page shows an error in place of a sign-in page, tell me what it says.");
  assert.match(FLAT, /Where they write while it waits/);
  assert.doesNotMatch(FLAT, /press Esc/);
  assert.strictEqual(line("`state: live` or `state: unreachable`").say, "This machine is already signed in to Evalation. To sign in with a different account, run /ev-remove, then /ev-activate.");
  assert.match(FLAT, /`state: not-live`: run `\/ev-account` and say nothing of your own/);
  assert.strictEqual(line("`sign-in: damaged`").say, "This machine needs to sign in to Evalation again. Sign in with the same account as before, so your pack credits are there.");
  assert.strictEqual(line("names the account").say, "This machine needs to sign in to Evalation again. Sign in with <email>, the same account as before, so your pack credits are there.");
  assert.strictEqual(line("**`unreachable`**").say, "Evalation could not be reached, so nothing was created. Check this machine is online, then run /ev-activate again. If it still fails, contact support@evalation.ai.");
  assert.strictEqual(line("any other way to sign in").say, "That way to sign in is not offered yet.");
  assert.deepStrictEqual(line("beside the question").say, "Other ways to sign in are not offered yet. If you have neither account, contact support@evalation.ai.");
  assert.deepStrictEqual(answers(line("**`stopped`**")).map((one) => one[0]), ["Sign in again", "Stop for now"]);
  const asked = Object.entries(LINES).filter(([name, one]) => name.startsWith("ev-activate.") && one.ask);
  assert.ok(asked.length >= 5);
  assert.deepStrictEqual(asked.filter(([, one]) => one.header !== "Sign in").map(([name]) => name), []);
  assert.strictEqual(line("Then show").say, "To use Evalation on another computer, sign in there with the same account. It costs nothing extra.");
  assert.ok(line("Say what signing in is").say.includes("Your sign-in stays on this machine, and only your login on this computer can use it."));
  const words = [FLAT, ...Object.entries(LINES).filter(([name]) => name.startsWith("ev-activate.")).map(([, one]) => JSON.stringify(one))].join(" ");
  assert.doesNotMatch(words, /password store(?! \(Keychain on a Mac\))(?! Evalation can use)/);
});

test("a retry reorders the providers only after the provider said no, and never repeats the earlier line", () => {
  const rule = FLAT.match(/offer Microsoft first only where[^.]*\./i);
  assert.ok(rule, "the command says when Microsoft goes first");
  for (const prefix of ["`sign-in-refused`", "`refused`", "`refused-unrecognised`", "`no-code`"]) assert.ok(rule[0].includes(prefix), prefix);
  for (const prefix of ["`unreachable`", "`no-listener`", "`no-key-store`", "`timed-out`", "`server-error`", "`fault`"]) assert.ok(!rule[0].includes(prefix), prefix);
  assert.strictEqual(line("Where the provider has already said no").say, "Signing in with <provider> did not work last time.");
  assert.doesNotMatch(FLAT, /as `reason`/);
});

test("words typed about the browser are matched to fixed lines, and nothing sends the session to compose a reply", () => {
  assert.doesNotMatch(FLAT, /act on (it|that|what they type)/);
  assert.ok(!LINES["ev-activate.type-browser"]);
  assert.match(line("they declined").say, /^The sign-in was declined/);
  assert.match(line("an error page").say, /showed an error/);
  assert.match(line("nothing happened").say, /open this address/);
  assert.ok(!LINES["ev-activate.something-else"], "no line ends a sign-in over a message that did not describe the page");
  assert.match(line("say they finished").say, /still waiting/);
  assert.match(line("which account to use").say, /same account/);
  const waits = FLAT.slice(FLAT.indexOf("Where they write while it waits"), FLAT.indexOf("6. **"));
  assert.match(waits, /Only a decline, an error the page showed or a request to stop ends the sign-in\./);
  assert.doesNotMatch(waits, /ask `evalation-say ev-activate\.stopped`/, "a person who asked to stop is not asked whether to stop");
  assert.strictEqual(line("they ask to stop").say, "Nothing was created. Run /ev-activate when you are ready to sign in.");
  assert.doesNotMatch(FLAT, /name a redirect or a reply URL/);
  assert.match(line("**`fault`**").say, /fault on our side/);
  assert.match(line("**`server-error`**").say, /support@evalation\.ai/);
  assert.doesNotMatch(line("**`refused`**").say, /<reason>/);
  assert.match(line("**`refused-unrecognised`**").say, /support@evalation\.ai/);
  assert.doesNotMatch(line("**`refused-unrecognised`**").say, /<|try again/);
});

test("the lines said once are said once per conversation, known from what this conversation already shows", () => {
  assert.match(FLAT, /Say what signing in is\*\*, once per conversation/);
  assert.match(FLAT, /once per conversation, beside the question, `evalation-say ev-activate\.other-ways`/);
  assert.match(FLAT, /already appears earlier in this conversation/);
});

test("the sign-in address is printed before the wait, even where a browser opens", async (t) => {
  if (process.platform === "win32") return t.skip("the opener here is a shell script");
  const bin = mkdtempSync(join(tmpdir(), "evalation-browser-"));
  const opener = join(bin, process.platform === "darwin" ? "open" : "xdg-open");
  writeFileSync(opener, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const ran = await signIn(() => [200, { authorization_url: "https://127.0.0.1:1/signin", state: "s" }],
    { PATH: `${bin}:/usr/bin:/bin`, EVALATION_LOOPBACK_TIMEOUT_MS: "300" });
  const at = ran.stderr.indexOf("sign-in address: https://127.0.0.1:1/signin\n");
  assert.ok(at >= 0, ran.stderr);
  assert.ok(at < ran.stderr.indexOf(WAITING), ran.stderr);
  assert.doesNotMatch(ran.stderr, /could not open a browser/);
});

test("while it waits, the script says so once and leaves the Esc line to the session", () => {
  assert.strictEqual(WAITING, "Waiting for you to finish signing in, for up to five minutes.\n");
  assert.deepStrictEqual(held(WAITING), []);
});

test("a sign-in left unfinished reports its own timeout line and no helper's name", async () => {
  const ran = await signIn(() => [200, { authorization_url: "https://127.0.0.1:1/signin", state: "s" }], { EVALATION_LOOPBACK_TIMEOUT_MS: "300" });
  assert.strictEqual(ran.status, 1);
  assert.doesNotMatch(ran.stderr, /evalation-loopback/);
  assert.match(ran.stderr, /^timed-out: the sign-in was not finished within five minutes, so nothing was activated$/m);
});

test("a refusal is mapped to a kind the command has a line for, and the server's own words show only when the reason is asked for", async () => {
  const told = async (status, reply, args) => (await signIn(() => [status, reply], {}, args)).stderr.trim();
  const cases = [
    [403, { refusals: [{ observed: "This account is not allowed to sign in.", required: "an account on the allow list | policy 7" }] }, "refused-unrecognised"],
    [403, { refusals: [{ observed: "invalid_grant", required: "a fresh code" }] }, "refused-unrecognised"],
    [403, "<html>Forbidden</html>", "refused-unrecognised"],
    [400, { refusals: [{ observed: "redirect_uri_mismatch" }] }, "fault"],
    [400, { refusals: [{ observed: "AADSTS50011: The reply URL specified in the request does not match" }] }, "fault"],
    [400, { refusals: [{ observed: "this deployment answers for no provider called google" }] }, "fault"],
    [400, { refusals: [{ observed: "the challenge is too short to be one" }] }, "fault"],
    [400, { refusals: [{ observed: "the provider would not exchange the code: 400 Bad Request, and said {\"error\":\"invalid_grant\"}" }] }, "refused"],
    [400, { refusals: [{ observed: "the token does not carry the nonce this sign-in asked for" }] }, "refused"],
    [400, { refusals: [{ observed: "this sign-in is unknown, already finished, or older than its window" }] }, "refused"],
  ];
  for (const [status, reply, kind] of cases) {
    const said = await told(status, reply);
    assert.strictEqual(said.split(":")[0], kind, said);
    assert.strictEqual(said.split("\n").length, 1, said);
    assert.doesNotMatch(said, /allow list|invalid_grant|Forbidden|redirect_uri|AADSTS|no provider called|challenge|nonce|400|window/, said);
  }
  assert.match(await told(503, { refusals: [{ observed: "down" }] }), /^server-error: /);
  assert.match(await told(400, { refusals: [{ observed: "the token does not carry the nonce this sign-in asked for" }] }, ["google", "--reason"]), /^detail: .*nonce/m);
});

test("a start answer with no https sign-in address fails as unreadable, before any browser or wait", async () => {
  for (const reply of [{ state: "s" }, { authorization_url: "file:///etc/passwd", state: "s" }, { authorization_url: "https://example.com/signin" }]) {
    const ran = await signIn(() => [200, reply], { EVALATION_LOOPBACK_TIMEOUT_MS: "300" });
    assert.strictEqual(ran.status, 1);
    assert.match(ran.stderr, /^unreadable answer/m, ran.stderr);
    assert.doesNotMatch(ran.stderr, /undefined|sign-in address:|could not open a browser/);
    assert.ok(!ran.stderr.includes(WAITING), ran.stderr);
  }
});

test("a refused start stops the listener, so a quick retry finds no port still held", async () => {
  const ran = await signIn(() => [403, { refusals: [{ observed: "down" }] }], { EVALATION_LOOPBACK_TIMEOUT_MS: "30000" });
  assert.match(ran.stderr, /^refused-unrecognised: /m);
  const port = Number(new URL(ran.asked[0].redirect_uri).port);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.strictEqual(await refusedAt(port), true);
});

test("a machine with nowhere to keep a key is told the folder this machine really uses", () => {
  const home = join(mkdtempSync(join(tmpdir(), "evalation-no-store-")), "home");
  writeFileSync(home, "a file where a folder should be");
  const ran = spawnSync(process.execPath, [ACTIVATE, "google"], { encoding: "utf8", env: { ...process.env,
    EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(tmpdir(), "evalation-no-such-settings"), EVALATION_KEY_STORE: "file" } });
  assert.strictEqual(ran.status, 1);
  assert.match(ran.stderr, /^no-key-store:/);
  assert.ok(ran.stderr.includes(join(home, "keys")), ran.stderr);
  assert.doesNotMatch(ran.stderr, /~\/\.evalation-plugin/);
});

test("the sign-in command text checks the machine first, waits in the background, and tells a stop apart from the timeout", () => {
  assert.ok(COMMAND.indexOf("evalation-status") < COMMAND.indexOf("evalation-say ev-activate.provider"));
  assert.ok(COMMAND.indexOf("evalation-say ev-activate.provider") > 0);
  assert.match(COMMAND, /`run_in_background`/);
  assert.doesNotMatch(COMMAND, /360000/);
  assert.match(COMMAND, /`timed-out`/);
  assert.match(COMMAND, /`stopped`/);
  assert.doesNotMatch(COMMAND, /which account and how many/);
});

test("the browser page after a sign-in says a catalogue line, never the provider's code", async () => {
  const page = (query) => new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-loopback")]);
    child.stdout.once("data", (chunk) => {
      const port = String(chunk).match(/port=(\d+)/)[1];
      fetch(`http://127.0.0.1:${port}/callback?${query}`).then((got) => got.text()).then((html) => { child.kill(); resolve(html); });
    });
  });
  const lines = entries();
  const declined = await page("error=access_denied&state=s");
  assert.doesNotMatch(declined, /access_denied/);
  assert.ok(declined.includes(lines["ev-activate.page-declined"].say.replace(/'/g, "&#39;")) || declined.includes(lines["ev-activate.page-declined"].say));
  assert.ok((await page("code=c&state=s")).includes(lines["ev-activate.page-received"].say));
});
