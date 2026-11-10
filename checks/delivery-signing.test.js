"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { createServer } = require("node:http");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");

const tree = repository();
scanned(tree, []);

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-delivery-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  for (const one of ["installation-key", "receiving-key"]) {
    writeFileSync(join(home, "keys", `evalation-plugin.box.${one}`), randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

function signing() {
  const asked = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const { run: name, digest, packs, report } = JSON.parse(body);
      const shaped = typeof name === "string" && typeof digest === "string"
        && Array.isArray(packs) && packs.every((one) => typeof one === "string") && typeof report === "string";
      if (shaped && req.url === "/sign") asked.push({ run: name, packs, report });
      res.writeHead(shaped ? 200 : 422, { "content-type": "application/json" });
      res.end(JSON.stringify({ signature: Buffer.alloc(64, 7).toString("base64"), signed_at: "2026-10-15T00:00:00Z" }));
    });
  });
  server.unref();
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, asked, at: `http://127.0.0.1:${server.address().port}` })));
}

function ran(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [join(__dirname, "..", "bin", command), ...args], { env });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

async function signedBy(command) {
  const home = machine();
  const { server, asked, at } = await signing();
  const env = { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file", EVALATION_SERVER: at };
  const folder = mkdtempSync(join(tmpdir(), "evalation-delivery-run-"));
  const source = join(folder, "findings.json");
  writeFileSync(source, JSON.stringify({ ...run(tree), schema: "evalation.findings.v1" }));
  const done = await ran(command, [source, join(folder, "reports")], env);
  server.close();
  return { done, asked };
}

test("an evidence pack is signed naming its pack and the evidence-pack kind", async () => {
  const { done, asked } = await signedBy("evalation-report");
  assert.strictEqual(done.status, 0, done.stderr);
  assert.deepStrictEqual(asked, [{ run: "run-check", packs: ["soc2"], report: "evidence-pack" }],
    "bin/evalation-report must seal each evidence pack with its pack id and the kind evidence-pack, as lib/print.js signatureFor sends them");
});

test("a concern set's review pack and review detail are each signed naming the concern set and their own kind", async () => {
  const { done, asked } = await signedBy("evalation-deliver");
  assert.strictEqual(done.status, 0, done.stderr);
  assert.deepStrictEqual(asked, [
    { run: "run-check", packs: ["hardening"], report: "review-pack" },
    { run: "run-check", packs: ["hardening"], report: "review-detail" },
  ], "bin/evalation-deliver must seal the review pack as review-pack and the review detail as review-detail, each with the concern sets it covers");
});
