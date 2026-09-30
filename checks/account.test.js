"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
require("./fixture.js");
const { held } = require("../lib/prose.js");
const { entries } = require("../lib/say.js");

const read = (name) => readFileSync(join(__dirname, "..", "commands", name), "utf8");
const START = read("ev-start.md");
const ACCOUNT = read("ev-account.md");
const LINES = entries();
const flat = (text) => text.replace(/\s+/g, " ");
const escaped = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function line(text, marker) {
  const at = flat(text).match(new RegExp(`${escaped(marker)}[^\`]*\`evalation-say ([a-z0-9.-]+)`));
  assert.ok(at, `${marker} names a line from the catalogue`);
  assert.ok(LINES[at[1]], `${at[1]} is a line the plugin holds`);
  return LINES[at[1]].say;
}

test("every state bullet starts on its own line, so none renders inside the one above it", () => {
  for (const [name, text] of [["ev-start.md", START], ["ev-account.md", ACCOUNT]]) {
    assert.deepStrictEqual(text.split("\n").filter((one) => /\S.*\s- \*{0,2}`state:/.test(one)), [], name);
  }
});

test("each status the machine can be in has its own plain line, and a refused machine is sent to support", () => {
  for (const [name, text] of [["ev-start.md", START], ["ev-account.md", ACCOUNT]]) {
    assert.match(line(text, "`reason: clock`"), /clock is wrong.*right time/, name);
    assert.match(line(text, "`reason: refused`"), /support@evalation\.ai/, name);
    assert.match(line(text, "`reason: ended`"), /support@evalation\.ai/, name);
    assert.match(line(text, "`reason: other`"), /Run \/ev-[\w-]+ again in a few minutes/, name);
    assert.match(line(text, "`state: unreachable`"), /couldn't be reached.*run \/ev-[\w-]+ again/, name);
    assert.doesNotMatch(flat(text), /never in a file/, name);
  }
  assert.strictEqual(line(ACCOUNT, "`sign-in: damaged`"), "This machine's Evalation sign-in is damaged. Run /ev-activate and sign in with the same account as before.");
});

test("a damaged machine that recorded its account names it, in setting up and in the account reply", () => {
  assert.strictEqual(line(ACCOUNT, "names the account"), "This machine's Evalation sign-in is damaged. Run /ev-activate and sign in with <email>.");
  assert.match(line(START, "names the account"), /^This machine needs to sign in to Evalation again\. Sign in with <email>/);
});

test("a failed read of the chosen packs ends in a fixed line in setting up, keyed on the exit alone", () => {
  for (const [name, text, command] of [["ev-start.md", START, "/ev-start"]]) {
    const said = line(text, "Where `evalation-packs chosen` exits with any code but 0");
    assert.match(said, /^Your packs couldn't be read just now\./, name);
    assert.ok(said.includes(command), name);
    assert.match(said, /again in a few minutes/, name);
  }
});

test("the packs script exits non-zero when the pack list cannot be fetched, so the commands can key on its exit", () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = require("node:fs");
  const { spawnSync } = require("node:child_process");
  const home = mkdtempSync(join(require("node:os").tmpdir(), "evalation-account-"));
  mkdirSync(join(home, "keys"));
  for (const one of ["installation-key", "receiving-key"]) {
    writeFileSync(join(home, "keys", `evalation-plugin.box.${one}`), require("node:crypto").randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-packs"), "chosen"], { encoding: "utf8", env: { ...process.env,
    EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file", EVALATION_SERVER: "http://127.0.0.1:9" } });
  assert.notStrictEqual(ran.status, 0);
  assert.strictEqual(ran.stdout, "");
});

test("pack titles come joined from a script, so the session never joins them itself", () => {
  for (const [name, text] of [["ev-start.md", START]]) {
    assert.match(text, /`evalation-packs chosen`/, name);
    assert.doesNotMatch(text, /evalation-packs (titles|show)/, name);
    assert.match(text, /^allowed-tools:.*Bash\(evalation-packs chosen:\*\)/m, name);
    assert.doesNotMatch(flat(text), /each pack's title/, name);
  }
});

test("the close of setting up says the packs are what /ev-packs changes", () => {
  assert.strictEqual(line(START, "already chosen before this ran"), "Run /ev-packs to change your packs.");
});

test("the account names no pack and says the balance once, inside the question to buy", () => {
  assert.doesNotMatch(ACCOUNT, /evalation-packs|\/ev-packs|chosen pack/);
  assert.doesNotMatch(ACCOUNT, /ev-account\.credits"|`evalation-say ev-account\.credits`/);
  assert.match(flat(ACCOUNT), /`evalation-buy price <N>`/);
  assert.strictEqual(line(ACCOUNT, "`state: not-set-up` alone"), "This machine isn't set up for Evalation yet. Run /ev-start to set it up.");
  assert.doesNotMatch(flat(ACCOUNT), /Where <N> is 0/, "the buy offer follows at any balance, so no line waits for 0");
  assert.ok(!Object.keys(LINES).some((name) => /^ev-account\.(chosen|short|no-packs|packs-unread|credits$|credits-one)/.test(name)));
  assert.strictEqual(line(ACCOUNT, "The answer to talk it through"), "A run uses one pack credit for each pack it reads. What would you like to know?");
});

test("setting up opens and closes in fixed words, and names no pack credit before a pack is explained", () => {
  const words = flat(START);
  const step = (n) => words.slice(words.indexOf(` ${n}. **`), words.indexOf(` ${n + 1}. **`));
  assert.strictEqual(line(step(1), "Open with"), "Evalation checks your code against the security and compliance standards you choose, and writes reports on what it finds.");
  assert.strictEqual(line(step(2), "`sign-in: damaged`"), "This machine needs to sign in to Evalation again. Sign in with the same account as before.");
  assert.strictEqual(line(step(3), "Take them through signing in"), "Signing in creates your Evalation account, or links this machine to the one you have.");
  assert.doesNotMatch(step(3), /pack credit|in your own words/);
  assert.strictEqual(line(step(4), "Otherwise"), "You're set up to check code against <titles>.");
  assert.strictEqual(line(step(5), "0 pack credits"), "To buy pack credits, run /ev-account.");
  assert.match(words, /Close in up to four sentences/);
});

test("the close of setting up hides git's error outside a repository and has an ending for no packs", () => {
  const words = flat(START);
  assert.match(words, /`git rev-parse --is-inside-work-tree 2>\/dev\/null`/);
  assert.doesNotMatch(words, /`git rev-parse --is-inside-work-tree`/);
  assert.strictEqual(line(START, "Where <M> is 0"), "Run /ev-packs when you're ready to choose what to check against.");
});

test("every line the two commands show comes from the catalogue and passes the plugin's own wording rules", () => {
  const names = [START, ACCOUNT].flatMap((text) => [...text.matchAll(/evalation-say ([a-z0-9.-]+)/g)].map((one) => one[1]));
  assert.ok(names.length > 0, "the commands show lines from the catalogue");
  assert.deepStrictEqual(names.filter((name) => !LINES[name]), []);
  assert.deepStrictEqual(names.filter((name) => held(LINES[name].say ?? LINES[name].ask).length > 0), []);
});
