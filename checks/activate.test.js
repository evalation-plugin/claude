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

const ACTIVATE = join(__dirname, "..", "bin", "evalation-activate");
const COMMAND = readFileSync(join(__dirname, "..", "commands", "ev-activate.md"), "utf8");

function signIn(answer, env = {}) {
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
      const child = spawn(process.execPath, [ACTIVATE, "google"], { env: { ...process.env,
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

test("the sign-in command text says what it can keep true on every machine, and answers every line the script prints", () => {
  const flat = COMMAND.replace(/\s+/g, " ");
  assert.doesNotMatch(flat, /kept in this machine's password store/);
  assert.match(flat, /`sign-in-unclear`[^`]*"[^"]*nothing was changed[^"]*"/);
  assert.match(flat, /Never mention keys, installations or digital signatures to them\./);
  assert.match(flat, /"Which account will you sign in with now\? This machine stays signed in with the account you choose\."/);
  assert.match(flat, /"Which account will you sign in with\? This machine stays signed in with the account you choose\."/);
  assert.doesNotMatch(flat, /"Sign in again\?"/);
  assert.match(flat, /`state: not-set-up`: go on to step 2/);
});

test("the sign-in command text shows the address at once, hears the person during the wait, and words every line the same way each run", () => {
  const flat = COMMAND.replace(/\s+/g, " ");
  assert.match(flat, /`sign-in address:`/);
  assert.match(flat, /"No browser opened, so open this address to sign in:"/);
  assert.match(flat, /"A browser should now show the sign-in page\. If it does not, open this address:"/);
  assert.match(flat, /"It waits up to five minutes\. If the page shows an error in place of a sign-in page, tell me what it says\."/);
  assert.match(flat, /Where their message says what the browser showed/);
  assert.doesNotMatch(flat, /press Esc/);
  assert.match(flat, /`state: live` or `state: unreachable`: say "This machine is already signed in to Evalation\."/);
  assert.match(flat, /`state: not-live`: run `\/ev-account` and say nothing of your own/);
  assert.match(flat, /"This machine needs to sign in to Evalation again\. Your pack credits and reports are kept\."/);
  assert.match(flat, /`unreachable`[^`]*"Evalation could not be reached, so nothing was created\. Check this machine is online, then run \/ev-activate again\. If it still fails, contact support@evalation\.ai\."/);
  assert.match(flat, /"That way to sign in is not offered yet\."/);
  assert.doesNotMatch(flat, /answers "Google"/);
  for (const label of ["Sign in with Google", "Sign in with Microsoft"]) {
    assert.strictEqual(flat.split(`"${label}", described as`).length - 1, 2, label);
  }
  assert.match(flat, /"Stop for now", described as/);
  assert.match(flat, /header "Sign in"/);
  assert.match(flat, /"To use Evalation on another computer, sign in there with the same account\. It costs nothing extra\."/);
  assert.ok(flat.includes("Your sign-in stays on this machine, and only your login on this computer can use it."));
  assert.doesNotMatch(flat, /password store(?! \(Keychain on a Mac\))(?! Evalation can use)/);
});

test("the sign-in address is printed before the wait, even where a browser opens", async (t) => {
  if (process.platform === "win32") return t.skip("the opener here is a shell script");
  const bin = mkdtempSync(join(tmpdir(), "evalation-browser-"));
  const opener = join(bin, process.platform === "darwin" ? "open" : "xdg-open");
  writeFileSync(opener, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  const ran = await signIn(() => [200, { authorization_url: "http://127.0.0.1:1/signin", state: "s" }],
    { PATH: `${bin}:/usr/bin:/bin`, EVALATION_LOOPBACK_TIMEOUT_MS: "300" });
  const at = ran.stderr.indexOf("sign-in address: http://127.0.0.1:1/signin\n");
  assert.ok(at >= 0, ran.stderr);
  assert.ok(at < ran.stderr.indexOf(WAITING), ran.stderr);
  assert.doesNotMatch(ran.stderr, /could not open a browser/);
});

test("while it waits, the script says so once and leaves the Esc line to the session", () => {
  assert.strictEqual(WAITING, "Waiting for you to finish signing in, for up to five minutes.\n");
  assert.deepStrictEqual(held(WAITING), []);
});

test("a sign-in left unfinished reports its own timeout line and no helper's name", async () => {
  const ran = await signIn(() => [200, { authorization_url: "http://127.0.0.1:1/signin", state: "s" }], { EVALATION_LOOPBACK_TIMEOUT_MS: "300" });
  assert.strictEqual(ran.status, 1);
  assert.doesNotMatch(ran.stderr, /evalation-loopback/);
  assert.match(ran.stderr, /^timed-out: the sign-in was not finished within five minutes, so nothing was activated$/m);
});

test("a refused start stops the listener, so a quick retry finds no port still held", async () => {
  const ran = await signIn(() => [500, { refusals: [{ observed: "down" }] }], { EVALATION_LOOPBACK_TIMEOUT_MS: "30000" });
  assert.match(ran.stderr, /^refused 500: down$/m);
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
  assert.ok(COMMAND.indexOf("bin/evalation-status") < COMMAND.indexOf("Which account will you sign in with?"));
  assert.match(COMMAND, /`run_in_background`/);
  assert.doesNotMatch(COMMAND, /360000/);
  assert.match(COMMAND, /`timed-out`/);
  assert.match(COMMAND, /`stopped`/);
  assert.doesNotMatch(COMMAND, /which account and how many/);
});
