"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository } = require("./fixture.js");

const READ = join(__dirname, "..", "bin", "evalation-read");
const commit = (at, message) => {
  execFileSync("git", ["-C", at, "add", "-A"]);
  execFileSync("git", ["-C", at, "-c", "user.email=check@example.com", "-c", "user.name=check", "commit", "-qm", message]);
};
const asked = (...args) => spawnSync(process.execPath, [READ, ...args], { encoding: "utf8" });

test("history names each commit that changed a file and the other files each one changed", () => {
  const at = repository();
  writeFileSync(join(at, "src", "auth.js"), "export function guard() { return null; }\n");
  writeFileSync(join(at, "README.md"), "# app\n\nThe guard returns null when signed out.\n");
  commit(at, "Guard returns null, and the README says so");
  writeFileSync(join(at, "package.json"), "{ \"name\": \"app\", \"version\": \"2\" }\n");
  commit(at, "Version two");

  const said = asked(at, "history", "src/auth.js");
  assert.strictEqual(said.status, 0, said.stderr);
  assert.match(said.stdout, /Guard returns null, and the README says so/);
  assert.match(said.stdout, /README\.md/);
  assert.match(said.stdout, /\bone\b/);
  assert.doesNotMatch(said.stdout, /Version two/);
  assert.match(said.stdout, /REPOSITORY-CONTENT/);
  assert.match(asked(at, "help").stdout, /history <path>/);
});

test("history says plainly where a tree keeps no git history, and refuses a path outside the tree", () => {
  const bare = mkdtempSync(join(tmpdir(), "evalation-nogit-"));
  writeFileSync(join(bare, "a.txt"), "a\n");
  const none = asked(bare, "history", "a.txt");
  assert.strictEqual(none.status, 0, none.stderr);
  assert.match(none.stdout, /no git history/);

  const outside = asked(repository(), "history", "../elsewhere.txt");
  assert.notStrictEqual(outside.status, 0);
  assert.match(outside.stderr, /outside the tree being read/);

  const missing = asked(repository(), "history");
  assert.notStrictEqual(missing.status, 0);
});
