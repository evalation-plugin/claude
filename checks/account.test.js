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
    assert.match(line(text, "`reason: clock`"), /clock to the right time/, name);
    assert.match(line(text, "`reason: refused`"), /support@evalation\.ai/, name);
    assert.match(line(text, "`reason: ended`"), /support@evalation\.ai/, name);
    assert.match(line(text, "`reason: other`"), /support@evalation\.ai/, name);
    assert.match(line(text, "`state: unreachable`"), /If it still fails, contact support@evalation\.ai\.$/, name);
    assert.doesNotMatch(flat(text), /never in a file/, name);
  }
  assert.strictEqual(line(ACCOUNT, "`sign-in: damaged`"), "This machine's Evalation sign-in is damaged. Run /ev-activate and sign in with the same account as before, so your pack credits are there.");
});

test("a damaged machine that recorded its account names it, in setting up and in the account reply", () => {
  assert.strictEqual(line(ACCOUNT, "names the account"), "This machine's Evalation sign-in is damaged. Run /ev-activate and sign in with <email>, the same account as before, so your pack credits are there.");
  assert.match(line(START, "names the account"), /^This machine needs to sign in to Evalation again\. Sign in with <email>, the same account as before/);
});

test("a failed read of the chosen packs ends in a fixed line in both commands, keyed on the exit alone", () => {
  for (const [name, text, command] of [["ev-start.md", START, "/ev-start"], ["ev-account.md", ACCOUNT, "/ev-account"]]) {
    const said = line(text, "Where `evalation-packs chosen` exits with any code but 0");
    assert.match(said, /^Your chosen packs could not be read just now\./, name);
    assert.ok(said.includes(command), name);
    assert.match(said, /support@evalation\.ai/, name);
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
  for (const [name, text] of [["ev-start.md", START], ["ev-account.md", ACCOUNT]]) {
    assert.match(text, /`evalation-packs chosen`/, name);
    assert.doesNotMatch(text, /evalation-packs (titles|show)/, name);
    assert.match(text, /^allowed-tools:.*Bash\(evalation-packs chosen:\*\)/m, name);
    assert.doesNotMatch(flat(text), /each pack's title/, name);
  }
});

test("the close of setting up says the packs are what /ev-packs changes", () => {
  assert.strictEqual(line(START, "already chosen before this ran"), "Run /ev-packs to change which packs you use.");
});

test("the account reply is worded exactly for each case, says the credits once, and says what a pack is in the words /ev-packs uses", () => {
  const fromPacks = Object.entries(LINES).find(([name, one]) => name.startsWith("ev-packs.") && /^A pack is one thing/.test(one.say ?? ""));
  const packLine = fromPacks ? fromPacks[1].say : flat(read("ev-packs.md")).match(/what a pack is, in these words: "([^"]+)"/)[1];
  assert.ok(line(ACCOUNT, "No packs selected").startsWith(packLine), packLine);
  assert.strictEqual(line(ACCOUNT, "`state: not-set-up` alone"), "This machine is not set up for Evalation yet. Run /ev-start to set it up.");
  assert.strictEqual(line(ACCOUNT, "exactly as it comes back"), "You have <credits> pack credits.");
  assert.strictEqual(line(ACCOUNT, "Where <N> is 1"), "You have one pack credit.");
  assert.strictEqual(line(ACCOUNT, "Packs selected"), "You chose <titles>. A run against them uses <count> pack credits, one for each pack it reads. Run /ev-run in a repository to check it against them.");
  assert.match(line(ACCOUNT, "With one pack"), /A run against it uses one pack credit\./);
  assert.doesNotMatch(flat(ACCOUNT), /and how many are left/);
  assert.match(flat(ACCOUNT), /In place of the line above,/);
  assert.strictEqual(line(ACCOUNT, "Where <N> is 0"), "To buy pack credits, email support@evalation.ai.");
});

test("setting up opens and closes in fixed words, and names no pack credit before a pack is explained", () => {
  const words = flat(START);
  const step = (n) => words.slice(words.indexOf(` ${n}. **`), words.indexOf(` ${n + 1}. **`));
  assert.strictEqual(line(step(1), "Open with"), "Evalation checks your code against the security and compliance standards you choose, and writes reports on what it finds.");
  assert.strictEqual(line(step(2), "`sign-in: damaged`"), "This machine needs to sign in to Evalation again. Sign in with the same account as before, so your pack credits are there.");
  assert.strictEqual(line(step(3), "Take them through signing in"), "Signing in sets up your Evalation account, or links this machine to it if you already have one.");
  assert.doesNotMatch(step(3), /pack credit|in your own words/);
  assert.strictEqual(line(step(4), "Otherwise"), "You are set up to check code against <titles>.");
  assert.strictEqual(line(step(5), "0 pack credits"), "To buy pack credits, email support@evalation.ai.");
  assert.match(words, /Close in up to four sentences/);
});

test("the close of setting up hides git's error outside a repository and has an ending for no packs", () => {
  const words = flat(START);
  assert.match(words, /`git rev-parse --is-inside-work-tree 2>\/dev\/null`/);
  assert.doesNotMatch(words, /`git rev-parse --is-inside-work-tree`/);
  assert.strictEqual(line(START, "Where <M> is 0"), "Run /ev-packs when you are ready to choose what to check against.");
});

test("every line the two commands show comes from the catalogue and passes the plugin's own wording rules", () => {
  const names = [START, ACCOUNT].flatMap((text) => [...text.matchAll(/evalation-say ([a-z0-9.-]+)/g)].map((one) => one[1]));
  assert.ok(names.length > 0, "the commands show lines from the catalogue");
  assert.deepStrictEqual(names.filter((name) => !LINES[name]), []);
  assert.deepStrictEqual(names.filter((name) => held(LINES[name].say ?? LINES[name].ask).length > 0), []);
});
