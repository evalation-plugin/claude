"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createHash, generateKeyPairSync, verify } = require("node:crypto");
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const RECORD = join(__dirname, "..", ".github", "record-release.js");
const PLUGIN = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
const ENTRY = JSON.parse(readFileSync(join(__dirname, "..", "release-notes.json"), "utf8")).releases.find((one) => one.version === PLUGIN.version);
const TAG = `v${PLUGIN.version}`;
const REPO = "evalation-plugin/claude";

function gitHub({ release = null, answer = null } = {}) {
  const state = { release, asked: [], uploaded: [] };
  const held = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const url = new URL(req.url, "http://stand-in");
      state.asked.push({ method: req.method, path: url.pathname, auth: req.headers.authorization });
      const reply = (code, value) => {
        res.writeHead(code, { "content-type": "application/json", connection: "close" });
        res.end(JSON.stringify(value));
      };
      if (answer) return reply(...answer);
      if (req.method === "GET" && url.pathname === `/repos/${REPO}/releases/tags/${TAG}`) {
        return state.release ? reply(200, state.release) : reply(404, { message: "Not Found" });
      }
      if (req.method === "POST" && url.pathname === `/repos/${REPO}/releases`) {
        const asked = JSON.parse(body.toString("utf8"));
        state.created = asked;
        state.release = { id: 7, tag_name: asked.tag_name, assets: [], upload_url: `${base()}/uploads/repos/${REPO}/releases/7/assets{?name,label}` };
        return reply(201, state.release);
      }
      if (req.method === "POST" && url.pathname === `/uploads/repos/${REPO}/releases/7/assets`) {
        state.uploaded.push({ name: url.searchParams.get("name"), type: req.headers["content-type"], body });
        return reply(201, { name: url.searchParams.get("name") });
      }
      return reply(500, { message: `unexpected ${req.method} ${url.pathname}` });
    });
  });
  held.unref();
  const base = () => `http://127.0.0.1:${held.address().port}`;
  return new Promise((resolve) => held.listen(0, "127.0.0.1", () => resolve({ held, state, base: base() })));
}

function ran(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RECORD], { env: { ...process.env, GITHUB_REPOSITORY: REPO, GITHUB_SHA: "abc123", ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

const pair = () => {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return { pem: privateKey.export({ type: "pkcs8", format: "pem" }), publicKey };
};

test("the release step creates the version's release and attaches its record, signed the way the server checks it", async () => {
  const key = pair();
  const { held, state, base } = await gitHub();
  const done = await ran({ EVALATION_RELEASE_SIGNING_KEY: key.pem, GITHUB_TOKEN: "t0ken", GITHUB_API_URL: base });
  held.close();
  assert.strictEqual(done.code, 0, done.stderr);
  assert.deepStrictEqual(state.created, { tag_name: TAG, target_commitish: "abc123", name: PLUGIN.version, body: ENTRY.notes.map((note) => `- ${note}`).join("\n") });
  assert.ok(state.asked.every((one) => one.auth === "Bearer t0ken"));
  assert.strictEqual(state.uploaded.length, 1);
  const [asset] = state.uploaded;
  assert.strictEqual(asset.name, "release-record.json");
  assert.strictEqual(asset.type, "application/json");
  const record = JSON.parse(asset.body.toString("utf8"));
  assert.deepStrictEqual(JSON.parse(record.body), { version: ENTRY.version, date: ENTRY.date, notes: ENTRY.notes });
  const digest = createHash("sha256").update(record.body, "utf8").digest("hex");
  assert.ok(verify(null, Buffer.from(`evalation.ask.v1 /releases/record ${record.at} ${digest}`), key.publicKey, Buffer.from(record.signature, "base64")));
  assert.ok(Math.abs(record.at - Date.now() / 1000) < 60);
  assert.strictEqual(done.stdout, `attached the signed record to ${TAG}\n`);
});

test("a release that already carries its record is left alone, and an existing release without one gets it", async () => {
  const key = pair();
  const carried = await gitHub({ release: { id: 7, tag_name: TAG, assets: [{ name: "release-record.json" }], upload_url: "unused" } });
  const already = await ran({ EVALATION_RELEASE_SIGNING_KEY: key.pem, GITHUB_TOKEN: "t0ken", GITHUB_API_URL: carried.base });
  carried.held.close();
  assert.strictEqual(already.code, 0, already.stderr);
  assert.strictEqual(already.stdout, `${TAG} already carries its signed record\n`);
  assert.ok(carried.state.asked.every((one) => one.method === "GET"));

  const bare = await gitHub();
  bare.state.release = { id: 7, tag_name: TAG, assets: [], upload_url: `${bare.base}/uploads/repos/${REPO}/releases/7/assets{?name,label}` };
  const attached = await ran({ EVALATION_RELEASE_SIGNING_KEY: key.pem, GITHUB_TOKEN: "t0ken", GITHUB_API_URL: bare.base });
  bare.held.close();
  assert.strictEqual(attached.code, 0, attached.stderr);
  assert.strictEqual(bare.state.created, undefined);
  assert.strictEqual(bare.state.uploaded.length, 1);
});

test("a missing setting, a bad key or a refusal from GitHub fails naming why", async () => {
  const key = pair();
  for (const [env, named] of [
    [{ EVALATION_RELEASE_SIGNING_KEY: "", GITHUB_TOKEN: "t0ken" }, /EVALATION_RELEASE_SIGNING_KEY is not set/],
    [{ EVALATION_RELEASE_SIGNING_KEY: "not a key", GITHUB_TOKEN: "t0ken" }, /EVALATION_RELEASE_SIGNING_KEY isn't an ed25519 private key/],
    [{ EVALATION_RELEASE_SIGNING_KEY: key.pem, GITHUB_TOKEN: "" }, /GITHUB_TOKEN is not set/],
  ]) {
    const missing = await ran({ GITHUB_API_URL: "http://127.0.0.1:9", ...env });
    assert.strictEqual(missing.code, 1);
    assert.match(missing.stderr, named);
  }
  const refusing = await gitHub({ answer: [403, { message: "Resource not accessible by integration" }] });
  const refused = await ran({ EVALATION_RELEASE_SIGNING_KEY: key.pem, GITHUB_TOKEN: "t0ken", GITHUB_API_URL: refusing.base });
  refusing.held.close();
  assert.strictEqual(refused.code, 1);
  assert.match(refused.stderr, /GitHub refused .* with 403: Resource not accessible by integration/);
  assert.doesNotMatch(refused.stderr + refused.stdout, /t0ken/);
});

test("the checks workflow attaches the record on a push to main, after the checks pass, with the key from the secret and write access to releases", () => {
  const flow = readFileSync(join(__dirname, "..", ".github", "workflows", "checks.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(flow, /record-release:\n\s+if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\n\s+needs: checks\n\s+permissions:\n\s+contents: write/);
  assert.match(flow, /EVALATION_RELEASE_SIGNING_KEY: \$\{\{ secrets\.EVALATION_RELEASE_SIGNING_KEY \}\}/);
  assert.match(flow, /GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
  assert.doesNotMatch(flow, /EVALATION_RELEASE_URL/);
  assert.match(flow, /run: node \.github\/record-release\.js/);
});
