// Authorship in git history, measured and never judged: how concentrated the last twelve months of
// commits are in one person, as shares with no name or address kept.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository } = require("./fixture.js");
const { authorship, scan } = require("../bin/evalation-scan");
const { phasesRead } = require("../lib/scans.js");

const log = (counts) => Object.entries(counts).flatMap(([who, n]) => Array(n).fill(who)).join("\n");

test("one person making most of a year's commits is a finding, with the share and no name", () => {
  const found = authorship(log({ "a@x.io": 8, "b@x.io": 2 }));
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].severity, "high");
  assert.match(found[0].body, /the most active person made 80% of them, across 2 people/);
  assert.doesNotMatch(JSON.stringify(found), /x\.io/);
});

test("a history spread across people finds nothing, and a bare majority is medium", () => {
  assert.deepStrictEqual(authorship(log({ a: 3, b: 3, c: 2, d: 2 })), []);
  assert.strictEqual(authorship(log({ a: 6, b: 4 }))[0].severity, "medium");
});

test("commits a code host's bot account made are not counted as a person's", () => {
  const found = authorship(log({ "a@x.io": 7, "49699333+dependabot[bot]@users.noreply.github.com": 3 }));
  assert.strictEqual(found[0].severity, "high");
  assert.match(found[0].body, /Of 7 commits/);
  assert.match(found[0].title, /one person/);
});

test("a bot named as one in its author name or address is not counted as a person", () => {
  const found = authorship(log({ "a\x1fa@x.io": 6, "Renovate Bot\x1fbot@renovateapp.com": 3,
"github-actions\x1f41898282+github-actions[bot]@users.noreply.github.com": 2, "deploy-bot\x1fci@x.io": 2 }));
  assert.match(found[0].body, /Of 6 commits/);
  assert.match(found[0].title, /Every commit made by one person/);
});

test("one person committing from two addresses under one name is one person", () => {
  const found = authorship(log({ "sam\x1f35871900+sam@users.noreply.github.com": 386, "Sam\x1fsam@gmail.com": 2 }));
  assert.match(found[0].title, /Every commit made by one person/);
  assert.match(found[0].body, /made 100% of them, across 1 person/);
});

test("people sharing no name or address stay separate, and a bare address still counts", () => {
  const found = authorship(log({ "a\x1fa@x.io": 5, "b\x1fb@x.io": 5, "c@x.io": 5 }));
  assert.deepStrictEqual(found, []);
});

test("a scan of a checkout counts one person with two addresses once", () => {
  const tree = repository();
  for (const [name, email] of [["Sam", "sam@x.io"], ["Sam", "sam@home.io"], ["Renovate Bot", "bot@renovateapp.com"]]) {
    writeFileSync(join(tree, `${email}.txt`), email);
    execFileSync("git", ["-C", tree, "add", "-A"]);
    execFileSync("git", ["-C", tree, "-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-qm", email]);
  }
  const found = scan(tree, ["history"]).document.findings.find((one) => one.key === "history:concentration");
  assert.match(found.body, /Of 3 commits in the last twelve months, the most active person made 67% of them, across 2 people/);
});

test("an area resting on one person counts that person once across addresses, and leaves bots out", () => {
  const tree = repository();
  for (let n = 0; n < 12; n += 1) {
    const [name, email] = n >= 10 ? ["Renovate Bot", "bot@renovateapp.com"] : ["Sam", n % 2 ? "sam@x.io" : "sam@home.io"];
    writeFileSync(join(tree, "src", `f${n}.js`), String(n));
    execFileSync("git", ["-C", tree, "add", "-A"]);
    execFileSync("git", ["-C", tree, "-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-qm", String(n)]);
  }
  const area = scan(tree, ["history"]).document.findings.find((one) => one.key === "history:area:src");
  assert.match(area.body, /Of 11 commits to src in the last twelve months, one person made 91% of them/);
});

test("a single author is high, and a year with no commits says so", () => {
  assert.match(authorship(log({ a: 5 }))[0].title, /one person/);
  assert.match(authorship("")[0].body, /No commits/);
});

test("a history card says how to spread the work, never to change code", () => {
  const { scanResults } = require("../lib/sheet.js");
  const scans = require("../lib/scans.js");
  const { consequences, remedies } = require("../lib/weaknesses.js");
  const html = scanResults({ findings: authorship(log({ a: 9, b: 1 })), intro: "x", tagWord: "", tagOf: () => [],
    phaseOf: scans.named, consequences, remedies, upgradeTo: scans.upgradeTo, compared: scans.compared,
    compatible: scans.compatible, cardOf: scans.cardOf });
  const todo = html.match(/<b>What to do<\/b>([^<]*)/)[1];
  assert.match(todo, /second person/);
  assert.doesNotMatch(todo, /Change the code/);
});

test("the phase runs only for a pack whose items ask for it", () => {
  assert.deepStrictEqual(phasesRead([{ kind: "standard", entries: [{ looks_for: [{ proof: "scan", phase: "history", at_least: "medium" }] }] }]), ["history"]);
  assert.ok(!phasesRead([{ kind: "standard", entries: [{ looks_for: [{ proof: "runs" }] }] }]).includes("history"));
});

test("a scan of a checkout reads its history, and a folder with none says why", () => {
  const tree = repository();
  for (const [n, who] of [[1, "a@x.io"], [2, "a@x.io"], [3, "a@x.io"], [4, "b@x.io"]]) {
    writeFileSync(join(tree, `f${n}.txt`), String(n));
    execFileSync("git", ["-C", tree, "add", "-A"]);
    execFileSync("git", ["-C", tree, "-c", `user.email=${who}`, "-c", `user.name=${who}`, "commit", "-qm", String(n)]);
  }
  const held = scan(tree, ["history"]).document;
  const phase = held.phases.find((one) => one.phase === "history");
  assert.ok(phase.ran);
  assert.match(held.findings.find((one) => one.phase === "history").body, /the most active person made 60% of them/);

  const loose = mkdtempSync(join(tmpdir(), "evalation-loose-"));
  const none = scan(loose, ["history"]).document.phases.find((one) => one.phase === "history");
  assert.strictEqual(none.ran, false);
  assert.match(none.why, /no git history/);
});
