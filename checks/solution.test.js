"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run } = require("./fixture.js");
const { page } = require("../bin/evalation-report");
const { scan } = require("../bin/evalation-scan");
const { filesOf, inRepository } = require("../lib/tree.js");
const { choose, placeOf, shownPath, solutionOf } = require("../lib/solution.js");
const { target } = require("../bin/evalation-run");
const { map } = require("../bin/evalation-read");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore" });
const commit = (cwd, message, when) => git(cwd, "-c", "user.email=check@example.com", "-c", "user.name=check",
  "commit", "-q", "--allow-empty", "-m", message, ...(when ? ["--date", when] : []));

function solution() {
  const at = mkdtempSync(join(tmpdir(), "evalation-solution-"));
  const api = repository(join(at, "api"));
  git(api, "remote", "add", "origin", "git@github.com:acme/api.git");
  commit(api, "newest");
  const older = repository(join(at, "api-old"));
  git(older, "remote", "add", "origin", "https://github.com/acme/api.git");
  git(older, "checkout", "-q", "-b", "feature");
  cpSync(api, join(at, "api-copy"), { recursive: true, filter: (one) => !one.split(/[\\/]/).includes(".git") });
  const infra = repository(join(at, "infra"));
  git(infra, "remote", "add", "origin", "https://github.com/acme/infra.git");
  writeFileSync(join(infra, "main.tf"), "resource \"aws_db_instance\" \"db\" {}\n");
  git(infra, "add", "-A");
  commit(infra, "network");
  mkdirSync(join(at, "notes"));
  writeFileSync(join(at, "notes", "runbook.md"), "# Restore\n");
  return at;
}

test("a solution reads one instance of each repository and never a copy or a second clone", () => {
  const at = solution();
  const held = solutionOf(at);
  assert.deepStrictEqual(held.repositories.map((one) => [one.folder, one.repository]),
    [["api", "acme/api"], ["infra", "acme/infra"], ["notes", "notes"]]);
  assert.deepStrictEqual(held.left_out.map((one) => [one.folder, one.why]), [
    ["api-copy", "a copy of the folder \"api\" with no version control"],
    ["api-old", "a second clone of acme/api, and the folder \"api\" is read in its place"],
  ]);
  const files = filesOf(at).map((one) => inRepository(at, one));
  assert.ok(files.includes("api/src/auth.js") && files.includes("infra/main.tf") && files.includes("notes/runbook.md"));
  assert.ok(!files.some((one) => one.startsWith("api-copy/") || one.startsWith("api-old/")));
});

test("a repository the customer leaves out is never read, and the name they give is the solution's", () => {
  const at = solution();
  choose(at, { name: "Acme platform", leave: ["notes"] });
  const held = solutionOf(at);
  assert.strictEqual(held.name, "Acme platform");
  assert.deepStrictEqual(held.repositories.map((one) => one.folder), ["api", "infra"]);
  assert.deepStrictEqual(held.left_out.find((one) => one.folder === "notes").why, "not chosen for this review");
  assert.ok(!filesOf(at).map((one) => inRepository(at, one)).some((one) => one.startsWith("notes/")));
});

test("the run's target names the solution and every repository with its branch and newest commit", () => {
  const at = solution();
  choose(at, { name: "Acme platform", leave: [] });
  const named = target(at);
  assert.strictEqual(named.kind, "solution");
  assert.strictEqual(named.repository, "Acme platform");
  const api = named.repositories.find((one) => one.folder === "api");
  assert.strictEqual(api.repository, "acme/api");
  assert.strictEqual(api.branch, "main");
  assert.match(api.head, /^[0-9a-f]{40}$/);
  assert.match(api.newest, /^\d{4}-\d{2}-\d{2}T/);
});

test("a single checkout stays a repository, as before", () => {
  const one = repository();
  assert.strictEqual(solutionOf(one), null);
  assert.strictEqual(target(one).kind, "directory");
});

test("an evidence path names the repository it sits in", () => {
  const at = solution();
  const named = target(at);
  assert.deepStrictEqual(placeOf(named, "infra/main.tf"), { repository: "acme/infra", path: "main.tf" });
  assert.deepStrictEqual(placeOf(target(repository()), "src/auth.js"), { repository: null, path: "src/auth.js" });
});

test("the evidence pack names the solution, lists every repository on its opening page, and names the repository on each evidence line", () => {
  const at = solution();
  choose(at, { name: "Acme platform", leave: [] });
  const document = run(at);
  document.target = target(at);
  document.answers[0].looked_for = [
    { result: "found", evidence: [{ path: "infra/main.tf", from: 1, to: 1, quote: "resource", grade: "configuration" }] },
    { result: "missing", searched: "Looked in api, infra and notes for restore steps and found none." },
  ];
  const asked = new Map(document.packs[0].entries_asked.map((one) => [`soc2/${one.identifier}`, one]));
  const html = page(document, document.answers.filter((one) => one.pack === "soc2"), asked);
  assert.match(html, /What this product evidences · Product: Acme platform/);
  assert.match(html, /together as one product, Acme platform\./);
  assert.match(html, /We read the 2 repositories of this product together/);
  assert.doesNotMatch(html, /solution|Solution/);
  assert.match(html, /Repositories read/);
  for (const name of ["acme/api", "acme/infra", "notes"]) assert.ok(html.includes(name), name);
  assert.match(html, /acme\/infra · main\.tf:1/);
  assert.match(html, /<ul class="repos"><li><b>acme\/api<\/b> · folder api · branch main · commit [0-9a-f]{7} · last changed [^<]+<\/li>/);
  assert.match(html, /<li><b>api-copy<\/b> · a copy of the folder (?:"|&quot;)api(?:"|&quot;) with no version control<\/li>/);
});

test("a folder with no version control is read for evidence and listed apart, never called a repository", () => {
  const { readBlock, readSlides } = require("../lib/solution.js");
  const at = solution();
  choose(at, { name: "Acme platform", leave: [] });
  const named = target(at);
  const block = readBlock(named);
  const [repositories, others] = block.split("Other folders (not under version control)");
  assert.ok(others, "the block has a heading of its own for folders with no version control");
  assert.match(repositories, /these 2 repositories/);
  assert.ok(!repositories.includes("<b>notes</b>"));
  assert.match(others, /<b>notes<\/b>/);
  assert.match(others, /read for evidence too, and hold no code history, so they are not repositories/);
  const pages = readSlides(named);
  const repositoriesRead = pages.filter((one) => one.title === "Repositories read").flatMap((one) => one.blocks);
  assert.deepStrictEqual(repositoriesRead.map((one) => one.headline), ["acme/api", "acme/infra"]);
  const other = pages.filter((one) => one.title === "Other folders (not under version control)").flatMap((one) => one.blocks);
  assert.deepStrictEqual(other.map((one) => one.headline), ["notes"]);
  assert.doesNotMatch(other[0].body, /repositor/);
});

test("folders are listed in alphabetical order of the names they are shown by, and a plain folder says what it holds", () => {
  const at = solution();
  const web = repository(join(at, "a-web"));
  git(web, "remote", "add", "origin", "https://github.com/acme/web.git");
  const held = solutionOf(at);
  assert.deepStrictEqual(held.repositories.map((one) => one.repository), ["acme/api", "acme/infra", "acme/web", "notes"]);
  const checked = JSON.parse(execFileSync(process.execPath, [join(__dirname, "..", "bin", "evalation-run"), "--branch", at], { encoding: "utf8" }));
  const notes = checked.solution.repositories.find((one) => one.folder === "notes");
  assert.strictEqual(notes.files, 1);
  assert.strictEqual(notes.first, "runbook.md");
  assert.strictEqual(checked.solution.repositories.find((one) => one.folder === "api").files, undefined);
});

test("git history is read in each repository of a solution, and each result names its repository", () => {
  const at = solution();
  const held = scan(at, ["history"]).document;
  const phase = held.phases.find((one) => one.phase === "history");
  assert.ok(phase.ran);
  const found = held.findings.filter((one) => one.key.startsWith("history:concentration"));
  assert.deepStrictEqual(found.map((one) => one.key).sort(), ["history:concentration:api", "history:concentration:infra"]);
  assert.deepStrictEqual(found.map((one) => one.at.path).sort(), ["api/git history", "infra/git history"]);
  assert.ok(found.every((one) => /in acme\/(api|infra)$/.test(one.title)));
});

test("the secret scan reads each repository once, and each result names the repository it sits in", () => {
  const at = solution();
  process.env.EVALATION_SECRET_CMD = `${process.execPath} ${join(__dirname, "fake-secret.js")}`;
  try {
    const held = scan(at, ["secret"]).document;
    assert.deepStrictEqual(held.findings.map((one) => [one.key, one.at.path, one.title]).sort(), [
      ["secret:generic-api-key:api/config.js:3", "api/config.js", "generic-api-key in api/config.js"],
      ["secret:generic-api-key:infra/config.js:3", "infra/config.js", "generic-api-key in infra/config.js"],
      ["secret:generic-api-key:notes/config.js:3", "notes/config.js", "generic-api-key in notes/config.js"],
    ]);
  } finally {
    delete process.env.EVALATION_SECRET_CMD;
  }
});

test("what changed since the last run says which repositories joined or left the solution", () => {
  const { changes, changesSection, changeNotes } = require("../lib/changes.js");
  const reads = (...names) => ({ kind: "solution", repository: "Acme platform", repositories: names.map((one) => ({ folder: one, repository: `acme/${one}` })) });
  const before = { ...run(repository()), at: "2026-09-20T00:00:00.000Z", target: reads("api", "legacy") };
  const now = { ...run(repository()), target: reads("api", "infra") };
  const said = changes(now, before);
  assert.deepStrictEqual(said.repositories, { added: ["acme/infra"], removed: ["acme/legacy"] });
  assert.match(changesSection(said, "soc2"), /This run also read acme\/infra, and no longer read acme\/legacy\./);
  assert.ok(changeNotes(said, "soc2").some((one) => one.headline === "Repositories read"));
});

test("the run command saves the name and the repositories left out, and the branch check reports the solution", () => {
  const at = solution();
  const cli = (...args) => JSON.parse(execFileSync(process.execPath, [join(__dirname, "..", "bin", "evalation-run"), ...args], { encoding: "utf8" }));
  const saved = cli("--solution", at, "--name", "Acme platform", "--leave", "notes");
  assert.strictEqual(saved.name, "Acme platform");
  assert.deepStrictEqual(saved.repositories.map((one) => one.folder), ["api", "infra"]);
  const checked = cli("--branch", at);
  assert.strictEqual(checked.solution.name, "Acme platform");
  assert.strictEqual(checked.solution.repositories.find((one) => one.folder === "api").on_main, true);
  assert.deepStrictEqual(checked.solution.repositories.map((one) => one.folder), ["api", "infra", "notes"]);
  assert.strictEqual(cli("--branch", repository()).solution, null);
});

test("the folder questions and lines come from the run command ready to ask, in the catalogue's words and alphabetical order", () => {
  const at = solution();
  const said = (...args) => execFileSync(process.execPath, [join(__dirname, "..", "bin", "evalation-run"), "--say", ...args], { encoding: "utf8" });
  const asked = (...args) => JSON.parse(said(...args)).questions;
  const found = JSON.parse(said("found", at));
  assert.strictEqual(found.said, "We found 2 subfolders under version control and one that isn't. The ones you choose are read together as one product.");
  assert.deepStrictEqual(found.folders.questions[0].options.map((one) => one.label), ["Include all version controlled folders", "Let me choose which ones to include"]);
  assert.strictEqual(found.evidence, true);
  const command = readFileSync(join(__dirname, "..", "commands", "ev-run.md"), "utf8");
  assert.doesNotMatch(command, /<N>|<M>/, "the command names no counts a session could read aloud");
  assert.doesNotMatch(command, /evalation-say ev-run\.folders/, "the folders question comes with the found line, in one call");
  const [folders] = asked("pick", at);
  assert.strictEqual(folders.header, "Folders");
  assert.ok(folders.multiSelect);
  assert.deepStrictEqual(folders.options, [{ label: "acme/api", description: "Reads the code in api." },
    { label: "acme/infra", description: "Reads the code in infra." }]);
  assert.strictEqual(asked("evidence", at)[0].question, "Use notes as evidence for the version controlled code?");
  mkdirSync(join(at, "docs"));
  writeFileSync(join(at, "docs", "a.md"), "# A\n");
  writeFileSync(join(at, "docs", "b.md"), "# B\n");
  const [evidence] = asked("evidence", at);
  assert.strictEqual(evidence.header, "Evidence");
  assert.deepStrictEqual(evidence.options, [{ label: "docs", description: "Holds 2 files, such as a.md." },
    { label: "notes", description: "Holds one file, runbook.md." }]);
  const folder = require("node:path").basename(at);
  assert.deepStrictEqual(asked("name", at)[0].options, [{ label: `Use the folder name, ${folder}`, description: `The reports call it ${folder}.` },
    { label: "Use acme", description: "The reports call it acme." }]);
  const product = join(mkdtempSync(join(tmpdir(), "evalation-named-")), "Product");
  cpSync(at, product, { recursive: true });
  assert.deepStrictEqual(asked("name", product)[0].options[0], { label: "Use the folder name, Product", description: "The reports call it Product." });
  choose(at, { name: "Acme platform" });
  const [name] = asked("name", at);
  assert.strictEqual(name.header, "Name");
  assert.deepStrictEqual(name.options[0], { label: "Keep the name Acme platform", description: "The reports name the product Acme platform." });
  assert.strictEqual(said("branches", at), "");
  git(join(at, "infra"), "checkout", "-q", "-b", "feature");
  assert.strictEqual(said("branches", at), "acme/infra is on feature, and its main branch is main.\n");
  execFileSync("git", ["-c", "user.email=check@example.com", "-c", "user.name=check", "commit", "-q", "--allow-empty", "-m", "old"],
    { cwd: join(at, "infra"), stdio: "ignore", env: { ...process.env, GIT_COMMITTER_DATE: "2026-02-03T00:00:00Z" } });
  assert.strictEqual(said("copies", at), "The newest change in acme/infra is from 3 February 2026.\n");
});

test("the solution at a glance counts every repository's commits and contributors, and how many repositories it holds", () => {
  const { inventory } = require("../bin/evalation-inventory");
  const at = solution();
  const held = inventory(at);
  assert.strictEqual(held.commits, 4);
  assert.strictEqual(held.contributors, 1);
  assert.strictEqual(held.overview.inventory.REPOSITORIES, 2);  assert.strictEqual(held.overview.inventory.COMMITS, 4);
});

test("a copy or a second clone can be neither read nor cited", () => {
  const { read } = require("../bin/evalation-read");
  const { checked } = require("../bin/evalation-findings");
  const at = solution();
  assert.throws(() => read(at, "api-copy/src/auth.js"), /api-copy\/src\/auth\.js is not in a repository this run reads/);
  assert.throws(() => read(at, "api-old/src/auth.js"), /not in a repository this run reads/);
  assert.match(read(at, "api/src/auth.js"), /req\.session/);
  const document = run(at);
  document.target = target(at);
  document.answers[0].looked_for = [
    { result: "found", evidence: [{ path: "api-old/src/auth.js", from: 1, to: 2, quote: "if (!req.session)", grade: "executable" }] },
    { result: "missing", searched: "Looked in every repository for restore steps and found none." },
  ];
  assert.ok(checked(document, at).includes("api-old/src/auth.js: cited from a folder this run does not read"));
});

test("the board pack's cover names every repository and the other folders apart, and the Detail's subtitle names the product alone", () => {
  const { reviewFindings } = require("../bin/evalation-deliver");
  const { synthesise } = require("../lib/synthesise.js");
  const { deck } = require("../bin/evalation-deck");
  const pptx = require("../lib/pptx.js");
  const at = solution();
  choose(at, { name: "Acme platform", leave: [] });
  const document = { ...run(at), target: target(at), answers: [], accounted: [],
    findings: [{ id: "f-1", pack: "hardening", concern: "SEC01", severity: "high", title: "Queries built from input",
      observed: "Queries are built from input.", required: "Use parameters.", at: { path: "infra/main.tf", from: 1, to: 1 } }] };
  const built = reviewFindings(document);
  assert.strictEqual(built.subtitle, "Detailed findings by discipline · Product: Acme platform");
  assert.match(built.meta.intro, /^We read the 2 repositories of this product together/);
  const { file } = deck(synthesise(built), join(mkdtempSync(join(tmpdir(), "evalation-deck-")), "Pack.pdf"), { render: false });
  const slides = file.entries.filter((one) => /^ppt\/slides\/slide\d+\.xml$/.test(one.name))
    .sort((a, b) => Number(a.name.match(/\d+/)[0]) - Number(b.name.match(/\d+/)[0]))
    .map((one) => pptx.shapes(one.content.toString("utf8")).map((shape) => shape.text).join(" "));
  assert.match(slides[0], /ACME PLATFORM · ACME\/API, ACME\/INFRA · OTHER FOLDERS: NOTES/);
  assert.ok(slides.some((one) => /Product at a glance/.test(one)));
  assert.ok(!slides.some((one) => /Solution at a glance/.test(one)));
});

test("a cover too long for the names counts only the repositories, and the other folders apart", () => {
  const { labelled } = require("../bin/evalation-deck");
  const repositories = [
    ...["web", "mobile", "billing", "search", "payments", "identity", "notifications", "analytics"].map((one) => ({ folder: one, repository: `acme/${one}`, vcs: "git" })),
    { folder: "docs", repository: "docs", vcs: null },
  ];
  assert.strictEqual(labelled({ tenant: "Acme", solution: { repositories } }), "Acme · 8 repositories and one other folder");
});

test("the board pack lists every repository on slides of their own, however many there are", () => {
  const { reviewFindings } = require("../bin/evalation-deliver");
  const { synthesise } = require("../lib/synthesise.js");
  const { deck } = require("../bin/evalation-deck");
  const pptx = require("../lib/pptx.js");
  const at = solution();
  const named = target(at);
  named.repositories = [...named.repositories, ...["web", "mobile", "billing", "search"].map((one) => ({
    folder: one, repository: `acme/${one}`, vcs: "git", branch: "main", head: "a".repeat(40), newest: "2026-09-01T00:00:00+12:00" }))];
  const document = { ...run(at), target: named, answers: [], accounted: [],
    findings: [{ id: "f-1", pack: "hardening", concern: "SEC01", severity: "high", title: "Queries built from input",
      observed: "Queries are built from input.", required: "Use parameters.", at: { path: "api/src/auth.js", from: 1, to: 1 } }] };
  const { file } = deck(synthesise(reviewFindings(document)), join(mkdtempSync(join(tmpdir(), "evalation-deck-")), "Pack.pdf"), { render: false });
  const texts = file.entries.filter((one) => /^ppt\/slides\/slide\d+\.xml$/.test(one.name))
    .map((one) => pptx.shapes(one.content.toString("utf8")).map((shape) => shape.text).join(" "))
    .filter((one) => /Repositories read/.test(one));
  assert.strictEqual(texts.length, 2);
  const all = texts.join(" ");
  for (const name of ["acme/api", "acme/infra", "acme/web", "acme/mobile", "acme/billing", "acme/search"]) assert.ok(all.includes(name), name);
  assert.ok(!all.includes("notes") && !all.includes("api-copy"), "a folder with no version control is never on a repositories slide");
  assert.match(all, /Folder api · branch main · commit [0-9a-f]{7} · last changed/);
  const rest = file.entries.filter((one) => /^ppt\/slides\/slide\d+\.xml$/.test(one.name))
    .map((one) => pptx.shapes(one.content.toString("utf8")).map((shape) => shape.text).join(" "))
    .filter((one) => !/Repositories read/.test(one)).join(" ");
  assert.match(rest, /Other folders \(not under version control\)[\s\S]*notes/);
  assert.match(rest, /api-copy\s*Left out: a copy of the folder "api" with no version control\./);
});

test("a scanner card names the repository of each place it lists", () => {
  const { scanResults } = require("../lib/sheet.js");
  const scans = require("../lib/scans.js");
  const { consequences, remedies } = require("../lib/weaknesses.js");
  const at = solution();
  const html = scanResults({
    findings: [{ key: "sast:xss:api/src/auth.js:2", phase: "sast", severity: "medium", title: "xss in api/src/auth.js",
      at: { path: "api/src/auth.js", from: 2 }, cwe: ["CWE-79"] }],
    intro: "x", tagWord: "", tagOf: () => [], phaseOf: scans.named, consequences, remedies,
    upgradeTo: scans.upgradeTo, compared: scans.compared, compatible: scans.compatible, cardOf: scans.cardOf,
    shown: (path) => shownPath(target(at), path),
  });
  assert.match(html, /acme\/api · src\/auth\.js:2/);
  assert.doesNotMatch(html, /at api\/src/);
});

test("the reader's map lists the repositories and says an item is missing only where none holds it", () => {
  const at = solution();
  const shown = map(at);
  assert.match(shown, /repositories read as one solution:\n {2}api +acme\/api\n {2}infra +acme\/infra\n {2}notes +notes\n/);
  assert.match(shown, /missing only where no repository holds it/);
});
