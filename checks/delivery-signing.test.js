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
      if (req.url === "/sign") asked.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
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

const named = (asked) => asked.map(({ run: name, packs, report }) => ({ run: name, packs, report }));

test("each report signed names the pack it is for and which of its reports it is", async () => {
  const home = machine();
  const { server, asked, at } = await signing();
  const env = { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file", EVALATION_SERVER: at };
  const folder = mkdtempSync(join(tmpdir(), "evalation-delivery-run-"));
  const source = join(folder, "findings.json");
  writeFileSync(source, JSON.stringify({ ...run(tree), schema: "evalation.findings.v1" }));

  const report = await ran("evalation-report", [source, join(folder, "report")], env);
  assert.strictEqual(report.status, 0, report.stderr);
  assert.deepStrictEqual(named(asked), [{ run: "run-check", packs: ["soc2"], report: "evidence-pack" }]);

  asked.length = 0;
  const deliver = await ran("evalation-deliver", [source, join(folder, "review")], env);
  assert.strictEqual(deliver.status, 0, deliver.stderr);
  assert.deepStrictEqual(named(asked), [
    { run: "run-check", packs: ["hardening"], report: "review-pack" },
    { run: "run-check", packs: ["hardening"], report: "review-detail" },
  ]);
  server.close();
});
