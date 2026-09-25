// What a reading can see: every file the repository tracks, lockfiles and agent settings among them,
// and a scan phase only where something asks for it.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { repository } = require("./fixture.js");
const { filesOf } = require("../lib/tree.js");
const { phasesRead } = require("../lib/scans.js");

const READ = join(__dirname, "..", "bin", "evalation-read");

function tree() {
  const at = repository();
  mkdirSync(join(at, ".claude", "skills", "review"), { recursive: true });
  writeFileSync(join(at, ".claude", "skills", "review", "SKILL.md"), "# Review\nRead the diff.\n");
  mkdirSync(join(at, "services"));
  writeFileSync(join(at, "services", "Cargo.lock"), "[[package]]\nname = \"quinn-proto\"\nversion = \"0.11.14\"\n");
  writeFileSync(join(at, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x71, 0x75, 0x69, 0x6e, 0x6e]));
  execFileSync("git", ["-C", at, "add", "-A"]);
  execFileSync("git", ["-C", at, "-c", "user.email=check@example.com", "-c", "user.name=check", "commit", "-qm", "more"]);
  return at;
}

test("files the repository tracks under .claude are part of it", () => {
  const at = tree();
  assert.ok(filesOf(at).some((one) => one.endsWith(join(".claude", "skills", "review", "SKILL.md"))));
});

test("a search finds a package in a lockfile, and passes binary files by", () => {
  const at = tree();
  const said = execFileSync(READ, [at, "search", "quinn"], { encoding: "utf8" });
  assert.match(said, /services\/Cargo\.lock:2:/);
  assert.doesNotMatch(said, /logo\.png/);
});

test("a concern set runs git history only where one of its items asks for it", () => {
  const concerns = (looks) => [{ kind: "concern-set", entries: [{ looks_for: looks }] }];
  assert.ok(!phasesRead(concerns([{ proof: "runs" }])).includes("history"));
  assert.ok(phasesRead(concerns([{ proof: "scan", phase: "history", rule: "history:releases" }])).includes("history"));
  assert.ok(phasesRead(concerns([{ proof: "runs" }])).includes("sca"));
});
