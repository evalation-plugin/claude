// Which files are the repository, and which repositories a folder holds.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { cpSync, mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository } = require("./fixture.js");
const { checkoutsIn, filesOf } = require("../lib/tree.js");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

function folder() {
  const at = mkdtempSync(join(tmpdir(), "evalation-folder-"));
  const app = repository(join(at, "app"));
  git(app, "remote", "add", "origin", "https://github.com/acme/app.git");
  git(app, "worktree", "add", "-q", join(at, "app-feature"), "-b", "feature");
  git(at, "clone", "-q", "--bare", app, join(at, "app.git"));
  cpSync(app, join(at, "copy"), { recursive: true, filter: (one) => !one.split("/").includes(".git") });
  mkdirSync(join(at, "hg", ".hg"), { recursive: true });
  writeFileSync(join(at, "hg", ".hg", "store"), "x");
  writeFileSync(join(at, "hg", "x.py"), "x");
  return at;
}

test("a folder of copies lists each repository, a plain copy with its checkout, and leaves out worktrees and bare clones", () => {
  const held = checkoutsIn(folder());
  const app = held.find((one) => one.repository === "acme/app");
  assert.deepStrictEqual(app.places.map((one) => one.path).sort(), ["app", "copy"]);
  assert.strictEqual(app.places.find((one) => one.path === "copy").copy_of, "app");
  assert.ok(held.some((one) => one.places[0].vcs === "Mercurial"));
  assert.ok(!held.some((one) => one.places.some((place) => place.path.startsWith("app-feature") || place.path === "app.git")));
});

test("a checkout holds no other repositories", () => {
  assert.strictEqual(checkoutsIn(repository()), null);
});

test("reading a folder whole takes each checkout's tracked files and no worktree or metadata", () => {
  const at = folder();
  const files = filesOf(at).map((one) => one.slice(at.length + 1)).sort();
  assert.deepStrictEqual(files, ["app/README.md", "app/package.json", "app/src/auth.js",
    "copy/README.md", "copy/package.json", "copy/src/auth.js", "hg/x.py"].sort());
});
