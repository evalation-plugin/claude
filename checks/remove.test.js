"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
require("./fixture.js");
const { pluginConversations, removal, reportsIn, withoutSessions } = require("../lib/remove.js");

const folderOf = (path) => path.replace(/[^A-Za-z0-9]/g, "-");
const COMMAND = readFileSync(join(__dirname, "..", "commands", "ev-remove.md"), "utf8");

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
  for (const said of ["no-settings: looked in /x/evalation.local", "no-key: nothing at /x/keys", "refused 401: {\"refusals\":[{\"observed\":\"nothing we issued signed this\",\"failure\":\"not-live\"}]}"]) {
    const { home, claude, read } = machine();
    const done = removal({ home, claude, cwd: read, clearHistory: false, revoke: () => { throw new Error(said); }, forget: () => {} });
    assert.strictEqual(done.signed_out, "already", said);
    assert.strictEqual(existsSync(home), false, said);
  }
});

test("a key the store will not delete is reported as left behind, and only a key already gone is passed over", () => {
  const { home, claude, read } = machine();
  const done = removal({ home, claude, cwd: read, clearHistory: false, revoke: () => {}, forget: (service, account) => {
    const thrown = new Error("Command failed");
    thrown.status = account.endsWith("-previous") ? 44 : 51;
    throw thrown;
  } });
  assert.deepStrictEqual(done.keys_left.sort(), ["evalation/client-box.installation-key", "evalation/client-box.receiving-key"]);
});

test("a failure after the sign-out never claims nothing was removed", (t) => {
  if (process.getuid?.() === 0) return t.skip("root deletes regardless of folder modes");
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
  for (const run of ["run-d46c", "run-e11a"]) {
    mkdirSync(join(home, "reports", run), { recursive: true });
    for (const one of ["sanaude-board-pack.pdf", "board-pack.html", "review-findings.json"]) writeFileSync(join(home, "reports", run, one), "x");
  }
  const at = "2026-09-23T00:30:00.000Z";
  writeFileSync(join(home, "findings", "2026-09-23T00-30-00-000Z-run-d46c.json"), JSON.stringify({ run: "run-d46c", at }));
  const printed = new Date("2026-09-25T12:00:00Z");
  utimesSync(join(home, "reports", "run-e11a", "sanaude-board-pack.pdf"), printed, printed);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const day = (when) => `${when.getDate()} ${MONTHS[when.getMonth()]} ${when.getFullYear()}`;
  const expected = [{ name: "sanaude board pack", date: day(new Date(at)) }, { name: "sanaude board pack", date: day(printed) }];
  assert.deepStrictEqual(reportsIn(home), expected, "two runs' reports of one name are each named, with the date of their run");
  const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "folders"], { encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: home, CLAUDE_CONFIG_DIR: claude } });
  assert.strictEqual(ran.status, 0, ran.stderr);
  assert.deepStrictEqual(JSON.parse(ran.stdout).reports, expected);
  assert.match(COMMAND.replace(/\s+/g, " "), /<N> reports/);
  removal({ home, claude, cwd: read, clearHistory: false, ...quiet });
  assert.strictEqual(existsSync(home), false);
  assert.match(COMMAND.replace(/\s+/g, " "), /Removing deletes them with it\. Reports in your Documents folder stay\./);
});

const FLAT = COMMAND.replace(/\s+/g, " ");
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
  assert.match(FLAT, /changed in the last hour/);
  assert.match(FLAT, /still open in Claude Code were kept/);
});

test("before asking, the count names the other conversations and how many of them are open", () => {
  const { claude } = machine();
  running(claude, [[process.pid, "removing-now"], [process.ppid, "plugin-questions"]]);
  const ran = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-remove"), "folders"], { encoding: "utf8",
    env: { ...process.env, EVALATION_PLUGIN_HOME: mkdtempSync(join(tmpdir(), "evalation-home-")), CLAUDE_CONFIG_DIR: claude, CLAUDE_CODE_SESSION_ID: "removing-now" } });
  assert.strictEqual(ran.status, 0, ran.stderr);
  const shown = JSON.parse(ran.stdout);
  assert.deepStrictEqual([shown.conversations, shown.open, shown.open_by], [2, 1, "claude-code"]);
  assert.match(FLAT, /close those windows before you answer/);
});

test("keys that could not be found because the settings would not read are reported plainly", () => {
  const { home, claude } = machine();
  rmSync(join(home, "evalation.local"));
  mkdirSync(join(home, "evalation.local"));
  const done = removal({ home, claude, clearHistory: false, ...quiet });
  assert.ok(done.failed.some((one) => one.startsWith("settings:")));
  assert.strictEqual(done.folder_deleted, true);
  assert.match(FLAT, /Where `failed` names settings, say "Evalation could not read which keys it kept on this machine/);
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

test("every answer the command offers carries its description", () => {
  const register = JSON.parse(readFileSync(join(__dirname, "..", "lib", "asked.json"), "utf8")).filter((one) => one.command === "ev-remove");
  for (const one of register) {
    const para = COMMAND.split(/\n\s*\n/).map((each) => each.replace(/\s+/g, " ")).find((each) => each.includes(`"${one.asks}"`)) ?? "";
    assert.doesNotMatch(para, /"[^"]+" and "[^"]+"/, one.asks);
    assert.ok((para.match(/"[^"]+", described as "[^"]+"/g) ?? []).length >= 2, one.asks);
  }
});
