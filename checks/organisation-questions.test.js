"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository } = require("./fixture.js");

const commit = (name, address, count = 1) => Array.from({ length: count }, () => ({ name, address }));
const HISTORY = [
  ...commit("Sam Lee", "sam@acme.io", 40),
  ...commit("Sam Lee", "sam.lee@gmail.com", 3),
  ...commit("Ana Ruiz", "ana@eng.acme.io", 12),
  ...commit("Kim Tan", "kim@contractors.dev", 7),
  ...commit("Kim Tan", "kim.tan@gmail.com", 2),
  ...commit("Jo Park", "1234+jopark@users.noreply.github.com", 5),
  ...commit("dependabot[bot]", "49699333+dependabot[bot]@users.noreply.github.com", 9),
];

test("every person with no commit address at a company domain is named, with addresses and commit count", () => {
  const { outsiders } = require("../bin/evalation-scan");
  const found = outsiders(HISTORY, ["acme.io"]);
  assert.strictEqual(found.key, "history:outside-contributors");
  assert.deepStrictEqual(found.people.map((one) => one.name).sort(), ["Jo Park", "Kim Tan"]);
  const kim = found.people.find((one) => one.name === "Kim Tan");
  assert.deepStrictEqual(kim.addresses.sort(), ["kim.tan@gmail.com", "kim@contractors.dev"]);
  assert.strictEqual(kim.commits, 9);
  const jo = found.people.find((one) => one.name === "Jo Park");
  assert.match(jo.why, /private address/);
  assert.strictEqual(outsiders(HISTORY, ["acme.io", "contractors.dev", "github.com"]).people.map((one) => one.name).join(), "Jo Park",
    "a code host's private address never makes somebody staff");
  assert.strictEqual(outsiders(commit("Sam Lee", "sam@acme.io", 3), ["acme.io"]), null);
});

test("the domains offered are the history's own, with how many people use each, and never a public or private one", () => {
  const { domainChoices } = require("../bin/evalation-scan");
  const offered = domainChoices(HISTORY, "anna@acme.io");
  assert.deepStrictEqual(offered.map((one) => one.domain), ["acme.io", "eng.acme.io", "contractors.dev"]);
  assert.match(offered[0].description, /sign-in/i);
  assert.match(offered[1].description, /1 person/);
  assert.ok(!offered.some((one) => /gmail|noreply/.test(one.domain)));
});

test("the run asks for the company's domains with a question from the catalogue, only where a chosen pack is raised by the rule", () => {
  const tree = repository();
  for (const [name, email] of [["Sam", "sam@acme.io"], ["Kim", "kim@contractors.dev"], ["Jo", "jo@gmail.com"]]) {
    writeFileSync(join(tree, `${name}.txt`), name);
    execFileSync("git", ["-C", tree, "add", "-A"]);
    execFileSync("git", ["-C", tree, "-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-qm", name]);
  }
  const asked = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-scan"), "domains", tree], { encoding: "utf8" });
  assert.strictEqual(asked.status, 0, asked.stderr);
  const question = JSON.parse(asked.stdout).asks.questions[0];
  assert.strictEqual(question.question, require("../lib/say.js").entries()["ev-run.domains"].ask);
  assert.ok(question.multiSelect);
  const labels = question.options.map((one) => one.label);
  assert.ok(labels.includes("acme.io") && labels.includes("contractors.dev") && !labels.includes("gmail.com"));

  const { phasesRead } = require("../lib/scans.js");
  const raised = [{ kind: "standard", entries: [{ identifier: "INV41", bears_on: "organisation", raised_by: ["history:outside-contributors"] }] }];
  assert.deepStrictEqual(phasesRead(raised), ["history"]);
  const { scanFor } = require("../bin/evalation-run");
  assert.strictEqual(scanFor([{ pack: "investment", body: raised[0] }]).asks_domains, true);
  assert.strictEqual(scanFor([{ pack: "soc2", body: { kind: "standard", entries: [] } }]).asks_domains, false);

  const { scan } = require("../bin/evalation-scan");
  const held = scan(tree, ["history"], { domains: ["acme.io"] }).document;
  const found = held.findings.find((one) => one.key === "history:outside-contributors");
  assert.deepStrictEqual(found.people.map((one) => one.name).sort(), ["Jo", "Kim", "check"], "the fixture's first commit is from example.com");
  assert.ok(held.phases.find((one) => one.phase === "history").measures.includes("history:outside-contributors"));
  const without = scan(tree, ["history"]).document.phases.find((one) => one.phase === "history");
  assert.ok(!without.measures.includes("history:outside-contributors"), "without the company's domains the rule is not measured");
});

test("a history with no company domain to offer asks the person to type theirs", () => {
  const tree = mkdtempSync(join(tmpdir(), "no-domains-"));
  execFileSync("git", ["-C", tree, "init", "-q"]);
  for (const [name, email] of [["Sam", "sam@gmail.com"], ["Jo", "1234+jo@users.noreply.github.com"]]) {
    writeFileSync(join(tree, `${name}.txt`), name);
    execFileSync("git", ["-C", tree, "add", "-A"]);
    execFileSync("git", ["-C", tree, "-c", `user.name=${name}`, "-c", `user.email=${email}`, "commit", "-qm", name]);
  }
  const home = mkdtempSync(join(tmpdir(), "no-domains-home-"));
  const asked = spawnSync(process.execPath, [join(__dirname, "..", "bin", "evalation-scan"), "domains", tree],
    { encoding: "utf8", env: { ...process.env, HOME: home } });
  assert.strictEqual(asked.status, 0, asked.stderr);
  const answer = JSON.parse(asked.stdout);
  assert.strictEqual(answer.asks, null);
  assert.strictEqual(answer.said, require("../lib/say.js").entries()["ev-run.domains-type"].say);
});

const raisedPack = (rules) => ({ pack: "investment", kind: "standard", selected: ["INV40", "INV41"], entries_asked: [
  { identifier: "INV40", title: "Tests", bears_on: "repository", looks_for: [{ find: "Tests", proof: "runs" }] },
  { identifier: "INV41", title: "Rights in the code", intent: "Has each outside contributor assigned their rights in the code to the company?", bears_on: "organisation", raised_by: rules },
] });
const answers = () => [
  { pack: "investment", entry: "INV40", status: "covered", because: "Tests run." },
  { pack: "investment", entry: "INV41", status: "org-level", from: "authored", because: "x", justification: "y", raised_by: ["history:outside-contributors"] },
];

test("an entry a rule raises is printed with what fired, and left off where nothing fired", () => {
  const { raise } = require("../bin/evalation-findings");
  const person = { name: "Kim Tan", addresses: ["kim@contractors.dev"], commits: 9 };
  const fired = { at: "2026-09-30T00:00:00Z", phases: [{ phase: "history", ran: true, measures: ["history:outside-contributors"] }],
    findings: [{ key: "history:outside-contributors", phase: "history", severity: "low", people: [person] }] };
  const document = { packs: [raisedPack(["history:outside-contributors"])], answers: answers() };
  raise(document, fired);
  assert.deepStrictEqual(document.answers.find((one) => one.entry === "INV41").raised, [{ person }]);

  const quiet = { ...fired, findings: [] };
  const left = { packs: [raisedPack(["history:outside-contributors"])], answers: answers() };
  raise(left, quiet);
  assert.deepStrictEqual(left.answers.map((one) => one.entry), ["INV40"]);
  assert.deepStrictEqual(left.packs[0].selected, ["INV40"]);
  assert.deepStrictEqual(left.packs[0].entries_asked.map((one) => one.identifier), ["INV40"]);

  const unmeasured = { packs: [raisedPack(["history:outside-contributors"])], answers: answers() };
  raise(unmeasured, { ...quiet, phases: [{ phase: "history", ran: true, measures: ["history:releases"] }] });
  assert.match(unmeasured.answers.find((one) => one.entry === "INV41").because, /not checked/i);

  const licence = { packs: [raisedPack(["licence:restricted", "licence:unknown"])], answers: answers() };
  raise(licence, { at: "x", phases: [{ phase: "licence", ran: true, measures: ["licence:restricted", "licence:unknown"] }],
    findings: [{ key: "licence:restricted", phase: "licence", severity: "high", packages: [{ name: "a", version: "1.0.0", licence: "GPL-3.0" }] }] });
  assert.deepStrictEqual(licence.answers.find((one) => one.entry === "INV41").raised, [{ package: { name: "a", version: "1.0.0", licence: "GPL-3.0" } }]);
});

test("the evidence pack lists who fired, says on its first page that it names people, and the hand-over says so", () => {
  const { page, said } = require("../bin/evalation-report");
  const document = { run: "r", target: { repository: "acme/app" }, packs: [raisedPack(["history:outside-contributors"])],
    answers: answers().map((one) => (one.entry === "INV41" ? { ...one, raised: [
      { person: { name: "Kim Tan", addresses: ["kim@contractors.dev", "kim.tan@gmail.com"], commits: 9 } },
      { person: { name: "Jo Park", addresses: ["1234+jopark@users.noreply.github.com"], commits: 5, why: "commits only through a code host's private address, so cannot be shown to be staff" } },
    ] } : one)) };
  const asked = new Map(document.packs[0].entries_asked.map((one) => [`investment/${one.identifier}`, one]));
  const html = page(document, document.answers, asked);
  assert.match(html, /Kim Tan/);
  assert.match(html, /kim@contractors\.dev, kim\.tan@gmail\.com/);
  assert.match(html, /9 commits/);
  assert.match(html, /cannot be shown to be staff/);
  assert.match(html, /This report names the people who committed to the repository/);
  assert.match(said([{ printed: true, written: "x.pdf", names_people: true }], "/f"),
    /This report names the people who committed to the repository\. Check who you share it with\./);
  assert.doesNotMatch(said([{ printed: true, written: "x.pdf" }], "/f"), /names the people/);
});
