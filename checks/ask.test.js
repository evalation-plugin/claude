"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { randomBytes } = require("node:crypto");
require("./fixture.js");

function machine() {
  const home = mkdtempSync(join(tmpdir(), "evalation-ask-"));
  mkdirSync(join(home, "keys"), { recursive: true });
  for (const one of ["installation-key", "receiving-key"]) {
    writeFileSync(join(home, "keys", `evalation-plugin.box.${one}`), randomBytes(32).toString("base64"), { mode: 0o600 });
  }
  writeFileSync(join(home, "evalation.local"), JSON.stringify({ installation: "box", secrets: {
    installation_key: "store:evalation-plugin/box.installation-key", receiving_key: "store:evalation-plugin/box.receiving-key" } }));
  return home;
}

function refused(observed) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      req.resume();
      req.on("end", () => {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ refusals: [{ observed, failure: "not-live" }] }));
      });
    }).listen(0, "127.0.0.1", () => {
      const home = machine();
      const child = spawn(process.execPath, [join(__dirname, "..", "bin", "evalation-ask"), "/pin", "{}"], { env: { ...process.env,
        EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(home, "evalation.local"), EVALATION_KEY_STORE: "file",
        EVALATION_SERVER: `http://127.0.0.1:${server.address().port}` } });
      let stderr = "";
      child.stderr.on("data", (chunk) => { stderr += chunk; });
      child.on("exit", () => server.close(() => resolve(stderr)));
    });
  });
}

test("clock advice is added to a refusal only when the server says the clock is out", async () => {
  assert.doesNotMatch(await refused("nothing we issued signed this"), /clock/);
  assert.match(await refused("the proof was made 900 seconds from now"), /clock on this machine/);
});
