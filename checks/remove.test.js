"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { keysNamed, pluginConversations, removal, reportsIn, setsAsked, withoutSessions } = require("../lib/remove.js");
const { entries, say } = require("../lib/say.js");

const folderOf = (path) => path.replace(/[^A-Za-z0-9]/g, "-");
const COMMAND = readFileSync(join(__dirname, "..", "commands", "ev-remove.md"), "utf8");
const FLAT = COMMAND.replace(/\s+/g, " ");
const LINES = entries();
const line = (name, values) => say(LINES, name, values);
const WORDS = Object.entries(LINES).filter(([name]) => name.startsWith("ev-remove.")).map(([, one]) => JSON.stringify(one)).join("\n");

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-home-"));
  const claude = mkdtempSync(join(tmpdir(), "claude-home-"));
  const read = realpathSync(mkdtempSync(join(tmpdir(), "client-repo-")));
  const solution = realpathSync(mkdtempSync(join(tmpdir(), "client-solution-")));
  const unrelated = realpathSync(mkdtempSync(join(tmpdir(), "own-work-")));
  mkdirSync(join(home, "findings"), { recursive: true });
  writeFileSync(join(home, "findings", "run.json"), JSON.stringify({ run: "run-1", target: { path: read } }));
  mkdirSync(join(home, "solutions"), { recursive: true });
  writeFileSync(join(home, "solutions", "s.json"), JSON.stringify({ root: solution, name: "Client", leave: [] }));
  mkdirSync(join(home, "questions"), { recursive: true });
  writeFileSync(join(home, "questions", "Broker questions.json"), "{}");
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "client-box", secrets: {
    installation_key: "store:evalation/client-box.installation-key", receiving_key: "store:evalation/client-box.receiving-key" } }));
  const conversation = (folder, id, lines, { live = false } = {}) => {
    const at = join(claude, "projects", folderOf(folder));
    mkdirSync(join(at, id), { recursive: true });
    writeFileSync(join(at, `${id}.jsonl`), lines.map((one) => JSON.stringify(one)).join("\n") + "\n");
    if (!live) {
      const old = new Date(Date.now() - 7200000);
      utimesSync(join(at, `${id}.jsonl`), old, old);
    }
  };
  const ran = (command) => ({ type: "user", message: { role: "user", content: `<command-message>evalation-plugin:${command}</command-message>\n<command-name>/evalation-plugin:${command}</command-name>` } });
  const typed = { type: "user", message: { role: "user", content: "please tidy the readme" } };
  const mentioned = { type: "user", message: { role: "user", content: [{ type: "tool_result", content: "grep found <command-name>/evalation-plugin:ev-run</command-name> in a log" }] } };
  conversation(read, "plugin-run", [ran("ev-run"), typed]);
  conversation(read, "own-work", [typed]);
  conversation(unrelated, "plugin-questions", [ran("ev-questions")]);
  conversation(unrelated, "talks-about-it", [typed, mentioned]);
  conversation(unrelated, "removing-now", [ran("ev-remove")], { live: true });
  writeFileSync(join(claude, "history.jsonl"), ["plugin-run", "own-work", "plugin-questions", "talks-about-it", "removing-now"]
    .map((id) => JSON.stringify({ display: "a prompt", project: read, sessionId: id })).join("\n") + "\n");
  return { home, claude, read, solution, unrelated };
}

const quiet = { revoke: () => {}, forget: () => {} };
const kept = (claude, folder, id) => existsSync(join(claude, "projects", folderOf(folder), `${id}.jsonl`));
const historyLeft = (claude) => readFileSync(join(claude, "history.jsonl"), "utf8").trim().split("\n").map((one) => JSON.parse(one).sessionId);

test("removal forgets the copies a key move left under the engine's store name too", () => {
  const { home, claude } = machine();
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "client-box", secrets: {
    installation_key: "store:evalation-plugin/client-box.installation-key", receiving_key: "store:evalation-plugin/client-box.receiving-key" } }));
  const forgot = [];
  removal({ home, claude, clearHistory: false, revoke: () => {}, forget: (service, account) => forgot.push(`${service}/${account}`) });
  assert.deepStrictEqual(forgot.sort(), ["client-box.installation-key", "client-box.receiving-key", "client-box.receiving-key-previous"]
    .flatMap((one) => [`evalation-plugin/${one}`, `evalation/${one}`]).sort());
});

test("removal revokes the installation, forgets every key, deletes the hidden folder and only the conversations that ran an Evalation command", () => {
  const { home, claude, read, unrelated } = machine();
  const forgot = [];
  let revoked = 0;
  const done = removal({ home, claude, clearHistory: true, revoke: () => { revoked += 1; }, forget: (service, account) => forgot.push(`${service}/${account}`) });
  assert.strictEqual(revoked, 1);
  assert.strictEqual(done.signed_out, "now");
  assert.deepStrictEqual(forgot.sort(), ["evalation/client-box.installation-key", "evalation/client-box.receiving-key", "evalation/client-box.receiving-key-previous"]);
  assert.deepStrictEqual(done.keys_left, []);
  assert.strictEqual(existsSync(home), false);
  assert.strictEqual(kept(claude, read, "plugin-run"), false);
  assert.strictEqual(existsSync(join(claude, "projects", folderOf(read), "plugin-run")), false);
  assert.strictEqual(kept(claude, unrelated, "plugin-questions"), false);
  assert.strictEqual(kept(claude, read, "own-work"), true, "a conversation that never ran an Evalation command stays");
  assert.strictEqual(kept(claude, unrelated, "talks-about-it"), true, "a conversation that only mentions the plugin stays");
  assert.strictEqual(kept(claude, unrelated, "removing-now"), true, "the conversation removing it stays");
  assert.deepStrictEqual(done.history.kept_live, 1);
  assert.deepStrictEqual(historyLeft(claude), ["own-work", "talks-about-it", "removing-now"]);
});

test("without a yes to clearing them, no conversation is touched", () => {
  const { home, claude, read } = machine();
  removal({ home, claude, clearHistory: false, ...quiet });
  assert.strictEqual(existsSync(home), false);
  assert.strictEqual(kept(claude, read, "plugin-run"), true);
  assert.strictEqual(historyLeft(claude).length, 5);
});

test("the conversations that ran an Evalation command are counted before anyone is asked", () => {
  const { claude } = machine();
  assert.deepStrictEqual(pluginConversations(claude).map((one) => one.id).sort(), ["plugin-questions", "plugin-run", "removing-now"]);
});

test("nothing is deleted from the folder removal runs in, and the command offers no such choice", () => {
  const { home, claude, read } = machine();
  const inside = join(read, "keep-me.txt");
  writeFileSync(inside, "the customer's own file");
  removal({ home, claude, clearHistory: true, ...quiet });
  assert.strictEqual(readFileSync(inside, "utf8"), "the customer's own file");
  assert.doesNotMatch(COMMAND, /this folder's|and-this-folder/);
});

test("where the server cannot be reached, nothing is deleted, since the keys are what could revoke it later", () => {
  const { home, claude, read } = machine();
  assert.throws(() => removal({ home, claude, cwd: read, clearHistory: true, revoke: () => { throw new Error("unreachable: https://api.evalation.ai/revoke (fetch failed)"); }, forget: () => {} }),
    (thrown) => thrown.reason === "unreachable");
  assert.throws(() => removal({ home, claude, cwd: read, clearHistory: true, revoke: () => { throw new Error("refused 503: {\"refusals\":[]}"); }, forget: () => {} }),
    (thrown) => thrown.reason === "unreachable");
  assert.strictEqual(existsSync(home), true);
  assert.strictEqual(kept(claude, read, "plugin-run"), true);
});

test("where the server refuses for any other reason, nothing is deleted and the reason is kept", () => {
  const { home, claude, read } = machine();
  assert.throws(() => removal({ home, claude, cwd: read, clearHistory: false, revoke: () => { throw new Error("refused 422: {\"refusals\":[{\"failure\":\"x\"}]}"); }, forget: () => {} }),
    (thrown) => thrown.reason === "refused");
  const skewed = "refused 401: {\"refusals\":[{\"observed\":\"the proof was made 900 seconds from now, which is outside the window\",\"failure\":\"not-live\"}]}";
  assert.throws(() => removal({ home, claude, cwd: read, clearHistory: false, revoke: () => { throw new Error(skewed); }, forget: () => {} }),
    (thrown) => thrown.reason === "refused");
  const skewedElsewhere = "refused 401: {\"refusals\":[{\"observed\":\"the proof was made 900 seconds from now\",\"failure\":\"not-live\"}]}";
  assert.throws(() => removal({ home, claude, cwd: read, clearHistory: false, revoke: () => { throw new Error(skewedElsewhere); }, forget: () => {} }),
    (thrown) => thrown.reason === "refused", "a wrong clock in either server's wording is never taken for a machine already gone");
  assert.strictEqual(existsSync(home), true);
});

test("a machine with no installation, or one already revoked, is removed locally and says it was already signed out", () => {
  for (const said of ["no-settings: looked in /x/evalation.local", "refused 401: {\"refusals\":[{\"observed\":\"nothing we issued signed this\",\"failure\":\"not-live\"}]}"]) {
    const { home, claude, read } = machine();
    const done = removal({ home, claude, cwd: read, clearHistory: false, revoke: () => { throw new Error(said); }, forget: () => {} });
    assert.strictEqual(done.signed_out, "already", said);
    assert.strictEqual(existsSync(home), false, said);
  }
  assert.strictEqual(line("ev-remove.already-out"), "This machine was already signed out of Evalation.");
  assert.match(FLAT, /Where it is `already`, show `evalation-say ev-remove\.already-out`/);
  assert.doesNotMatch(WORDS, /so only what it kept here was deleted/);
});

test("a damaged sign-in that never reached the server is never reported as signed out, and the folder still goes", () => {
  for (const said of ["no-key: Command failed: security find-generic-password", "no-installation: the settings name none", "unreadable-key-reference: x", "key-wrong-size: x", "settings-unreadable: x"]) {
    const { home, claude, read } = machine();
    const done = removal({ home, claude, cwd: read, clearHistory: false, revoke: () => { throw new Error(said); }, forget: () => {} });
    assert.strictEqual(done.signed_out, "not-revoked", said);
    assert.strictEqual(existsSync(home), false, said);
  }
  assert.strictEqual(line("ev-remove.not-revoked"), "Evalation couldn't sign this machine out. Email support@evalation.ai to have its sign-in switched off.");
  assert.match(FLAT, /Where it is `not-revoked`, show `evalation-say ev-remove\.not-revoked`\./);
  assert.doesNotMatch(FLAT, /unless step 2 already said the sign-in is damaged/);
  assert.strictEqual(line("ev-remove.damaged"), "This machine's Evalation sign-in is damaged, so it can't be signed out from here.", "a person who then keeps Evalation is never sent to support");
  assert.match(FLAT, /`sign-in: damaged`[^`]*`evalation-say ev-remove\.damaged`/);
  const local = JSON.parse(line("ev-remove.remove-local")).questions[0].options.find((one) => one.label === "Remove it");
  assert.strictEqual(local.description, "Deletes what Evalation saved on this machine.");
  assert.match(FLAT, /Where the state was `not-set-up`, run `evalation-say ev-remove\.remove-local`/);
});

test("a key the store will not delete is reported as left behind, and a key no store holds is passed over on every platform", () => {
  const { home, claude, read } = machine();
  const held = new Set(["evalation/client-box.installation-key", "evalation/client-box.receiving-key"]);
  const done = removal({ home, claude, cwd: read, clearHistory: false, revoke: () => {}, forget: (service, account) => {
    const thrown = new Error("Command failed");
    thrown.status = account.endsWith("-previous") ? 44 : 1;
    throw thrown;
  }, held: (service, account) => {
    if (!held.has(`${service}/${account}`)) throw new Error("Command failed");
    return "a key";
  } });
  assert.deepStrictEqual(done.keys_left.sort(), ["evalation/client-box.installation-key", "evalation/client-box.receiving-key"]);
  held.clear();
  const { home: other, claude: elsewhere } = machine();
  const none = removal({ home: other, claude: elsewhere, clearHistory: false, revoke: () => {}, forget: () => {
    const thrown = new Error("Command failed");
    thrown.status = 1;
    throw thrown;
  }, held: () => { throw new Error("Command failed"); } });
  assert.deepStrictEqual(none.keys_left, [], "a Windows store that throws for a missing key leaves nothing to delete by hand");
});

test("a failure after the sign-out never claims nothing was removed", (t) => {
  if (process.getuid?.() === 0) return t.skip("root deletes regardless of folder modes");
  if (process.platform === "win32") return t.skip("Windows ignores folder modes");
  const { claude, read } = machine();
  const parent = mkdtempSync(join(tmpdir(), "locked-"));
  const home = join(parent, "home");
  mkdirSync(join(home, "findings"), { recursive: true });
  writeFileSync(join(home, "findings", "run.json"), JSON.stringify({ target: { path: read } }));
  chmodSync(join(home, "findings"), 0o500);
  try {
    const done = removal({ home, claude, cwd: read, clearHistory: false, ...quiet });
    assert.strictEqual(done.signed_out, "now");
    assert.strictEqual(done.folder_deleted, false);
  } finally {
    chmodSync(join(home, "findings"), 0o700);
  }
});

test("reports kept inside the plugin's folder by an older version are named before removal, deleted with it, and the command says so", () => {
  const { home, claude, read } = machine();
  mkdirSync(join(home, "reports", "run-d46c"), { recursive: true });
  for (const one of ["sanaude-maycray-board-pack.pdf", "sanaude-maycray-findings-detail.pdf", "evidence-pack.pdf", "board-pack.html", "review-findings.json"]) writeFileSync(join(home, "reports", "run-d46c", one), "x");
  mkdirSync(join(home, "reports", "run-e11a"), { recursive: true });
  writeFileSync(join(home, "reports", "run-e11a", "sanaude-board-pack.pdf"), "x");
  const at = "2026-09-23T00:30:00.000Z";
  writeFileSync(join(home, "findings", "2026-09-23T00-30-00-000Z-run-d46c.json"), JSON.stringify({ run: "run-d46c", at, target: { repository: "sanaude/maycray" } }));
  const printed = new Date("2026-09-25T12:00:00Z");
  utimesSync(join(home, "reports", "run-e11a", "sanaude-board-pack.pdf"), printed, printed);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const day = (when) => `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
  const expected = [
    { repository: "sanaude/maycray", date: day(new Date(at)), reports: ["board pack", "evidence pack", "findings detail"] },
    { repository: null, date: day(printed), reports: ["sanaude board pack"] },
  ];
  assert.deepStrictEqual(reportsIn(home), expected, "each run's reports are named once, under the repository and date of their run");
  const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "folders"], { encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: home, CLAUDE_CONFIG_DIR: claude } });
  assert.strictEqual(ran.status, 0, ran.stderr);
  const shown = JSON.parse(ran.stdout);
  assert.deepStrictEqual(shown.reports, expected);
  assert.strictEqual(shown.reports_named, `the board pack, evidence pack and findings detail from the check of sanaude/maycray on ${day(new Date(at))} and the sanaude board pack from the check on ${day(printed)}`);
  assert.doesNotMatch(WORDS, /<count> reports/);
  removal({ home, claude, cwd: read, clearHistory: false, ...quiet });
  assert.strictEqual(existsSync(home), false);
  assert.match(line("ev-remove.old-reports", { reports: shown.reports_named }), /: the board pack, .+\. Removing Evalation deletes them, and reports in your Documents folder stay\.$/);
  assert.match(FLAT, /`evalation-say ev-remove\.old-reports reports="<reports_named>"`/);
  assert.strictEqual(JSON.parse(spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "folders"], { encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: home, CLAUDE_CONFIG_DIR: claude } }).stdout).reports_named, null);
});

const running = (claude, sessions) => {
  mkdirSync(join(claude, "sessions"), { recursive: true });
  for (const [pid, sessionId] of sessions) writeFileSync(join(claude, "sessions", `${pid}.json`), JSON.stringify({ pid, sessionId, status: "idle" }));
};
const DEAD = 2147483646;

test("a conversation Claude Code shows as open in another window is kept however long it has been idle", () => {
  const { home, claude, read, unrelated } = machine();
  running(claude, [[process.pid, "removing-now"], [process.ppid, "plugin-questions"], [DEAD, "plugin-run"]]);
  const done = removal({ home, claude, here: "removing-now", clearHistory: true, ...quiet });
  assert.strictEqual(kept(claude, unrelated, "plugin-questions"), true, "idle for two hours but open in another window");
  assert.strictEqual(kept(claude, read, "plugin-run"), false, "its window has closed");
  assert.deepStrictEqual([done.history.removed, done.history.kept_live, done.history.kept_by], [1, 2, "claude-code"]);
});

test("where Claude Code shows nothing reliable, a conversation changed in the last hour is kept and the count says why", () => {
  const { home, claude, read, unrelated } = machine();
  const recent = new Date(Date.now() - 1800000);
  utimesSync(join(claude, "projects", folderOf(unrelated), "plugin-questions.jsonl"), recent, recent);
  running(claude, [[process.ppid, "plugin-questions"]]);
  const done = removal({ home, claude, here: "removing-now", clearHistory: true, ...quiet });
  assert.strictEqual(kept(claude, unrelated, "plugin-questions"), true);
  assert.strictEqual(kept(claude, read, "plugin-run"), false);
  assert.deepStrictEqual([done.history.removed, done.history.kept_live, done.history.kept_by], [1, 2, "last-hour"]);
  assert.match(line("ev-remove.recent-more", { count: 2 }), /^2 conversations that changed in the last hour were kept/);
  assert.match(line("ev-remove.kept-more", { count: 2 }), /^This conversation and 2 others still open were kept/);
});

test("before asking, the count names the other conversations and how many of them are open", () => {
  const { claude } = machine();
  running(claude, [[process.pid, "removing-now"], [process.ppid, "plugin-questions"]]);
  const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "folders"], { encoding: "utf8",
    env: { ...process.env, EVALATION_PLUGIN_HOME: mkdtempSync(join(tmpdir(), "evalation-home-")), CLAUDE_CONFIG_DIR: claude, CLAUDE_CODE_SESSION_ID: "removing-now" } });
  assert.strictEqual(ran.status, 0, ran.stderr);
  const shown = JSON.parse(ran.stdout);
  assert.deepStrictEqual([shown.conversations, shown.open, shown.open_by], [2, 1, "claude-code"]);
  assert.match(line("ev-remove.open-many", { count: 2 }), /^2 of them .+close those windows first\.$/);
});

test("before asking, the other conversations are named by the project folder they ran in and their dates", () => {
  const claude = mkdtempSync(join(tmpdir(), "claude-home-"));
  const held = (cwd, id, when) => {
    const at = join(claude, "projects", folderOf(cwd));
    mkdirSync(at, { recursive: true });
    const lines = [{ type: "user", cwd, message: { role: "user", content: "<command-name>/evalation-plugin:ev-run</command-name>" } }];
    writeFileSync(join(at, `${id}.jsonl`), lines.map((one) => JSON.stringify(one)).join("\n") + "\n");
    utimesSync(join(at, `${id}.jsonl`), when, when);
  };
  held("/work/MayCray-main", "a", new Date(2026, 8, 23, 12));
  held("/work/MayCray-main", "b", new Date(2026, 8, 29, 12));
  held("/work/evalation", "c", new Date(2026, 8, 29, 9));
  held("/work/evalation", "removing-now", new Date(2026, 8, 29, 10));
  const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "folders"], { encoding: "utf8",
    env: { ...process.env, EVALATION_PLUGIN_HOME: mkdtempSync(join(tmpdir(), "evalation-home-")), CLAUDE_CONFIG_DIR: claude, CLAUDE_CODE_SESSION_ID: "removing-now" } });
  assert.strictEqual(ran.status, 0, ran.stderr);
  const shown = JSON.parse(ran.stdout);
  assert.deepStrictEqual(shown.places, [
    { folder: "MayCray-main", conversations: 2, from: "23 September 2026", to: "29 September 2026" },
    { folder: "evalation", conversations: 1, from: "29 September 2026", to: "29 September 2026" },
  ]);
  assert.strictEqual(shown.places_named, "2 in MayCray-main from 23 to 29 September 2026 and one in evalation on 29 September 2026");
  assert.strictEqual(line("ev-remove.place-day", { folder: "main", count: 3, from: "29 September 2026" }), "3 in main on 29 September 2026");
  assert.match(line("ev-remove.conversations", { count: 2, places: shown.places_named }), /They're from these project folders: 2 in MayCray-main from 23 to 29 September 2026 and one in evalation on 29 September 2026\./);
  assert.match(FLAT, /`evalation-say ev-remove\.conversations count="<conversations>" places="<places_named>"`/);
});

test("counts of one read as one, and the promise about folders names the project folders", () => {
  assert.strictEqual(line("ev-remove.open-one"), "One of them is open in another Claude Code window, so it's kept. To delete it too, close that window first.");
  assert.match(line("ev-remove.kept-two"), /^This conversation and one other still open were kept\./);
  assert.match(line("ev-remove.conversation", { folder: "evalation", from: "29 September 2026" }), /It's from the project folder evalation, on 29 September 2026\. Deleting it can't be undone/);
  for (const name of ["ev-remove.conversations", "ev-remove.conversation"]) assert.match(line(name, { count: 2, places: "x", folder: "x", from: "x" }), /your project files stay as they are/);
  assert.doesNotMatch(WORDS, /nothing in your folders is touched/);
});

test("removal is agreed before question sets are asked about, and each set is named once, in the question", () => {
  const removing = FLAT.indexOf("`evalation-say ev-remove.remove`");
  const sets = FLAT.indexOf("the question `evalation-remove sets` printed");
  assert.ok(removing > 0 && sets > removing, "the removal question comes first");
  assert.doesNotMatch(WORDS, /These question sets are saved only on this machine|Copies <names>/);
  const listing = { account: "reached", sets: [{ name: "Broker", where: "machine" }, { name: "Board", where: "both" }, { name: "Client", where: "machine" }, { name: "Held", where: "account" }] };
  const asked = setsAsked(listing);
  assert.deepStrictEqual(asked.sets, ["Broker", "Client"]);
  assert.strictEqual(asked.questions[0].question, "Keep \"Broker\" and \"Client\" on your account before removing?");
  assert.deepStrictEqual(asked.questions[0].options.map((one) => one.description), ["You can use them on your other computers.", "Deletes them with Evalation's folder."]);
  const one = setsAsked({ account: "reached", sets: [{ name: "Broker", where: "machine" }] });
  assert.strictEqual(one.questions[0].question, "Keep \"Broker\" on your account before removing?");
  assert.deepStrictEqual(one.questions[0].options.map((each) => each.description), ["You can use it on your other computers.", "Deletes it with Evalation's folder."]);
  assert.strictEqual(setsAsked({ account: "reached", sets: [{ name: "Board", where: "both" }] }), null);
});

test("a machine that is not signed in hears the whole of what removal deletes, and can still delete its conversations", () => {
  assert.strictEqual(line("ev-remove.folder-local"), "It deletes Evalation's folder on this machine, with your saved results, your pack choice and any question sets saved here.");
  assert.strictEqual(line("ev-remove.sets-stay-local"), "Your account can't be reached from this machine, so the question sets saved here can't be moved to it.");
  assert.match(FLAT, /Where `sets_here` is more than zero, add `evalation-say ev-remove\.sets-stay-local`\./);
  assert.doesNotMatch(FLAT, /leave out the first two sentences/);
  assert.doesNotMatch(FLAT, /Where both hold/);
  assert.match(FLAT, /Where the state was `not-set-up` and both `holds_saved` and `holds_sign_in` are false, show only `evalation-say ev-remove\.nothing-else` after the opening line step 1 gave, never `ev-remove\.nothing-saved` as well, and ask nothing more in this step: go on to step 3 where `conversations` is more than zero, or straight to step 4 where it is zero\./);
  assert.match(FLAT, /Where the state was `not-set-up`, `holds_saved` is false and `holds_sign_in` is true, show `evalation-say ev-remove\.only-sign-in`/);
  assert.match(line("ev-remove.only-sign-in"), /sign-in/);
  assert.match(FLAT, /Where the state was `live` or `not-live` and `holds_saved` is false, leave out the lines about the folder and show `evalation-say ev-remove\.nothing-saved` in their place\./);
  assert.doesNotMatch(WORDS, /so there is nothing to remove\./);
});

test("a folder holding only empty folders, or only its settings and keys, holds nothing saved, and the sets saved here are counted", () => {
  const folders = (home) => {
    const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "folders"], { encoding: "utf8",
      env: { ...process.env, EVALATION_PLUGIN_HOME: home, CLAUDE_CONFIG_DIR: mkdtempSync(join(tmpdir(), "claude-home-")) } });
    assert.strictEqual(ran.status, 0, ran.stderr);
    return JSON.parse(ran.stdout);
  };
  const home = mkdtempSync(join(tmpdir(), "evalation-home-"));
  assert.deepStrictEqual([folders(home).holds_saved, folders(home).sets_here], [false, 0], "an empty folder");
  mkdirSync(join(home, "findings", "old"), { recursive: true });
  mkdirSync(join(home, "questions"), { recursive: true });
  assert.strictEqual(folders(home).holds_saved, false, "only empty folders");
  writeFileSync(join(home, "evalation.local"), "{}");
  mkdirSync(join(home, "keys"), { recursive: true });
  writeFileSync(join(home, "keys", "evalation-plugin.box.installation-key"), "k");
  assert.strictEqual(folders(home).holds_saved, false, "only the settings and the keys they name");
  assert.strictEqual(folders(home).holds_sign_in, true, "the settings are a sign-in to remove, and the person is asked first");
  assert.strictEqual(folders(join(home, "missing")).holds_saved, false, "no folder at all");
  writeFileSync(join(home, "packs.json"), "{}");
  assert.strictEqual(folders(home).holds_saved, true, "a pack choice");
  writeFileSync(join(home, "questions", "Broker.json"), "{}");
  assert.strictEqual(folders(home).sets_here, 1);
  assert.doesNotMatch(COMMAND, /home_exists/);
});

test("the conversations kept are said after removal only where the number differs from what step 3 said", () => {
  assert.match(FLAT, /Where `history\.kept_live` is `open` plus one, step 3 already said which were kept, so show none of the kept lines\./);
});

test("keys that could not be found because the settings would not read are reported plainly", () => {
  const { home, claude } = machine();
  rmSync(join(home, "evalation.local"));
  mkdirSync(join(home, "evalation.local"));
  const done = removal({ home, claude, clearHistory: false, ...quiet });
  assert.ok(done.failed.some((one) => one.startsWith("settings:")));
  assert.strictEqual(done.folder_deleted, true);
  assert.match(line("ev-remove.keys-unread"), /^Evalation couldn't tell which keys it kept on this machine/);
  assert.match(FLAT, /Where `failed` names settings, show `evalation-say ev-remove\.keys-unread`/);
});

test("the slash menu describes the conversations removal offers to delete as the decision does", () => {
  const description = COMMAND.match(/^description: (.+)$/m)?.[1] ?? "";
  assert.match(description, /the Claude Code conversations that ran an Evalation command/);
  assert.doesNotMatch(description, /folders it checked/);
});

test("a line another window adds to the prompt history while it is rewritten is kept", () => {
  const { claude } = machine();
  const file = join(claude, "history.jsonl");
  let reads = 0;
  const read = (path, encoding) => {
    const text = readFileSync(path, encoding);
    reads += 1;
    if (reads === 1) appendFileSync(path, `${JSON.stringify({ display: "typed meanwhile", sessionId: "elsewhere" })}\n${JSON.stringify({ display: "late", sessionId: "plugin-run" })}\n`);
    return text;
  };
  const lines = withoutSessions(file, new Set(["plugin-run", "plugin-questions"]), read);
  assert.strictEqual(lines, 3);
  assert.deepStrictEqual(historyLeft(claude), ["own-work", "talks-about-it", "removing-now", "elsewhere"]);
  assert.deepStrictEqual(readdirSync(claude).filter((one) => one.startsWith("history")), ["history.jsonl"], "no temporary file is left");
});

test("a wrong clock stops removal with the clock line before anything is removed", () => {
  assert.strictEqual(line("ev-remove.clock"), "This machine's clock is wrong, so nothing was removed. Set it to the right time, then run /ev-remove again.");
  const clock = FLAT.indexOf("`state: not-live` with `reason: clock`: show `evalation-say ev-remove.clock` and stop.");
  assert.ok(clock > 0 && clock < FLAT.indexOf("``` evalation-remove folders ```"), "the clock is checked in step 1, before removal is offered");
  assert.match(FLAT, /`state: live`, or `state: not-live` for any other reason: go on\./);
});

const GOOD = (name) => ({ name, pack: "custom", questions: [{ identifier: "Q1", title: "Payments are recorded", intent: "Where does this repository record each payment it takes?",
  asked: "do we keep a record of payments", looks_for: [
    { find: "Code that writes a record for each payment, such as a payments table insert", proof: "runs" },
    { find: "A test that takes a payment and checks the record exists", proof: "runs" }] }] });

function signedIn() {
  const { randomBytes } = require("node:crypto");
  const home = mkdtempSync(join(tmpdir(), "evalation-home-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  for (const one of ["installation-key", "receiving-key"]) writeFileSync(join(home, "keys", `evalation-plugin.box.${one}`), randomBytes(32).toString("base64"), { mode: 0o600 });
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

function keepSets(home, names, status = 200) {
  const { createServer } = require("node:http");
  const { spawn } = require("node:child_process");
  const asked = [];
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => { body += chunk; });
      req.on("end", () => { asked.push(req.url); res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ kept: true })); });
    }).listen(0, "127.0.0.1", () => {
      const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "keep-sets", ...names], { env: { ...process.env,
        EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file", EVALATION_SERVER: `http://127.0.0.1:${server.address().port}` } });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", (code) => server.close(() => resolve({ status: code, stdout, stderr, asked })));
    });
  });
}

test("every set kept on the account before removal is named in one catalogue line, printed once after all are kept", async () => {
  const { save } = require("../lib/questions.js");
  const home = signedIn();
  for (const name of ["Broker", "Board", "Client"]) save(home, GOOD(name));
  const three = await keepSets(home, ["Broker", "Board", "Client"]);
  assert.strictEqual(three.status, 0, three.stderr);
  assert.strictEqual(three.asked.length, 3);
  assert.strictEqual(three.stdout, "The question sets \"Broker\", \"Board\" and \"Client\" are on your account.\n");
  const one = await keepSets(home, ["Broker"]);
  assert.strictEqual(one.stdout, "The question set \"Broker\" is kept on your account.\n");
  const down = await keepSets(home, ["Broker"], 503);
  assert.strictEqual(down.status, 1);
  assert.strictEqual(down.stdout, "");
  assert.match(down.stderr, /^not-kept: Broker\n/);
  assert.doesNotMatch(COMMAND, /evalation-questions keep-on-account/);
  assert.match(COMMAND, /Bash\(evalation-remove keep-sets:\*\)/);
  assert.match(FLAT, /evalation-remove keep-sets "<name>" \["<name>"\.\.\.\] ``` On success it prints one line naming every set it kept: show it exactly as printed\./);
});

test("a set that fails its check is named in one catalogue line sending the person to /ev-questions, nothing is kept, and no problem is shown", async () => {
  const { save } = require("../lib/questions.js");
  const home = signedIn();
  save(home, GOOD("Broker"));
  writeFileSync(join(home, "questions", "Broken.json"), JSON.stringify({ ...GOOD("Broken"), questions: [{ ...GOOD("Broken").questions[0], looks_for: [], intent: "" }] }));
  const ran = await keepSets(home, ["Broker", "Broken"]);
  assert.strictEqual(ran.status, 1);
  assert.strictEqual(ran.asked.length, 0, "nothing is kept until every set passes its check");
  assert.strictEqual(ran.stderr, "fails-check: Broken\n");
  assert.strictEqual(ran.stdout, "");
  const asked = JSON.parse(line("ev-remove.set-fails", { set: "Broken" })).questions[0];
  assert.strictEqual(asked.question, "The question set \"Broken\" needs fixing with /ev-questions before it can go on your account. What should happen to it?");
  assert.strictEqual(line("ev-remove.fix-set"), "Nothing was removed. Run /ev-remove again once the set is fixed.");
  assert.doesNotMatch(FLAT, /Show each listed problem/);
  assert.match(FLAT, /`fails-check`: run `evalation-say ev-remove\.set-fails set="<name>"`/);
});

test("keys left in the password store are each named by service and account, in one line", () => {
  assert.strictEqual(keysNamed(["evalation/box.installation-key", "evalation-plugin/box.receiving-key"]),
    "the service evalation with the account box.installation-key and the service evalation-plugin with the account box.receiving-key");
  assert.strictEqual(line("ev-remove.key-left", { keys: keysNamed(["evalation/box.installation-key"]) }),
    "One key is still in this machine's password store: the service evalation with the account box.installation-key. Delete it by hand, such as in Keychain Access on a Mac.");
  assert.match(FLAT, /`evalation-say ev-remove\.keys-left count="<count>" keys="<keys_named>"`/);
});
