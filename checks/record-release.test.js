"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createHash, createPublicKey, generateKeyPairSync, verify } = require("node:crypto");
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const RECORD = join(__dirname, "..", ".github", "record-release.js");
const PLUGIN = JSON.parse(readFileSync(join(__dirname, "..", ".claude-plugin", "plugin.json"), "utf8"));
const NOTES = JSON.parse(readFileSync(join(__dirname, "..", "release-notes.json"), "utf8")).releases.find((one) => one.version === PLUGIN.version);

function releaseServer(publicKey, answer = () => [200, { version: PLUGIN.version, already: false }]) {
  const asked = [];
  const held = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const at = req.headers["x-evalation-release-at"];
      const digest = createHash("sha256").update(body).digest("hex");
      const signed = verify(null, Buffer.from(`evalation.ask.v1 ${req.url} ${at} ${digest}`), publicKey,
        Buffer.from(String(req.headers["x-evalation-release-signature"] ?? ""), "base64"));
      asked.push({ path: req.url, body: JSON.parse(body), signed, at: Number(at) });
      const [code, reply] = signed ? answer() : [403, { refusals: [{ observed: "not signed", failure: "not-release-key" }] }];
      res.writeHead(code, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify(reply));
    });
  });
  held.unref();
  return new Promise((resolve) => held.listen(0, "127.0.0.1", () => resolve({ held, asked, base: `http://127.0.0.1:${held.address().port}` })));
}

function ran(env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [RECORD], { env: { ...process.env, ...env } });
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

test("the release step records this version's notes, signed with the release key the way the server checks it", async () => {
  const key = pair();
  const { held, asked, base } = await releaseServer(key.publicKey);
  const done = await ran({ EVALATION_RELEASE_SIGNING_KEY: key.pem, EVALATION_RELEASE_URL: base });
  held.close();
  assert.strictEqual(done.code, 0, done.stderr);
  assert.strictEqual(asked.length, 1);
  assert.strictEqual(asked[0].path, "/releases/record");
  assert.ok(asked[0].signed);
  assert.ok(Math.abs(asked[0].at - Date.now() / 1000) < 60);
  assert.deepStrictEqual(asked[0].body, { version: PLUGIN.version, date: NOTES.date, notes: NOTES.notes });
  assert.match(done.stdout, new RegExp(`recorded ${PLUGIN.version.replace(/\./g, "\\.")}`));
});

test("a version already recorded with the same notes passes, and a refusal, a wrong key or a missing setting fails naming why", async () => {
  const key = pair();
  const again = await releaseServer(key.publicKey, () => [200, { version: PLUGIN.version, already: true }]);
  const already = await ran({ EVALATION_RELEASE_SIGNING_KEY: key.pem, EVALATION_RELEASE_URL: again.base });
  again.held.close();
  assert.strictEqual(already.code, 0, already.stderr);
  assert.match(already.stdout, /already recorded/);

  const other = await releaseServer(key.publicKey);
  const wrong = await ran({ EVALATION_RELEASE_SIGNING_KEY: pair().pem, EVALATION_RELEASE_URL: other.base });
  other.held.close();
  assert.strictEqual(wrong.code, 1);
  assert.match(wrong.stderr, /403.*not-release-key/);

  const differ = await releaseServer(key.publicKey, () => [422, { refusals: [{ observed: `version ${PLUGIN.version} is already recorded with different notes` }] }]);
  const refused = await ran({ EVALATION_RELEASE_SIGNING_KEY: key.pem, EVALATION_RELEASE_URL: differ.base });
  differ.held.close();
  assert.strictEqual(refused.code, 1);
  assert.match(refused.stderr, /already recorded with different notes/);

  for (const [env, named] of [[{ EVALATION_RELEASE_URL: "http://127.0.0.1:9", EVALATION_RELEASE_SIGNING_KEY: "" }, /EVALATION_RELEASE_SIGNING_KEY/],
    [{ EVALATION_RELEASE_SIGNING_KEY: key.pem, EVALATION_RELEASE_URL: "" }, /EVALATION_RELEASE_URL/]]) {
    const missing = await ran(env);
    assert.strictEqual(missing.code, 1);
    assert.match(missing.stderr, named);
  }
});

test("the checks workflow records the release on a push to main, after the checks pass, with the key from the secret", () => {
  const flow = readFileSync(join(__dirname, "..", ".github", "workflows", "checks.yml"), "utf8").replace(/\r\n/g, "\n");
  assert.match(flow, /record-release:\n\s+if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'\n\s+needs: checks/);
  assert.match(flow, /EVALATION_RELEASE_SIGNING_KEY: \$\{\{ secrets\.EVALATION_RELEASE_SIGNING_KEY \}\}/);
  assert.match(flow, /EVALATION_RELEASE_URL: \$\{\{ vars\.EVALATION_RELEASE_URL \}\}/);
  assert.match(flow, /run: node \.github\/record-release\.js/);
  assert.ok(createPublicKey, "node crypto holds ed25519");
});
