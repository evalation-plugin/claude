"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { existsSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const NEWS = join(__dirname, "..", "bin", "evalation-news");
const INSTALLED = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8")).version;
const home = () => mkdtempSync(join(tmpdir(), "evalation-news-"));

function standIn(answer) {
  const asked = [];
  const held = createServer((req, res) => {
    asked.push(req.url);
    const reply = answer(req.url);
    if (reply === "hang") return;
    res.writeHead(reply[0], { "content-type": "application/json", connection: "close" });
    res.end(JSON.stringify(reply[1]));
  });
  held.unref();
  return new Promise((resolve) => held.listen(0, "127.0.0.1", () => resolve({ held, asked, base: `http://127.0.0.1:${held.address().port}` })));
}

function ran(verb, at, base, input = "") {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [NEWS, verb], { env: { ...process.env, EVALATION_PLUGIN_HOME: at, EVALATION_SERVER: base } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (code) => resolve({ code, stdout, stderr, took: Date.now() - started }));
    child.stdin.end(input);
  });
}

const RELEASES = [
  { version: "9.1.0", date: "2026-10-02", notes: ["Runs start faster on large repositories."] },
  { version: "9.2.0", date: "2026-10-09", notes: ["The account command shows who approves you.", "Reports print on A4 by default."] },
];
const cached = (at, releases, installed = INSTALLED) =>
  writeFileSync(join(at, "news.json"), JSON.stringify({ installed, releases }));
const prompt = (session, text) => JSON.stringify({ session_id: session, prompt: text, hook_event_name: "UserPromptSubmit" });

test("the fetch asks our server for the releases newer than the installed version and keeps them on this machine", async () => {
  const at = home();
  const { held, asked, base } = await standIn(() => [200, { releases: RELEASES }]);
  const done = await ran("fetch", at, base);
  held.close();
  assert.strictEqual(done.code, 0);
  assert.deepStrictEqual(asked, [`/releases?after=${INSTALLED}`]);
  assert.deepStrictEqual(JSON.parse(readFileSync(join(at, "news.json"), "utf8")), { installed: INSTALLED, releases: RELEASES });
  assert.strictEqual(done.stdout + done.stderr, "");
});

test("a fetch that times out after two seconds, fails, or reads an answer it can't use keeps nothing and says nothing", async () => {
  for (const answer of [() => "hang", () => [503, { refusals: [] }], () => [200, { releases: "no" }], () => [200, { releases: [{ version: "x" }] }]]) {
    const at = home();
    const { held, base } = await standIn(answer);
    const done = await ran("fetch", at, base);
    held.close();
    assert.strictEqual(done.code, 0);
    assert.strictEqual(done.stdout + done.stderr, "");
    assert.ok(!existsSync(join(at, "news.json")));
    assert.ok(done.took < 4000, `took ${done.took}ms`);
  }
  const unreachable = await ran("fetch", home(), "http://127.0.0.1:9");
  assert.strictEqual(unreachable.stdout + unreachable.stderr, "");
});

test("the session start hook returns at once and leaves the fetch running on its own", async () => {
  const at = home();
  const { held, asked, base } = await standIn(() => [200, { releases: RELEASES }]);
  const done = await ran("start", at, base, JSON.stringify({ session_id: "s1", hook_event_name: "SessionStart" }));
  assert.strictEqual(done.code, 0);
  assert.strictEqual(done.stdout, "");
  assert.ok(done.took < 1500, `took ${done.took}ms`);
  const until = Date.now() + 5000;
  while (!existsSync(join(at, "news.json")) && Date.now() < until) await new Promise((resolve) => setTimeout(resolve, 100));
  held.close();
  assert.ok(existsSync(join(at, "news.json")));
  assert.strictEqual(asked.length, 1);
});

test("the first Evalation command in a session shows the newer releases once, from what this machine already holds", async () => {
  const at = home();
  cached(at, RELEASES);
  const { held, asked, base } = await standIn(() => [200, { releases: [] }]);
  const first = await ran("prompt", at, base, prompt("s1", "/ev-run"));
  assert.strictEqual(first.code, 0);
  assert.deepStrictEqual(JSON.parse(first.stdout), { systemMessage: [
    `Evalation 9.2.0 is out, and you have ${INSTALLED}. To get it, run /plugin, open the Installed tab, pick evalation-plugin and choose Update now, then run /reload-plugins.`,
    "- Runs start faster on large repositories.",
    "- The account command shows who approves you.",
    "- Reports print on A4 by default.",
  ].join("\n") });
  assert.strictEqual((await ran("prompt", at, base, prompt("s1", "/ev-account"))).stdout, "", "once per session");
  assert.notStrictEqual((await ran("prompt", at, base, prompt("s2", "/evalation-plugin:ev-packs"))).stdout, "", "again in a new session");
  held.close();
  assert.deepStrictEqual(asked, [], "the prompt hook reaches nothing");
});

test("nothing is shown for a prompt that isn't an Evalation command, when nothing newer is out, or when nothing is known yet", async () => {
  const at = home();
  cached(at, RELEASES);
  assert.strictEqual((await ran("prompt", at, "http://127.0.0.1:9", prompt("s1", "tell me about /ev-run"))).stdout, "");
  assert.notStrictEqual((await ran("prompt", at, "http://127.0.0.1:9", prompt("s1", "/ev-run"))).stdout, "", "a prompt that wasn't a command doesn't use up the session's notice");
  const none = home();
  cached(none, []);
  assert.strictEqual((await ran("prompt", none, "http://127.0.0.1:9", prompt("s1", "/ev-run"))).stdout, "");
  const unknown = home();
  assert.strictEqual((await ran("prompt", unknown, "http://127.0.0.1:9", prompt("s1", "/ev-run"))).stdout, "");
  cached(unknown, RELEASES);
  assert.notStrictEqual((await ran("prompt", unknown, "http://127.0.0.1:9", prompt("s1", "/ev-run"))).stdout, "", "a session that met no answer yet is told once one arrives");
  const updated = home();
  cached(updated, RELEASES, "0.1.0");
  assert.strictEqual((await ran("prompt", updated, "http://127.0.0.1:9", prompt("s1", "/ev-run"))).stdout, "", "a cache kept for another installed version says nothing");
  const broken = home();
  writeFileSync(join(broken, "news.json"), "{");
  const damaged = await ran("prompt", broken, "http://127.0.0.1:9", "not json");
  assert.strictEqual(damaged.code, 0);
  assert.strictEqual(damaged.stdout + damaged.stderr, "");
});

test("the plugin registers the fetch at session start and the notice on each prompt", () => {
  const hooks = JSON.parse(readFileSync(join(__dirname, "..", "hooks", "hooks.json"), "utf8")).hooks;
  const command = (event) => hooks[event]?.flatMap((one) => one.hooks.map((each) => each.command));
  assert.deepStrictEqual(command("SessionStart"), ["${CLAUDE_PLUGIN_ROOT}/bin/evalation-news start"]);
  assert.deepStrictEqual(command("UserPromptSubmit"), ["${CLAUDE_PLUGIN_ROOT}/bin/evalation-news prompt"]);
});
