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
const NOT_REPLACED = "The key was not replaced and the old one still works.";
const NOT_FINISHED = "The key change did not finish.";
const LINES = entries();
const FLAT = COMMAND.replace(/\s+/g, " ");
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function line(marker, text = FLAT) {
  const at = text.match(new RegExp(`${escaped(marker)}[^\`]*\`evalation-say ([a-z0-9.-]+)`));
  assert.ok(at, `${marker} names a line from the catalogue`);
  assert.ok(LINES[at[1]], `${at[1]} is a line the plugin holds`);
  return LINES[at[1]].say;
}

const section = (from, to) => FLAT.slice(FLAT.indexOf(from), FLAT.indexOf(to));
const NOT_REPLACED_PART = () => section(`**\`${NOT_REPLACED}\`**`, `**\`${NOT_FINISHED}\`**`);
const NOT_FINISHED_PART = () => section(`**\`${NOT_FINISHED}\`**`, "**`no-settings`**");

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
  assert.deepStrictEqual(ran.stderr.split("\n").slice(0, 2), [NOT_REPLACED, "other"]);
  assert.strictEqual(readFileSync(key(home, "receiving-key"), "utf8"), before);
  assert.strictEqual(existsSync(key(home, "receiving-key-previous")), false);
});

test("a proof that fails after the server took the new key keeps both keys and never says the old one works", async () => {
  const home = machine();
  const before = readFileSync(key(home, "receiving-key"), "utf8");
  const ran = await rotated(home, refusing("/packs", 500, "could not open"));
  assert.strictEqual(ran.status, 1);
  assert.deepStrictEqual(ran.stderr.split("\n").slice(0, 2), [NOT_FINISHED, "other"]);
  assert.deepStrictEqual(publicOf(readFileSync(key(home, "receiving-key"), "utf8")), ran.asked[0].body.receiving_key);
  assert.strictEqual(readFileSync(key(home, "receiving-key-previous"), "utf8"), before);
});

test("a rerun after an unfinished change never writes the old key back over the new one", async () => {
  const home = machine();
  const before = readFileSync(key(home, "receiving-key"), "utf8");
  const cut = await rotated(home, (req, res, body) => (body.confirmed ? req.socket.destroy() : healthy(req, res)));
  assert.strictEqual(cut.stderr.split("\n")[0], NOT_FINISHED);
  const kept = readFileSync(key(home, "receiving-key"), "utf8");
  const again = await rotated(home, (req, res) => (req.url === "/packs" ? req.socket.destroy() : healthy(req, res)));
  assert.strictEqual(again.status, 1);
  assert.deepStrictEqual(again.stderr.split("\n").slice(0, 2), [NOT_FINISHED, "unreachable"]);
  assert.doesNotMatch(again.stderr, /still works/);
  assert.strictEqual(readFileSync(key(home, "receiving-key"), "utf8"), kept);
  assert.strictEqual(readFileSync(key(home, "receiving-key-previous"), "utf8"), before);
});

test("an offer lost to the network keeps both keys, and the next run offers the same key again and finishes", async () => {
  const home = machine();
  const cut = await rotated(home, (req, res, body) => (req.url === "/rotate" && !body.confirmed ? req.socket.destroy() : healthy(req, res)));
  assert.deepStrictEqual(cut.stderr.split("\n").slice(0, 2), [NOT_FINISHED, "unreachable"]);
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
  assert.deepStrictEqual(cut.stderr.split("\n").slice(0, 2), [NOT_FINISHED, "unreachable"]);
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
    [401, "the ask was made 400 seconds from now, and a proof holds for 300", "clock"],
    [401, "the proof was made -900 seconds from now, which is outside the window", "clock"],
    [401, "nothing we issued signed this, either because no installation answers to that name", "refused"],
    [402, "the entitlement for this installation has ended, so nothing further can be served", "ended"],
  ];
  for (const [status, observed, kind] of cases) {
    const ran = await rotated(machine(), refusing("/rotate", status, observed));
    assert.deepStrictEqual(ran.stderr.split("\n").slice(0, 2), [NOT_REPLACED, kind], observed);
  }
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
  assert.strictEqual(line("`sign-in-damaged`"), "This machine's Evalation sign-in is damaged, so the key was not replaced. Run /ev-activate and sign in with the same account as before, so your pack credits and reports are there.");
});

test("a machine never signed in is sent to /ev-start, as every command sends it", () => {
  assert.strictEqual(line("**`no-settings`**"), "This machine is not set up for Evalation yet. Run /ev-start to set it up.");
});

test("an unfinished change ended or refused by Evalation says only that, never that it may still finish", () => {
  const part = NOT_FINISHED_PART();
  const skip = part.match(/Where the word is refused or ended, show only the line for it[^.]*\./);
  assert.ok(skip, part);
  assert.ok(part.indexOf(skip[0]) < part.indexOf("evalation-say ev-rotate.not-finished`"), "the exception comes before the not-finished line");
  assert.match(part, /Otherwise show `evalation-say ev-rotate\.not-finished`/);
});

test("the command text gives the clock step only for a clock refusal, and sends a machine no longer accepted to support", () => {
  assert.doesNotMatch(COMMAND, /refused 40[13]/);
  for (const part of [NOT_REPLACED_PART(), NOT_FINISHED_PART()]) {
    assert.match(line("`clock`", part), /^Set this machine's clock/);
    assert.match(line("`refused`", part), /support@evalation\.ai/);
    assert.match(line("`ended`", part), /support@evalation\.ai/);
  }
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
    const [first, second] = ran.stderr.split("\n");
    assert.strictEqual(first, NOT_REPLACED);
    assert.strictEqual(second, "key-store-refused");
    assert.doesNotMatch(ran.stderr, /^\s+at /m);
  } finally {
    chmodSync(join(home, "keys"), 0o700);
  }
});

test("the command text says a sentence the script prints only where it is one, and gives a step for every word each sentence can carry", () => {
  assert.match(FLAT, /Where the first line is one of the two sentences below, show it exactly as printed\./);
  assert.ok(NOT_REPLACED_PART().length > 0 && NOT_FINISHED_PART().length > 0);
  assert.doesNotMatch(NOT_REPLACED_PART(), /`unreachable`/);
  assert.strictEqual(line("Otherwise show", NOT_FINISHED_PART()), "Other Evalation commands on this machine may not work until it finishes.");
  assert.strictEqual(line("`key-store-refused`", NOT_FINISHED_PART()), "Check this machine's password store (Keychain on a Mac) is unlocked, then run /ev-rotate again to finish it.");
  const words = [FLAT, ...Object.entries(LINES).filter(([name]) => name.startsWith("ev-rotate.")).map(([, one]) => one.say)].join(" ");
  assert.doesNotMatch(words, /password store(?! \(Keychain on a Mac\))/);
  assert.match(FLAT, /Show the line it prints exactly as printed/);
  assert.ok(!FLAT.includes("Replaced this machine's key."), "the command shows the script's own line and never quotes it");
});

test("the command text promises nothing for a lost machine and sends that case to support", () => {
  const description = COMMAND.split("\n").find((line) => line.startsWith("description:"));
  assert.doesNotMatch(description, /lost|left/);
  assert.match(COMMAND, /lost or stolen/);
  assert.match(line("lost or stolen"), /support@evalation\.ai/);
  assert.doesNotMatch(COMMAND, /\bseat\b|Never run it again/);
});
