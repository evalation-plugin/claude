"use strict";

const { execFileSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const home = mkdtempSync(join(tmpdir(), "evalation-home-"));
process.env.EVALATION_PLUGIN_HOME = home;
process.env.EVALATION_SPELLING = process.env.EVALATION_SPELLING || "commonwealth";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });

function engine() {
  const printer = require("../lib/engine.js");
  const shared = join(tmpdir(), "evalation-checks-print-engine");
  const lock = join(shared, "installing");
  mkdirSync(join(shared, "print-engine"), { recursive: true });
  try {
    symlinkSync(join(shared, "print-engine"), join(home, "print-engine"), "junction");
  } catch (thrown) {
    if (thrown.code !== "EEXIST") throw thrown;
  }
  while (!printer.ready()) {
    try {
      mkdirSync(lock);
    } catch (thrown) {
      if (thrown.code !== "EEXIST") throw thrown;
      if (Date.now() - statSync(lock).mtimeMs > 600_000) rmSync(lock, { recursive: true, force: true });
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
      continue;
    }
    try {
      const done = JSON.parse(execFileSync(process.execPath, [join(__dirname, "..", "bin", "evalation-print-engine"), "install"], {
        encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: shared },
      }));
      if (!done.ready) throw new Error(done.said);
    } finally {
      rmSync(lock, { recursive: true, force: true });
    }
  }
  return printer.executable();
}

function repository(at = mkdtempSync(join(tmpdir(), "evalation-tree-"))) {
  mkdirSync(join(at, "src"), { recursive: true });
  writeFileSync(join(at, "src", "auth.js"), [
    "export function guard(req) {",
    "  if (!req.session) throw new Error(\"signed out\");",
    "  return req.session.user;",
    "}",
    "",
  ].join("\n"));
  writeFileSync(join(at, "README.md"), "# app\n");
  writeFileSync(join(at, "package.json"), "{ \"name\": \"app\" }\n");
  git(at, "init", "-q", "-b", "main");
  git(at, "add", "-A");
  git(at, "-c", "user.email=check@example.com", "-c", "user.name=check", "commit", "-qm", "one");
  return at;
}

function scanned(tree, findings, at = "2026-09-25T00:00:00.000Z") {
  mkdirSync(join(home, "scans"), { recursive: true });
  writeFileSync(join(home, "scans", `${at.replace(/[:.]/g, "-")}.json`), JSON.stringify({
    target: { path: tree }, at,
    phases: ["sca", "sast", "secret", "history"].map((phase) => ({ phase, ran: true, measures: [phase] })),
    findings,
  }));
}

const RUNS = { find: "A shared check every protected route passes through", proof: "runs" };
const WRITTEN = { find: "Written restore steps", proof: "written" };
const DEPENDENCIES = { find: "No known critical or high advisories in the pinned dependencies", proof: "scan", phase: "sca", at_least: "high" };

function run(tree) {
  return {
    run: "run-check", at: "2026-09-24T00:00:00.000Z", revision: "1.80", read_by: "Opus 5.5",
    target: { repository: "acme/app", path: tree },
    packs: [
      {
        pack: "soc2", kind: "standard", title: "SOC 2 Trust Services Criteria", selected: ["CC6.1", "CC1.1"],
        entries_asked: [
          { identifier: "CC6.1", title: "Logical access", intent: "How does this repository restrict access?", looks_for: [RUNS, WRITTEN], bears_on: "repository" },
          { identifier: "CC1.1", title: "Integrity and ethical values", intent: "Where is conduct written down?", bears_on: "organisation" },
        ],
      },
      {
        pack: "hardening", kind: "concern-set", title: "Evalation Hardening Review", selected: ["SEC01"],
        entries_asked: [
          { identifier: "SEC01", title: "Untrusted input", intent: "Where can input reach an interpreter?",
            looks_for: [{ ...RUNS, severity: "critical" }, { ...DEPENDENCIES, severity: "high" }] },
        ],
      },
    ],
    answers: [
      { pack: "soc2", entry: "CC6.1", status: "partial-gap", because: "A guard exists and no restore steps are written.",
        remedy: "Write the restore steps.", looked_for: [found(), missing()] },
      { pack: "soc2", entry: "CC1.1", status: "org-level", from: "authored", because: "The pack answers it.", justification: "No repository records conduct." },
    ],
    findings: [],
    accounted: [
      { pack: "hardening", concern: "SEC01", because: "Read the guard and the scan.", looked_for: [found(), { result: "found" }] },
    ],
  };
}

function found() {
  return { result: "found", evidence: [{ path: "src/auth.js", from: 1, to: 2, quote: "if (!req.session)", grade: "executable" }] };
}

function missing() {
  return { result: "missing", searched: "Looked in docs and scripts for restore steps and found none." };
}

module.exports = { engine, found, home, missing, repository, run, scanned };
