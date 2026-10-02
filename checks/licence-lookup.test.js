"use strict";

const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { execFileSync, spawnSync } = require("node:child_process");
const { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository } = require("./fixture.js");
const { candidates, lookUp, urlOf } = require("../lib/lookup.js");
const { adapterFor, licences } = require("../bin/evalation-scan");

const SCAN = join(__dirname, "..", "bin", "evalation-scan");

function tree(files) {
  const at = repository();
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(at, path, ".."), { recursive: true });
    writeFileSync(join(at, path), text);
  }
  execFileSync("git", ["-C", at, "add", "-A"]);
  execFileSync("git", ["-C", at, "-c", "user.email=check@example.com", "-c", "user.name=check", "commit", "-qm", "locks"]);
  return at;
}

const pkg = (name, version, ...held) => ({ ID: `${name}@${version}`, Name: name, Version: version, Relationship: "direct", ...(held.length ? { Licenses: held } : {}) });
const result = (target, type, packages) => ({ Class: "lang-pkgs", Target: target, Type: type, Packages: packages });
const trivy = (...results) => JSON.stringify({ Results: results });
const sent = (said) => said.send.map((one) => `${one.system} ${one.name} ${one.version}`).sort();

const NPM_LOCK = JSON.stringify({ lockfileVersion: 3, packages: {
  "": { name: "app" },
  "node_modules/left-pad": { version: "1.3.0", resolved: "https://registry.npmjs.org/left-pad/-/left-pad-1.3.0.tgz" },
  "node_modules/@acme/billing": { version: "2.0.0", resolved: "https://npm.acme.internal/@acme/billing/-/billing-2.0.0.tgz" },
  "node_modules/from-git": { version: "0.1.0", resolved: "git+ssh://git@github.com/acme/from-git.git#abc" },
  "node_modules/linked": { version: "1.0.0", link: true },
} });

test("only packages the public registry serves are offered for lookup, and only where no licence was read", () => {
  const at = tree({
    "package-lock.json": NPM_LOCK,
    "requirements.txt": "requests==2.31.0\nPyYAML==6.0.1\n",
    "Cargo.lock": "[[package]]\nname = \"serde\"\nversion = \"1.0.0\"\nsource = \"registry+https://github.com/rust-lang/crates.io-index\"\n\n[[package]]\nname = \"inhouse\"\nversion = \"0.2.0\"\nsource = \"git+https://github.com/acme/inhouse#abc\"\n",
  });
  const out = trivy(
    result("package-lock.json", "npm", [pkg("left-pad", "1.3.0"), pkg("@acme/billing", "2.0.0"), pkg("from-git", "0.1.0"), pkg("linked", "1.0.0"), pkg("read-already", "1.0.0", "MIT")]),
    result("requirements.txt", "pip", [pkg("requests", "2.31.0"), pkg("PyYAML", "6.0.1")]),
  );
  const crates = [{ Class: "lang-pkgs", Target: "Cargo.lock", Type: "cargo", Packages: [pkg("serde", "1.0.0"), pkg("inhouse", "0.2.0")], Unread: ["serde 1.0.0", "inhouse 0.2.0"] }];
  const said = candidates(out, at, crates);
  assert.deepStrictEqual(sent(said), ["cargo serde 1.0.0", "npm left-pad 1.3.0", "pypi pyyaml 6.0.1", "pypi requests 2.31.0"]);
  assert.ok(!JSON.stringify(said.send).includes("acme"), "a private package's name never reaches the list");
});

test("a lockfile reading from a private index or registry offers nothing", () => {
  const at = tree({
    "requirements.txt": "--index-url https://pypi.acme.internal/simple\nrequests==2.31.0\n",
    "web/package-lock.json": NPM_LOCK,
    "web/.npmrc": "registry=https://npm.acme.internal/\n",
    "poetry.lock": "[[package]]\nname = \"httpx\"\nversion = \"0.27.0\"\n\n[[package]]\nname = \"secret-sdk\"\nversion = \"1.0.0\"\n\n[package.source]\ntype = \"legacy\"\nurl = \"https://pypi.acme.internal/simple\"\nreference = \"acme\"\n",
  });
  const out = trivy(
    result("requirements.txt", "pip", [pkg("requests", "2.31.0")]),
    result("web/package-lock.json", "npm", [pkg("left-pad", "1.3.0")]),
    result("poetry.lock", "poetry", [pkg("httpx", "0.27.0"), pkg("secret-sdk", "1.0.0")]),
  );
  assert.deepStrictEqual(sent(candidates(out, at, [])), ["pypi httpx 0.27.0"]);
});

test("a lookup asks deps.dev for each package by name and version, spelled as the registry spells it", () => {
  assert.strictEqual(urlOf({ system: "npm", name: "@types/node", version: "20.1.0" }), "https://api.deps.dev/v3/systems/npm/packages/%40types%2Fnode/versions/20.1.0");
  assert.strictEqual(urlOf({ system: "pypi", name: "pyyaml", version: "6.0.1" }), "https://api.deps.dev/v3/systems/pypi/packages/pyyaml/versions/6.0.1");
});

test("a lookup reads each licence deps.dev answers, and a package it does not know stays unread", async () => {
  const asked = [];
  const server = http.createServer((req, res) => {
    asked.push(req.url);
    if (req.url.includes("left-pad")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ licenses: ["WTFPL"] }));
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const answers = await lookUp([{ system: "npm", name: "left-pad", version: "1.3.0", lockfile: "package-lock.json" },
      { system: "npm", name: "gone", version: "9.9.9", lockfile: "package-lock.json" }], { base });
    assert.deepStrictEqual(answers.map((one) => one.licences), [["WTFPL"], null]);
    assert.strictEqual(asked.length, 2);
  } finally {
    server.close();
  }
});

test("licences looked up are rated as installed ones are, and the packages they cover are no longer unread", () => {
  const out = trivy(result("requirements.txt", "pip", [pkg("requests", "2.31.0"), pkg("gpl-thing", "1.0.0")]));
  const before = licences(out, ["requirements.txt"]);
  assert.deepStrictEqual(before.unread, ["requirements.txt"]);
  const after = licences(out, ["requirements.txt"], [], [
    { system: "pypi", name: "requests", version: "2.31.0", lockfile: "requirements.txt", licences: ["Apache-2.0"] },
    { system: "pypi", name: "gpl-thing", version: "1.0.0", lockfile: "requirements.txt", licences: ["GPL-3.0"] },
  ]);
  assert.deepStrictEqual(after.unread, []);
  assert.strictEqual(after.findings.find((one) => one.key === "licence:restricted").severity, "high");
});

test("a scan sends nothing unless the person agreed to the list it is handed", () => {
  const at = tree({ "requirements.txt": "requests==2.31.0\n" });
  const marker = join(mkdtempSync(join(tmpdir(), "evalation-lookup-")), "asked");
  const env = { ...process.env, EVALATION_LOOKUP_CMD: `${process.execPath} ${join(__dirname, "fake-lookup.js")} ${marker}` };
  const out = trivy(result("requirements.txt", "pip", [pkg("requests", "2.31.0")]));
  const read = adapterFor("licence", "trivy").read;
  const saved = process.env.EVALATION_LOOKUP_CMD;
  process.env.EVALATION_LOOKUP_CMD = env.EVALATION_LOOKUP_CMD;
  try {
    read(out, at, {});
    assert.ok(!existsSync(marker), "no list, no lookup");
    const list = join(mkdtempSync(join(tmpdir(), "evalation-list-")), "list.json");
    writeFileSync(list, JSON.stringify([{ system: "pypi", name: "requests", version: "2.31.0", lockfile: "requirements.txt" }]));
    const said = read(out, at, { lookup: list });
    assert.deepStrictEqual(JSON.parse(readFileSync(marker, "utf8")).map((one) => one.name), ["requests"]);
    assert.strictEqual(said.skipped, undefined);
    assert.match(said.looked_up, /1 package/);
  } finally {
    if (saved === undefined) delete process.env.EVALATION_LOOKUP_CMD;
    else process.env.EVALATION_LOOKUP_CMD = saved;
  }
});

test("the lookup question shows a short list in the reply, a long one in a file, and says what is and isn't sent", () => {
  const { asked } = require("../lib/lookup.js");
  const home = mkdtempSync(join(tmpdir(), "evalation-home-"));
  const few = asked([{ system: "pypi", name: "requests", version: "2.31.0", lockfile: "requirements.txt" },
    { system: "npm", name: "left-pad", version: "1.3.0", lockfile: "package-lock.json" }], home);
  assert.match(few.said, /requests 2\.31\.0/);
  assert.match(few.said, /deps\.dev/);
  assert.match(few.said, /No code, file names or repository details/);
  assert.strictEqual(few.asks.questions[0].options.length, 2);
  assert.ok(existsSync(few.list));
  const many = asked(Array.from({ length: 30 }, (_, at) => ({ system: "npm", name: `pkg-${at}`, version: "1.0.0", lockfile: "package-lock.json" })), home);
  assert.doesNotMatch(many.said, /pkg-29/);
  assert.match(many.said, /file:\/\//);
  assert.match(readFileSync(many.shown, "utf8"), /pkg-29 1\.0\.0/);
  assert.strictEqual(many.asks.questions[0].options.length, 3);
});

test("the open verb opens only a file the plugin wrote", () => {
  const refused = spawnSync(process.execPath, [SCAN, "open", "/etc/hosts"], { encoding: "utf8", env: { ...process.env, EVALATION_OPEN_CMD: "true" } });
  assert.notStrictEqual(refused.status, 0);
});
