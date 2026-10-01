"use strict";

const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");
const { spawn, spawnSync } = require("node:child_process");
const { createServer } = require("node:http");
const net = require("node:net");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, dirname, join } = require("node:path");
const { randomBytes } = require("node:crypto");
require("./fixture.js");

const ROOT = join(__dirname, "..");
const BIN = join(ROOT, "bin");
const ERRORS = join(ROOT, "lib", "errors.js");
const FIELDS = ["engine", "failure", "place", "revision", "source", "subject"];
const ELSEWHERE = join(tmpdir(), "anna", "acme");

function firstLoads(file) {
  const stop = Symbol("stop");
  const seen = [];
  const loading = new Module(file, null);
  loading.filename = file;
  loading.paths = Module._nodeModulePaths(dirname(file));
  loading.require = (id) => {
    seen.push(Module._resolveFilename(id, loading));
    if (seen.length === 1 && seen[0] === ERRORS) {
      return { hook: () => { seen.push("hook"); throw stop; }, report: () => { throw stop; }, pinned: () => { throw stop; } };
    }
    throw stop;
  };
  try {
    loading._compile(readFileSync(file, "utf8"), file);
  } catch (thrown) {
    if (thrown !== stop) throw thrown;
  }
  return seen;
}

function hookScripts() {
  const hooks = JSON.parse(readFileSync(join(ROOT, "hooks", "hooks.json"), "utf8")).hooks;
  return new Set(Object.values(hooks).flat().flatMap((one) => one.hooks).map((one) => basename(one.command.split(/\s+/)[0])));
}

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-errors-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  for (const one of ["installation-key", "receiving-key"]) {
    writeFileSync(join(home, "keys", `evalation-plugin.box.${one}`), randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

function envFor(home, server, more = {}) {
  const env = { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file", ...more };
  delete env.EVALATION_REPORTING;
  if (more.EVALATION_REPORTING) env.EVALATION_REPORTING = more.EVALATION_REPORTING;
  if (server) env.EVALATION_SERVER = server;
  else delete env.EVALATION_SERVER;
  return env;
}

const heldIn = (home) => (existsSync(join(home, "errors.jsonl"))
  ? readFileSync(join(home, "errors.jsonl"), "utf8").split("\n").filter(Boolean).map((one) => JSON.parse(one)) : []);

function listening(answer) {
  const asked = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      asked.push({ path: req.url, headers: req.headers, body: JSON.parse(body) });
      const [status, said] = answer(asked.length);
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(said));
    });
  });
  server.unref();
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, asked, at: `http://127.0.0.1:${server.address().port}` })));
}

function silent() {
  const sockets = [];
  const server = net.createServer((socket) => {
    socket.on("error", () => socket.destroy());
    sockets.push(socket);
  });
  server.unref();
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    at: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((done) => { sockets.forEach((one) => one.destroy()); server.close(done); }),
  })));
}

function ran(file, args, options) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [file, ...args], options);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr, took: Date.now() - started }));
  });
}

async function until(done, ms = 20000) {
  const by = Date.now() + ms;
  while (Date.now() < by) {
    if (done()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return done();
}

const sending = (home) => existsSync(join(home, "errors-sending"));

test("every script in bin/ loads lib/errors.js before any other module, and each hook says it is one", () => {
  const hooks = hookScripts();
  const wrong = readdirSync(BIN).flatMap((name) => {
    const seen = firstLoads(join(BIN, name));
    if (seen[0] !== ERRORS) return [`${name} loads ${seen[0] ?? "nothing"} first`];
    if (hooks.has(name) !== (seen[1] === "hook")) return [`${name} ${hooks.has(name) ? "is a hook and does not say so" : "says it is a hook and is not one"}`];
    return [];
  });
  assert.deepStrictEqual(wrong, []);
});

test("an uncaught error and an unhandled rejection are held, with output and exit code as they were", () => {
  for (const [code, failure] of [["throw new Error('it broke at 42')", "uncaught-error"], ["Promise.reject(new Error('it broke'))", "unhandled-rejection"]]) {
    const home = mkdtempSync(join(tmpdir(), "evalation-errors-"));
    const script = `require(${JSON.stringify(ERRORS)}); process.stdout.write('before\\n'); ${code};`;
    const on = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: envFor(home) });
    const off = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: envFor(home, null, { EVALATION_REPORTING: "sending" }) });
    assert.deepStrictEqual([on.status, on.stdout, on.stderr], [off.status, off.stdout, off.stderr]);
    const held = heldIn(home);
    assert.strictEqual(held.length, 1, failure);
    assert.deepStrictEqual(Object.keys(held[0]).sort(), FIELDS);
    assert.strictEqual(held[0].source, "plugin");
    assert.strictEqual(held[0].failure, failure);
    assert.match(held[0].engine, /^\d+\.\d+\.\d+$/);
    assert.strictEqual(held[0].revision, null);
    assert.strictEqual(held[0].subject, failure === "uncaught-error" ? "it broke at <n>" : "it broke");
  }
});

test("a report with a field outside its form is dropped, and an undeclared field drops it too", () => {
  const { admitted, built } = require("../lib/errors.js");
  const good = built("unexpected-error", new Error("it broke"));
  assert.ok(admitted(good));
  assert.strictEqual(built("not-a-listed-failure", new Error("it broke")), null);
  for (const bad of [{ failure: "Uncaught" }, { engine: "0.71" }, { revision: "1.05" }, { revision: 1.6 }, { source: "engine" },
    { subject: `read ${join(ELSEWHERE, "secret")}` }, { subject: "x".repeat(201) }, { place: `${join(ELSEWHERE, "bin", "evalation-run")}:4` },
    { place: "../outside.js:3" }, { place: "bin/evalation-run" }, { place: "checks/errors.test.js:3" }, { place: "lib/say/ev-run.json:1" },
    { extra: "anything" }]) {
    assert.ok(!admitted({ ...good, ...bad }), JSON.stringify(bad));
  }
});

test("no path, repository name or folder name of this machine reaches a report", () => {
  const folder = join(mkdtempSync(join(tmpdir(), "evalation-errors-")), "zebracorn");
  mkdirSync(folder);
  const home = mkdtempSync(join(tmpdir(), "evalation-errors-"));
  const message = `Cannot open zebracorn: ${folder}/src/app.js, C:\\Users\\anna\\acme\\app.js, acme/payments-api, acme-payments and ACME_TOKEN failed at line 12`;
  const script = `require(${JSON.stringify(ERRORS)}); throw new Error(${JSON.stringify(message)});`;
  spawnSync(process.execPath, ["-e", script, folder], { cwd: folder, encoding: "utf8", env: envFor(home) });
  const held = heldIn(home);
  assert.strictEqual(held.length, 1);
  const said = JSON.stringify(held[0]);
  for (const secret of ["zebracorn", "anna", "acme", "payments", "ACME", "app.js", "/", "\\\\", tmpdir()]) {
    assert.ok(!said.includes(secret), `${secret} reached ${said}`);
  }
  assert.strictEqual(held[0].subject, "Cannot open <id> <path> <path> <path> <id> and <id> failed at line <n>");
});

test("a subfolder's plain name, a repository name, a hash and a file name never reach a report", () => {
  const solution = mkdtempSync(join(tmpdir(), "evalation-errors-"));
  for (const one of ["payments", "ledger"]) mkdirSync(join(solution, one));
  const project = mkdtempSync(join(tmpdir(), "evalation-errors-"));
  mkdirSync(join(project, "billing"));
  const home = mkdtempSync(join(tmpdir(), "evalation-errors-"));
  const message = "Exit code 9 9b9fafe: 9b9fafe is no file in the evalation-engine tree, and this workspace holds evalation-engine, evalation-govern. Require payments, ledger and billing before redactor.ts";
  const script = `require(${JSON.stringify(ERRORS)}); throw new Error(${JSON.stringify(message)});`;
  spawnSync(process.execPath, ["-e", script], { cwd: solution, encoding: "utf8", env: envFor(home, null, { CLAUDE_PROJECT_DIR: project }) });
  const held = heldIn(home);
  assert.strictEqual(held.length, 1);
  assert.strictEqual(held[0].subject,
    "Exit code <n> <id> <id> is no file in the <id> tree, and this workspace holds <id> <id> Require <id> <id> and <id> before <id>");
});

test("a placeholder and the count suffix pass the word rule unchanged", () => {
  const { scrubbed } = require("../lib/errors.js");
  assert.strictEqual(scrubbed("it broke at <path> on <id> [x3]", new Set()), "it broke at <path> on <id> [x3]");
});

test("a crowded working folder gives at most 200 of its names", () => {
  const crowded = mkdtempSync(join(tmpdir(), "evalation-errors-"));
  for (let at = 0; at < 1000; at += 1) mkdirSync(join(crowded, `crowd${at}`));
  const script = `console.log([...require(${JSON.stringify(ERRORS)}).machineWords()].filter((one) => one.startsWith("crowd")).length);`;
  const ran = spawnSync(process.execPath, ["-e", script], { cwd: crowded, encoding: "utf8", env: envFor(mkdtempSync(join(tmpdir(), "evalation-errors-"))) });
  const listed = Number(ran.stdout.trim());
  assert.ok(listed > 0 && listed <= 200, `${listed} names from a folder of 1000: ${ran.stderr}`);
});

test("place is the first frame inside the plugin, relative to its folder", async () => {
  const { placeOf } = require("../lib/errors.js");
  assert.strictEqual(placeOf([
    "Error: it broke",
    "    at JSON.parse (<anonymous>)",
    "    at read (node:internal/fs/utils:10:2)",
    `    at Object.<anonymous> (${join(ELSEWHERE, "node_modules", "thing", "index.js")}:4:9)`,
    `    at check (${join(ROOT, "checks", "errors.test.js")}:9:1)`,
    `    at load (${join(ROOT, "lib", "say.js")}:120:7)`,
    `    at main (${join(ROOT, "bin", "evalation-run")}:412:3)`,
  ].join("\n")), "lib/say.js:120");
  assert.strictEqual(placeOf(`Error: it broke\n    at JSON.parse (<anonymous>)\n    at x (${join(ELSEWHERE, "app.js")}:1:1)`), null);
  assert.strictEqual(placeOf(undefined), null);

  const home = machine();
  const got = await ran(join(BIN, "evalation-ask"), ["/pin", "not json"], { env: envFor(home, "http://127.0.0.1:9") });
  assert.strictEqual(got.status, 1);
  const held = heldIn(home);
  assert.strictEqual(held.length, 1, got.stderr);
  assert.strictEqual(held[0].failure, "ask-not-json");
  assert.match(held[0].place, /^bin\/evalation-ask:\d+$/);
  await until(() => !sending(home));
});

test("a refusal of an ask the plugin built wrongly is reported, and the person's own state is not", async () => {
  const { refusal } = require("../lib/errors.js");
  const body = (failure, at = "body") => JSON.stringify({ refusals: [{ at, observed: "it was refused", failure }] });
  for (const [status, failure] of [[401, "not-live"], [402, "entitlement-ended"], [403, "awaiting-approval"], [403, "machine-declined"],
    [503, "transport-failure"], [500, undefined], [422, "rate-limited"], [422, "no-price"], [422, "checkout-refused"]]) {
    assert.strictEqual(refusal("/run", status, body(failure)), null, `${status} ${failure}`);
  }
  assert.deepStrictEqual(refusal("/buy/checkout", 422, body("unservable")), { failure: "ask-refused", subject: "buy checkout refused at body" });
  assert.deepStrictEqual(refusal("/sets/keep", 400, "not json at all"), { failure: "ask-refused", subject: "sets keep refused" });

  const home = machine();
  const { server, at } = await listening(() => [422, { refusals: [{ at: "body", observed: "the ask could not be read", failure: "unservable" }] }]);
  const got = await ran(join(BIN, "evalation-ask"), ["/buy/checkout", "{}"], { env: envFor(home, at) });
  await until(() => !sending(home));
  server.close();
  assert.strictEqual(got.status, 1);
  assert.match(got.stderr, /^refused 422: /);
  assert.deepStrictEqual(heldIn(home).map((one) => [one.failure, one.subject]), [["ask-refused", "buy checkout refused at body"]]);

  const person = machine();
  const own = await listening(() => [402, { refusals: [{ at: "entitlement", observed: "no pack credits left", failure: "entitlement-ended" }] }]);
  await ran(join(BIN, "evalation-ask"), ["/run", "{}"], { env: envFor(person, own.at) });
  own.server.close();
  assert.deepStrictEqual(heldIn(person), []);
});

test("held reports go with the next command, at most twenty are held, and a refused one is never sent again", async () => {
  const { built, hold } = require("../lib/errors.js");
  const home = machine();
  for (let one = 1; one <= 25; one += 1) hold(built("unexpected-error", new Error(`broke number ${"x".repeat(one)}`)), home);
  const held = heldIn(home);
  assert.strictEqual(held.length, 20);
  assert.strictEqual(held[19].subject, `broke number ${"x".repeat(25)}`);
  assert.strictEqual(held[0].subject, `broke number ${"x".repeat(6)}`);

  const { server, asked, at } = await listening((n) => (n === 2 ? [422, { refusals: [{ at: "report.subject", observed: "no", failure: "unservable" }] }] : [200, { occurrences: 1 }]));
  const said = await ran(join(BIN, "evalation-say"), ["shared.unanswered"], { env: envFor(home, at) });
  assert.strictEqual(said.status, 0, said.stderr);
  assert.ok(await until(() => asked.length === 20 && !sending(home)), `${asked.length} sent`);
  assert.ok(asked.every((one) => one.path === "/report" && one.headers["x-evalation-installation"] === "box" && one.headers["x-evalation-signature"]));
  assert.ok(asked.every((one) => JSON.stringify(Object.keys(one.body).sort()) === JSON.stringify(FIELDS)));
  assert.deepStrictEqual(heldIn(home), []);

  await ran(join(BIN, "evalation-say"), ["shared.unanswered"], { env: envFor(home, at) });
  await new Promise((resolve) => setTimeout(resolve, 500));
  await until(() => !sending(home));
  server.close();
  assert.strictEqual(asked.length, 20, "the refused report was never sent again");
});

test("a failing command gives the same output and exit code within two seconds while the server does not answer, and holds its report", async () => {
  const home = machine();
  const away = await silent();
  const on = await ran(join(BIN, "evalation-ask"), ["/pin", "not json"], { env: envFor(home, away.at) });
  const off = await ran(join(BIN, "evalation-ask"), ["/pin", "not json"], { env: envFor(home, away.at, { EVALATION_REPORTING: "sending" }) });
  assert.deepStrictEqual([on.status, on.stdout, on.stderr], [off.status, off.stdout, off.stderr]);
  assert.ok(on.took < 2000, `took ${on.took}ms`);
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(await until(() => !sending(home)), "the send gave up");
  await away.close();
  assert.deepStrictEqual(heldIn(home).map((one) => one.failure), ["ask-not-json"]);
});

test("a failure inside reporting reports nothing and leaves the command as it was", () => {
  const blocked = join(mkdtempSync(join(tmpdir(), "evalation-errors-")), "a-file");
  writeFileSync(blocked, "not a folder");
  const script = `require(${JSON.stringify(ERRORS)}); process.stdout.write('before\\n'); throw new Error('it broke');`;
  const on = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: envFor(blocked) });
  const off = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", env: envFor(blocked, null, { EVALATION_REPORTING: "sending" }) });
  assert.deepStrictEqual([on.status, on.stdout, on.stderr], [off.status, off.stdout, off.stderr]);
  assert.strictEqual(readFileSync(blocked, "utf8"), "not a folder");
});

test("the README names every field a report carries", () => {
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  assert.ok(readme.includes("## Error reports"));
  const section = readme.slice(readme.indexOf("## Error reports"));
  for (const field of FIELDS) assert.match(section, new RegExp(`\\b${field}\\b`), field);
});
