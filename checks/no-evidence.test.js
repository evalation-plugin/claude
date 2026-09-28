"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { found, missing, repository, run, scanned } = require("./fixture.js");
const { checked } = require("../bin/evalation-findings");
const { page } = require("../bin/evalation-report");
const { map } = require("../bin/evalation-read");
const { infrastructureIn } = require("../lib/infrastructure.js");

const ELSEWHERE = { find: "Databases and caches with no public address", proof: "runs", needs: "infrastructure" };
const CODE = { find: "A shared check every protected route passes through", proof: "runs" };

function committed(tree, files) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(tree, path, ".."), { recursive: true });
    writeFileSync(join(tree, path), text);
  }
  execFileSync("git", ["add", "-A"], { cwd: tree, stdio: "ignore" });
  execFileSync("git", ["-c", "user.email=check@example.com", "-c", "user.name=check", "commit", "-qm", "more"], { cwd: tree, stdio: "ignore" });
  return tree;
}

function asking(tree, rows, status) {
  const document = run(tree);
  document.packs[0].entries_asked[0].looks_for = [CODE, ELSEWHERE];
  document.answers[0].looked_for = rows;
  document.answers[0].status = status;
  return document;
}

const about = (said) => said.filter((one) => one.startsWith("soc2/CC6.1"));

const bare = repository();
scanned(bare, []);

test("infrastructure code is found by what the files are, and a compose file for local work is none", () => {
  assert.deepStrictEqual(infrastructureIn(bare), []);
  const held = committed(repository(), {
    "infra/main.tf": "resource \"aws_db_instance\" \"db\" {}\n",
    "deploy/stack.yaml": "AWSTemplateFormatVersion: \"2010-09-09\"\nResources: {}\n",
    "k8s/web.yaml": "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n",
    "docker-compose.yml": "services:\n  db:\n    image: postgres\n",
    "config/app.yaml": "name: app\nport: 3000\n",
  });
  assert.deepStrictEqual(infrastructureIn(held), ["deploy/stack.yaml", "infra/main.tf", "k8s/web.yaml"]);
});

test("with no infrastructure code, an item that could be held elsewhere is no evidence found, and the status leaves it out", () => {
  assert.deepStrictEqual(about(checked(asking(bare, [found(), { result: "no-evidence" }], "covered"), bare)), []);
  assert.deepStrictEqual(about(checked(asking(bare, [found(), missing()], "partial-gap"), bare)), [
    "soc2/CC6.1 item 2: missing, and no infrastructure code was found in what this run read, so it is found in the code or no-evidence",
  ]);
});

test("with no infrastructure code, an item the code itself shows is still found", () => {
  assert.deepStrictEqual(about(checked(asking(bare, [found(), found()], "covered"), bare)), []);
});

test("an item the code should hold is never no evidence found", () => {
  assert.deepStrictEqual(about(checked(asking(bare, [{ result: "no-evidence" }, { result: "no-evidence" }], "no-evidence"), bare)), [
    "soc2/CC6.1 item 1: no-evidence, which only an item the pack marks as possibly held outside the code can be",
  ]);
});

test("with infrastructure code present, the item is answered from it like any other", () => {
  const held = committed(repository(), { "infra/main.tf": "resource \"aws_db_instance\" \"db\" {}\n" });
  scanned(held, []);
  assert.deepStrictEqual(about(checked(asking(held, [found(), { result: "no-evidence" }], "covered"), held)), [
    "soc2/CC6.1 item 2: no-evidence, and this run read infrastructure code (infra/main.tf), so answer it from that code",
  ]);
  assert.deepStrictEqual(about(checked(asking(held, [found(), missing()], "partial-gap"), held)), []);
});

test("an entry whose every item is no evidence found carries that status, never not applicable", () => {
  const document = asking(bare, [{ result: "does-not-apply", why: "No routes." }, { result: "no-evidence" }], "not-applicable");
  document.answers[0].justification = "No routes are served.";
  assert.deepStrictEqual(about(checked(document, bare)), [
    "soc2/CC6.1: not-applicable, and it found 0 of the 0 items that apply, with 1 held to no evidence found, which makes it no-evidence",
  ]);
  document.answers[0].status = "no-evidence";
  assert.deepStrictEqual(about(checked(document, bare)), []);
});

test("the report prints no evidence found beside the item and in the key", () => {
  const document = asking(bare, [found(), { result: "no-evidence" }], "covered");
  const asked = new Map(document.packs[0].entries_asked.map((one) => [`soc2/${one.identifier}`, one]));
  const html = page(document, document.answers.filter((one) => one.pack === "soc2"), asked);
  assert.match(html, /no evidence found/);
  assert.match(html, /No evidence found/);
});

test("the reader's map says whether infrastructure code was found", () => {
  assert.match(map(bare), /infrastructure code: none found/);
  const held = committed(repository(), { "infra/main.tf": "resource \"aws_db_instance\" \"db\" {}\n" });
  assert.match(map(held), /infrastructure code:\n {2}infra\/main\.tf/);
});
