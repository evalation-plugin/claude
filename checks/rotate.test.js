"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { createPrivateKey, createPublicKey, randomBytes } = require("node:crypto");
require("./fixture.js");

const { entries } = require("../lib/say.js");

const COMMAND = readFileSync(join(__dirname, "..", "commands", "ev-rotate.md"), "utf8");
const LINES = entries();
const said = (name) => `${LINES[name].say}\n`;
const FLAT = COMMAND.replace(/\s+/g, " ");
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function line(marker, text = FLAT) {
  const at = text.match(new RegExp(`${escaped(marker)}[^\`]*\`evalation-say ([a-z0-9.-]+)`));
  assert.ok(at, `${marker} names a line from the catalogue`);
  assert.ok(LINES[at[1]], `${at[1]} is a line the plugin holds`);
  return LINES[at[1]].say;
}

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-rotate-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), randomBytes(32).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "keys", "evalation-plugin.box.receiving-key"), randomBytes(32).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ schema: "evalation.local.v1", installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

const key = (home, account) => join(home, "keys", `evalation-plugin.box.${account}`);

function publicOf(raw) {
  const der = Buffer.concat([Buffer.from("302e020100300506032b656e04220420", "hex"), Buffer.from(raw, "base64")]);
  const pub = createPublicKey(createPrivateKey({ key: der, format: "der", type: "pkcs8" })).export({ type: "spki", format: "der" });
  return [...pub.subarray(pub.length - 32)];
}

const healthy = (req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(req.url === "/packs" ? { packs: [{ pack: "soc2" }], revision: 7 } : { previous_until: "2026-09-29T14:02:00Z" }));
};

function rotated(home, answer = healthy) {
  return new Promise((resolve) => {
    const asked = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => {
        asked.push({ url: req.url, body: JSON.parse(body || "{}") });
        answer(req, res, asked.at(-1).body);
      });
    }).listen(0, "127.0.0.1", () => {
      const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-rotate")], { env: { ...process.env,
        EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
        EVALATION_SERVER: `http://127.0.0.1:${server.address().port}` } });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", (status) => server.close(() => resolve({ status, stdout, stderr, asked })));
    });
  });
}

test("a replaced key is reported in one plain line, with no pack count, revision or time", async () => {
  const ran = await rotated(machine());
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.strictEqual(ran.stdout, "Replaced this machine's key. The old key no longer works.\n");
  assert.strictEqual(ran.stdout, said("ev-rotate.replaced"));
  assert.strictEqual(ran.stderr, "");
});

const refusing = (url, status, observed) => (req, res, body) => {
  if (req.url !== url || body.confirmed) return healthy(req, res);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify({ refusals: [{ at: "installation box", observed, required: "see the server", failure: "not-live" }] }));
};

test("an offer the server refuses outright puts the old key back and says it still works", async () => {
  const home = machine();
  const before = readFileSync(key(home, "receiving-key"), "utf8");
  const ran = await rotated(home, refusing("/rotate", 422, "could not take it"));
  assert.strictEqual(ran.status, 1);
  assert.strictEqual(ran.stderr, said("ev-rotate.not-replaced-other"));
  assert.strictEqual(readFileSync(key(home, "receiving-key"), "utf8"), before);
  assert.strictEqual(existsSync(key(home, "receiving-key-previous")), false);
});

test("a proof that fails after the server took the new key keeps both keys and never says the old one works", async () => {
  const home = machine();
  const before = readFileSync(key(home, "receiving-key"), "utf8");
  const ran = await rotated(home, refusing("/packs", 500, "could not open"));
  assert.strictEqual(ran.status, 1);
  assert.strictEqual(ran.stderr, said("ev-rotate.not-finished-other"));
  assert.deepStrictEqual(publicOf(readFileSync(key(home, "receiving-key"), "utf8")), ran.asked[0].body.receiving_key);
  assert.strictEqual(readFileSync(key(home, "receiving-key-previous"), "utf8"), before);
});

test("a rerun after an unfinished change never writes the old key back over the new one", async () => {
  const home = machine();
  const before = readFileSync(key(home, "receiving-key"), "utf8");
  const cut = await rotated(home, (req, res, body) => (body.confirmed ? req.socket.destroy() : healthy(req, res)));
  assert.strictEqual(cut.stderr, said("ev-rotate.not-finished-unreachable"));
  const kept = readFileSync(key(home, "receiving-key"), "utf8");
  const again = await rotated(home, (req, res) => (req.url === "/packs" ? req.socket.destroy() : healthy(req, res)));
  assert.strictEqual(again.status, 1);
  assert.strictEqual(again.stderr, said("ev-rotate.not-finished-unreachable"));
  assert.doesNotMatch(again.stderr, /still works/);
  assert.strictEqual(readFileSync(key(home, "receiving-key"), "utf8"), kept);
  assert.strictEqual(readFileSync(key(home, "receiving-key-previous"), "utf8"), before);
});

test("an offer lost to the network keeps both keys, and the next run offers the same key again and finishes", async () => {
  const home = machine();
  const cut = await rotated(home, (req, res, body) => (req.url === "/rotate" && !body.confirmed ? req.socket.destroy() : healthy(req, res)));
  assert.strictEqual(cut.stderr, said("ev-rotate.not-finished-unreachable"));
  const sent = cut.asked[0].body.receiving_key;
  const again = await rotated(home);
  assert.strictEqual(again.status, 0, again.stderr);
  assert.deepStrictEqual(again.asked.map((one) => [one.url, one.body.confirmed]), [["/rotate", false], ["/packs", undefined], ["/rotate", true]]);
  assert.deepStrictEqual(again.asked[0].body.receiving_key, sent);
  assert.strictEqual(existsSync(key(home, "receiving-key-previous")), false);
});

test("a confirm lost to the network says so, and the next run finishes it with the key already sent", async () => {
  const home = machine();
  const cut = await rotated(home, (req, res, body) => (body.confirmed ? req.socket.destroy() : healthy(req, res)));
  assert.strictEqual(cut.status, 1);
  assert.strictEqual(cut.stderr, said("ev-rotate.not-finished-unreachable"));
  const sent = cut.asked[0].body.receiving_key;
  const kept = readFileSync(key(home, "receiving-key"), "utf8");

  const again = await rotated(home);
  assert.strictEqual(again.status, 0, again.stderr);
  assert.deepStrictEqual(again.asked.map((one) => [one.url, one.body.confirmed]), [["/rotate", false], ["/packs", undefined], ["/rotate", true]]);
  assert.deepStrictEqual(again.asked[2].body.receiving_key, sent);
  assert.deepStrictEqual(publicOf(kept), sent);
  assert.strictEqual(readFileSync(key(home, "receiving-key"), "utf8"), kept);
  assert.strictEqual(existsSync(key(home, "receiving-key-previous")), false);
});

test("a refusal is told apart by what the server said: the clock, a machine it no longer accepts, or access that ended", async () => {
  const cases = [
    [401, "the ask was made 400 seconds from now, and a proof holds for 300", "ev-rotate.not-replaced-clock"],
    [401, "the proof was made -900 seconds from now, which is outside the window", "ev-rotate.not-replaced-clock"],
    [401, "nothing we issued signed this, either because no installation answers to that name", "ev-account.refused"],
    [402, "the entitlement for this installation has ended, so nothing further can be served", "ev-account.ended"],
  ];
  for (const [status, observed, name] of cases) {
    const ran = await rotated(machine(), refusing("/rotate", status, observed));
    assert.strictEqual(ran.stderr, said(name), observed);
  }
});

test("a change Evalation refused or ended says only that, never that the old key works or that it may finish", async () => {
  for (const [url, status, observed, name] of [
    ["/rotate", 401, "nothing we issued signed this", "ev-account.refused"],
    ["/packs", 402, "the entitlement for this installation has ended", "ev-account.ended"],
    ["/packs", 401, "nothing we issued signed this", "ev-account.refused"],
  ]) {
    const ran = await rotated(machine(), refusing(url, status, observed));
    assert.strictEqual(ran.status, 1);
    assert.strictEqual(ran.stderr, said(name), `${url} ${status}`);
    assert.doesNotMatch(ran.stderr, /still works|did not finish/);
  }
});

test("every outcome is one line, and only a line for a key not replaced says the old key works", () => {
  const outcomes = Object.entries(LINES).filter(([name]) => /^ev-rotate\.not-(replaced|finished)-/.test(name));
  assert.ok(outcomes.length >= 7);
  for (const [name, one] of outcomes) {
    if (name.startsWith("ev-rotate.not-replaced-")) assert.match(one.say, /^The key was not replaced and the old one still works\. /, name);
    else assert.match(one.say, /^The key change did not finish\. Other Evalation commands on this machine may not work until it finishes\. /, name);
    assert.doesNotMatch(one.say, /\n/);
  }
  assert.ok(!LINES["ev-rotate.not-finished"] && !LINES["ev-rotate.not-finished-twice"], "no second line is added to an outcome");
});

test("the detail for support follows the line only when the reason is asked for", async () => {
  const home = machine();
  const server = await new Promise((resolve) => {
    const one = createServer((req, res) => refusing("/rotate", 422, "could not take it")(req, res, {})).listen(0, "127.0.0.1", () => resolve(one));
  });
  const ran = await new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-rotate"), "--reason"], { env: { ...process.env,
      EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
      EVALATION_SERVER: `http://127.0.0.1:${server.address().port}` } });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", () => server.close(() => resolve(stderr)));
  });
  const [first, ...rest] = ran.trim().split("\n");
  assert.strictEqual(`${first}\n`, said("ev-rotate.not-replaced-other"));
  assert.match(rest.join("\n"), /could not take it/);
});

test("what it prints names no server address, status code or internal term unless the reason is asked for", async () => {
  const ran = await rotated(machine(), refusing("/rotate", 401, "nothing we issued signed this"));
  assert.doesNotMatch(ran.stderr, /http|refused 4|installation|nothing we issued/);
});

test("a machine whose sign-in key is missing stops before anything is sent and is sent to sign in again", async () => {
  const home = machine();
  unlinkSync(key(home, "installation-key"));
  const ran = await rotated(home);
  assert.strictEqual(ran.status, 1);
  assert.deepStrictEqual(ran.asked, []);
  assert.match(ran.stderr, /^sign-in-damaged:/);
  assert.strictEqual(line("`sign-in-damaged`"), "This machine's Evalation sign-in is damaged, so the key was not replaced. Run /ev-activate and sign in with the same account as before, so your pack credits are there.");
});

test("a machine never signed in is sent to /ev-start, as every command sends it", () => {
  assert.strictEqual(line("**`no-settings`**"), "This machine is not set up for Evalation yet. Run /ev-start to set it up.");
});

test("the command text shows an outcome line as printed and adds nothing to it", () => {
  assert.doesNotMatch(COMMAND, /refused 40[13]/);
  assert.doesNotMatch(FLAT, /The key was not replaced|The key change did not finish|Add the step|Then add/);
  assert.match(FLAT, /Where the first line it prints is a sentence, show that line exactly as printed and nothing more\./);
  const { held } = require("../lib/prose.js");
  const names = [...COMMAND.matchAll(/evalation-say ([a-z0-9.-]+)/g)].map((one) => one[1]);
  assert.deepStrictEqual(names.filter((name) => !LINES[name] || held(LINES[name].say).length > 0), []);
});

test("a current key that cannot be read stops before anything is sent", async () => {
  const home = machine();
  unlinkSync(key(home, "receiving-key"));
  const ran = await rotated(home);
  assert.strictEqual(ran.status, 1);
  assert.deepStrictEqual(ran.asked, []);
  assert.match(ran.stderr, /^no-key:/);
});

test("settings that exist and cannot be read are told apart from a machine never signed in", async () => {
  const home = machine();
  writeFileSync(join(home, "evalation.local"), "{");
  const ran = await rotated(home);
  assert.strictEqual(ran.status, 1);
  assert.match(ran.stderr, /^sign-in-damaged:/);
});

test("a key store that refuses the new key gives a prefixed reason and no stack trace", async () => {
  const home = machine();
  chmodSync(join(home, "keys"), 0o500);
  try {
    const ran = await rotated(home);
    assert.strictEqual(ran.status, 1);
    assert.strictEqual(ran.stderr, said("ev-rotate.not-replaced-key-store"));
    assert.doesNotMatch(ran.stderr, /^\s+at /m);
  } finally {
    chmodSync(join(home, "keys"), 0o700);
  }
});

test("the command text names a line for every prefix the script prints, and never quotes the script's own lines", () => {
  for (const prefix of ["no-settings", "sign-in-damaged", "sign-in-unclear", "no-receiving-key", "no-key"]) assert.ok(line(`**\`${prefix}\`**`), prefix);
  const words = [FLAT, ...Object.entries(LINES).filter(([name]) => name.startsWith("ev-rotate.")).map(([, one]) => one.say)].join(" ");
  assert.doesNotMatch(words, /password store(?! \(Keychain on a Mac\))/);
  assert.ok(!FLAT.includes("Replaced this machine's key."), "the command shows the script's own line and never quotes it");
});

test("the command text promises nothing for a lost machine and sends that case to support", () => {
  const description = COMMAND.split("\n").find((line) => line.startsWith("description:"));
  assert.doesNotMatch(description, /lost|left/);
  assert.match(COMMAND, /lost or stolen/);
  assert.match(line("lost or stolen"), /support@evalation\.ai/);
  assert.doesNotMatch(COMMAND, /\bseat\b|Never run it again/);
});
