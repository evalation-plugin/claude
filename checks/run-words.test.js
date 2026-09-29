"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { chmodSync, mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { home, repository } = require("./fixture.js");

const BIN = join(__dirname, "..", "bin");
const DATE = /\d{1,2} [A-Z][a-z]+ \d{4}/;

function machine(brew) {
  const at = mkdtempSync(join(tmpdir(), "evalation-machine-"));
  const bin = join(at, "bin");
  mkdirSync(bin);
  if (brew) {
    writeFileSync(join(bin, "brew"), brew);
    chmodSync(join(bin, "brew"), 0o755);
  }
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, EVALATION_LOCAL: join(at, "evalation.local"), EVALATION_PLUGIN_HOME: home };
  for (const phase of ["SCA", "SBOM", "SAST", "SECRET", "HISTORY"]) delete env[`EVALATION_${phase}_CMD`];
  return Object.assign((...args) => JSON.parse(execFileSync(process.execPath, [join(BIN, "evalation-scan"), ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })), { bin });
}

const SHELL_BREW = { skip: process.platform === "win32" && "the stand-in brew is a shell script" };
const FAILS = "#!/bin/sh\necho 'Error: no formula for this tool' >&2\nexit 1\n";
const WORKS = "#!/bin/sh\nprintf '#!/bin/sh\\n' > \"$(dirname \"$0\")/$2\"\nchmod +x \"$(dirname \"$0\")/$2\"\n";

test("a scanner that failed to install is reported as could not be installed, with its reason, and never as declined", SHELL_BREW, () => {
  const scan = machine(FAILS);
  scan("install", "trivy");
  const shown = scan("show", "--phases", "sca");
  assert.strictEqual(shown.phases.sca.declined, false);
  assert.match(shown.phases.sca.could_not_install.why, /no formula/);
  const ran = scan("run", repository(), "--phases", "sca");
  assert.match(ran.not_checked[0].why, /Trivy could not be installed \(.*no formula.*\)/);
  assert.doesNotMatch(JSON.stringify(ran), /chose|declined/);
});

test("a decline is the person's choice with its date, and a later install clears it", SHELL_BREW, () => {
  const scan = machine(WORKS);
  scan("decline", "semgrep");
  assert.match(scan("show", "--phases", "sast").phases.sast.declined_on, DATE);
  const ran = scan("run", repository(), "--phases", "sast");
  assert.match(ran.not_checked[0].why, new RegExp(`chose not to install Semgrep on ${DATE.source}`));
  assert.match(ran.not_checked[0].declined_on, DATE);
  assert.doesNotMatch(JSON.stringify(ran), /for this run/);
  scan("install", "semgrep");
  const after = scan("show", "--phases", "sast").phases.sast;
  assert.strictEqual(after.on_this_machine, true);
  assert.strictEqual(after.declined, false);
  assert.strictEqual(after.declined_on, null);
});

test("show describes each tool in plain words with a page to install it by hand, and a scan names what it checked", SHELL_BREW, () => {
  const scan = machine(null);
  const shown = scan("show", "--phases", "sca,sbom,sast,secret");
  assert.match(shown.phases.sca.offer, /^Trivy, checks dependencies for known security flaws$/);
  assert.match(shown.phases.sast.offer, /^Semgrep, finds risky code patterns$/);
  assert.match(shown.phases.secret.offer, /^Gitleaks, finds passwords and keys committed to the code$/);
  assert.match(shown.phases.sbom.offer, /^Syft, lists every dependency$/);
  for (const one of Object.values(shown.phases)) assert.match(one.install_page, /^https:\/\//);
  const ran = scan("run", repository(), "--phases", "history,sast");
  assert.deepStrictEqual(ran.checked, ["the commit history"]);
  assert.strictEqual(ran.not_checked[0].checks, "risky code patterns");
  assert.match(ran.not_checked[0].why, /Semgrep is not installed on this machine/);
  assert.doesNotMatch(JSON.stringify({ ...ran, written: "" }), /\b(sca|sast|sbom|phase)\b/);
});

test("a scan's read-out is one plain sentence per result, said to the person who ran it", SHELL_BREW, () => {
  const clean = machine(null)("run", repository(), "--phases", "history");
  assert.strictEqual(clean.said, "Checked: the commit history.");

  const refused = machine(FAILS);
  refused("install", "trivy");
  const failed = refused("run", repository(), "--phases", "history,sca");
  assert.strictEqual(failed.said, "Checked: the commit history. Not checked: dependencies for known security flaws, since Trivy could not be installed on this machine.");

  const declined = machine(null);
  declined("decline", "semgrep");
  const said = declined("run", repository(), "--phases", "sast").said;
  assert.match(said, new RegExp(`^Not checked: risky code patterns, since you chose not to install Semgrep on ${DATE.source}\\. To change that, run /ev-run again and tick Semgrep when asked\\.$`));
  assert.doesNotMatch(said, /person running|Checked: \./);
});

test("a scan stopped by the repository changing under it says what to do in one plain line", () => {
  const tree = repository();
  const at = mkdtempSync(join(tmpdir(), "evalation-moving-"));
  const mover = join(at, "mover.js");
  writeFileSync(mover, "require('node:fs').writeFileSync(require('node:path').join(process.argv[2], 'moved.txt'), 'x'); process.stdout.write('[]');\n");
  const ran = spawnSync(process.execPath, [join(BIN, "evalation-scan"), "run", tree, "--phases", "secret"], { encoding: "utf8",
    env: { ...process.env, EVALATION_PLUGIN_HOME: home, EVALATION_LOCAL: join(at, "evalation.local"), EVALATION_SECRET_CMD: `${process.execPath} ${mover}` } });
  assert.strictEqual(ran.status, 1);
  assert.strictEqual(ran.stderr, "Something changed the repository while it was being scanned, so the scan was not kept and no pack credits were used. Stop whatever is changing it, then run /ev-run again.\n");
});

test("delivering with no browser names each page to open and says a PDF printed by hand is not signed", () => {
  const { said } = require("../bin/evalation-deliver");
  const text = said({ printed: false, into: "/r", pages: ["/r/Evalation Hardening Review Pack.html", "/r/Evalation Hardening Review Detail.html"], unsigned: [] });
  assert.match(text, /Evalation Hardening Review Pack\.html/);
  assert.match(text, /Evalation Hardening Review Detail\.html/);
  assert.match(text, /printed by hand is not signed/);
  assert.doesNotMatch(text, /pages were written/);
});

test("an unsigned report names its file and reason, and how to get a signed copy", () => {
  const { said } = require("../bin/evalation-deliver");
  const text = said({ printed: true, into: "/r", pack: "/r/A Pack.pdf", findings: "/r/A Detail.pdf",
    unsigned: [{ file: "/r/A Pack.pdf", why: "Evalation's server could not be reached" }] });
  assert.match(text, /A Pack\.pdf is not signed because Evalation's server could not be reached/);
  assert.match(text, /Once this machine is online, run \/ev-run print again for signed copies\. Printing again uses no pack credits\./);
  assert.doesNotMatch(text, /ask Claude/);
  const printless = said({ printed: false, into: "/r", pages: ["/r/A Pack.html"], unsigned: [] });
  assert.match(printless, /then run \/ev-run print again/);
});

test("each reason a report is unsigned comes with a step the person can take, and the server's own fault goes to support", () => {
  const { unsignedThen, unsignedWhy } = require("../lib/print.js");
  const steps = ["unreachable: x", "no-settings: x", "refused 402: x", "refused 401: x", "refused 500: x"].map((one) => unsignedThen(unsignedWhy(one)));
  for (const one of steps) assert.match(one, /run \/ev-run print again for signed copies\. Printing again uses no pack credits\.$/);
  assert.match(steps[1], /^Run \/ev-activate to sign in/);
  assert.match(steps[2], /support@evalation\.ai/);
  assert.match(steps[4], /^Email support@evalation\.ai, then/);
});

test("the evidence pack names the repository in full and the question revision, in words a reader can place", () => {
  const { run } = require("./fixture.js");
  const { page } = require("../bin/evalation-report");
  const document = run(repository());
  const asked = new Map(document.packs[0].entries_asked.map((one) => [`soc2/${one.identifier}`, one]));
  const html = page(document, document.answers.filter((one) => one.pack === "soc2"), asked);
  assert.match(html, /What this repository evidences · Repository: acme\/app/);
  assert.match(html, /Assessed [^.]+ against question revision 1\.80\./);
  assert.doesNotMatch(html, /governance revision|Repo:/);
});

const EV_RUN = () => require("node:fs").readFileSync(join(__dirname, "..", "commands", "ev-run.md"), "utf8").replace(/\s+/g, " ");

function catalogue() {
  const { entries } = require("../lib/say.js");
  return Object.entries(entries()).filter(([name]) => name.startsWith("ev-run.")).flatMap(([, one]) =>
    [one.say, one.ask, ...(Array.isArray(one.options) ? one.options.flatMap((each) => [each.label, each.description]) : [])].filter(Boolean)).join(" \n ");
}

const sayRun = (...args) => spawnSync(process.execPath, [join(BIN, "evalation-run"), "--say", ...args], { encoding: "utf8",
  env: { ...process.env, EVALATION_PLUGIN_HOME: home } });

test("ev-run's lines keep the words the reports use, held in the catalogue where the command runs them", () => {
  const lines = catalogue();
  const held = [
    "can also take your own questions, written with /ev-questions before a run.",
    "without it every claim is marked asserted, meaning one reading found it and nothing checked it.",
    "Each claim is checked against the code before the reports are written. No pack credits are used.",
    "The reports are written now, with every claim marked asserted.",
    "Which of your usual packs should this run read? Tick each pack to read.",
    "Include all version controlled folders",
    "Let me choose which ones to include",
    "used only as evidence when judging the version controlled code",
    "A second copy of a repository is never read.",
    "Running the free security tools over the repositories.",
    "Keep the name <name>",
    "The reports name the product <name>.",
    "The ones you choose are read together as one product, for the same pack credits as one repository.",
    "No extra pack credits.",
    "Reading takes a while and uses a good part of your Claude usage.",
    "Your own Claude session rereads each claim from scratch on the model you chose.",
    "<tools>, the free security tools this review uses, are already installed.",
    "Nothing is read and no pack credits are used. Switch to main, then run /ev-run again.",
    "Nothing is read and no pack credits are used. Pull the latest changes, then run /ev-run again.",
    "This run had already started, so no more pack credits were used.",
    "Which folders without version control should this run use as evidence for the code? Tick each one to use.",
    "Use your question set \"<set>\" with <pack>? No extra pack credits.",
  ];
  assert.deepStrictEqual(held.filter((one) => !lines.includes(one)), []);
  const text = EV_RUN();
  const said = [
    "Documents/Evalation/<repository>/<date> <HH.MM>",
    "Where `--scan` fails, show the line it prints as printed and stop.",
    "evalation-run --titles",
    "Where `--titles` fails, show the line it prints as printed and stop.",
    "`evalation-questions path \"<name>\" --run`",
    "Where `show`, `status`, `evalation-questions list` or `path` fails",
    "with the same packs and question sets",
    "Where there are no usual packs and no set written for no pack",
    "## Printing a run's reports again",
    "evalation-run --last <target>",
    "`\"pack\":\"custom\"`",
  ];
  assert.deepStrictEqual(said.filter((one) => !text.includes(one)), []);
  const unsaid = [
    "can also take your own questions. To add some, stop here",
    "mark every claim as not checked",
    "<date> <run>",
    "four packs to a question",
    "Never list packs for the person to untick or drop",
    "Reading it as it is makes the report describe the code as it was on that date.",
    "and that reading them as they are makes the report describe each as it was on that date",
    "This folder holds <N> repositories.",
    "evalation-packs titles",
    "questions path <name>",
    "They are read together as one product, for the same pack credits as one.",
    "a fair share of your Claude usage",
    "since each part is read by its own agent",
    "fresh reader",
    "prints one line naming the file and writes nothing more",
    "\"The free security tools this review uses, <tools>, are already installed.\"",
    "Use your question set <set name>",
    "They are used only as evidence when judging the version controlled code. Tick",
    "and nowhere else",
    "ask to print them again for signed copies",
    "show the command's own message",
    "evalation-say ev-run.fault-before",
  ];
  assert.deepStrictEqual(unsaid.filter((one) => `${text} ${lines}`.includes(one)), []);
});

test("ev-run writes no question itself, and runs each one the catalogue or a script prints", () => {
  const text = EV_RUN();
  assert.doesNotMatch(text, /\bask "|\bheaded "|described as "/i);
  assert.doesNotMatch(text, /CLAUDE_PLUGIN_ROOT\}\/bin\/evalation/);
  const verbs = ["found", "pick", "evidence", "name", "branches", "copies", "off-main", "branch", "stale", "packs", "usual", "all",
    "sets", "pick-sets", "only", "short", "reading", "tally", "done", "folder"];
  assert.deepStrictEqual(verbs.filter((one) => !text.includes(`evalation-run --say ${one}`)), []);
});

test("a branch, a detached commit and a stale copy are each said in the catalogue's words", () => {
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, stdio: "ignore",
    env: { ...process.env, GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z", GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z" } });
  const tree = repository();
  git(tree, "checkout", "-q", "-b", "feature");
  git(tree, "-c", "user.email=check@example.com", "-c", "user.name=check", "commit", "-q", "--allow-empty", "-m", "old");
  assert.strictEqual(sayRun("off-main", tree).stdout, "This run is about to read feature in place of main.\n");
  const asked = JSON.parse(sayRun("branch", tree).stdout);
  assert.strictEqual(asked.questions[0].header, "Branch");
  assert.strictEqual(asked.questions[0].options[0].description, "The report describes feature in place of main.");
  assert.strictEqual(sayRun("stale", tree).stdout, "The newest change in this copy is from 1 January 2026.\n");
  git(tree, "checkout", "-q", "--detach");
  assert.strictEqual(sayRun("off-main", tree).stdout, "This run is about to read a commit on no branch in place of main.\n");
});

test("the checking's tally leaves withdrawn claims out, counts what stays asserted, and says a count of one as one", () => {
  assert.strictEqual(sayRun("tally", "120", "101", "12", "3").stdout,
    "Of 117 claims, 101 were confirmed against the code. 12 were corrected. 16 stay marked asserted in the reports, since no second check confirmed them.\n");
  assert.strictEqual(sayRun("tally", "12", "1", "1", "0").stdout,
    "Of 12 claims, one was confirmed against the code. One was corrected. 11 stay marked asserted in the reports, since no second check confirmed them.\n");
  assert.strictEqual(sayRun("tally", "5", "5", "0", "0").stdout, "Of 5 claims, 5 were confirmed against the code.\n");
  assert.strictEqual(sayRun("tally", "6", "0", "3", "2").stdout,
    "Of 4 claims, none was confirmed against the code. 3 were corrected. 4 stay marked asserted in the reports, since no second check confirmed them.\n");
  assert.strictEqual(sayRun("tally", "4", "2", "0", "1").stdout,
    "Of 3 claims, 2 were confirmed against the code. One stays marked asserted in the reports, since no second check confirmed it.\n");
  assert.strictEqual(sayRun("tally", "1", "1", "0", "0").stdout, "The one claim was confirmed against the code.\n");
  assert.strictEqual(sayRun("tally", "2", "0", "0", "1").stdout,
    "The one claim was not confirmed against the code, so it stays marked asserted in the reports.\n");
  assert.doesNotMatch(sayRun("tally", "3", "1", "0", "2").stdout, /withdrawn|claims/);
  assert.strictEqual(sayRun("tally", "3", "3", "0", "3").stdout,
    "Every claim was withdrawn, since none held against the code, so the reports carry none of them.\n");
  assert.strictEqual(sayRun("tally", "2", "1", "1", "1").stdout, "The one claim was corrected, then confirmed against the code.\n");
  assert.strictEqual(sayRun("tally", "1", "0", "1", "0").stdout,
    "The one claim was corrected, and no second check confirmed it, so it stays marked asserted in the reports.\n");
});

test("the closing lines sum up each pack from the findings, then name the reports folder on its own line, then what to open", () => {
  const { run } = require("./fixture.js");
  const { reportsFolder } = require("../lib/reports.js");
  const folder = mkdtempSync(join(tmpdir(), "evalation-done-"));
  const findings = join(folder, "findings.json");
  const document = { ...run(repository()), schema: "evalation.findings.v1" };
  document.findings = [{ pack: "hardening", severity: "high" }, { pack: "hardening", severity: "critical" },
    { pack: "hardening", severity: "high" }, { pack: "hardening", severity: "positive" }];
  writeFileSync(findings, JSON.stringify(document));
  assert.strictEqual(sayRun("done", findings).stdout,
    "SOC 2 Trust Services Criteria, 2 entries: 1 partly covered and 1 for the organisation to answer. " +
    "Evalation Hardening Review, 3 weaknesses: 1 critical and 2 high.\n" +
    `The reports are in this folder:\n${reportsFolder(document)}\n` +
    "Open Evalation Hardening Review Detail.pdf to work through the fixes. Running /ev-run again after changes uses 2 pack credits.\n");
  document.findings = [{ pack: "hardening", severity: "low" }];
  document.answers = document.answers.slice(0, 1).map((one) => ({ ...one, status: "total-gap" }));
  document.packs[0].entry_noun = { one: "criterion", many: "criteria" };
  writeFileSync(findings, JSON.stringify(document));
  assert.strictEqual(sayRun("done", findings, "/r/Chosen").stdout,
    "SOC 2 Trust Services Criteria, one criterion: 1 not covered. Evalation Hardening Review, one weakness: 1 low.\n" +
    "The reports are in this folder:\n/r/Chosen\n" +
    "Open Evalation Hardening Review Detail.pdf to work through the fixes. Running /ev-run again after changes uses 2 pack credits.\n");
  document.findings = [];
  writeFileSync(findings, JSON.stringify(document));
  assert.match(sayRun("done", findings).stdout, /Evalation Hardening Review, no weaknesses found\.\n/);
  assert.strictEqual(sayRun("folder", findings).stdout, `The reports are in this folder:\n${reportsFolder(document)}\n`);
});

test("delivering reports that printed and signed says nothing, since the closing lines name the folder", () => {
  const { said } = require("../bin/evalation-deliver");
  assert.strictEqual(said({ printed: true, into: "/r", pack: "/r/A Pack.pdf", findings: "/r/A Detail.pdf", unsigned: [] }), "");
});

test("the reading line names every pack, and the closing line names the file to work from and what a rerun uses", () => {
  const { run } = require("./fixture.js");
  const folder = mkdtempSync(join(tmpdir(), "evalation-said-"));
  const findings = join(folder, "findings.json");
  writeFileSync(findings, JSON.stringify(run(repository())));
  assert.strictEqual(sayRun("done", findings).stdout.split("\n").at(-2),
    "Open Evalation Hardening Review Detail.pdf to work through the fixes. Running /ev-run again after changes uses 2 pack credits.");
  const standard = run(repository());
  standard.packs = standard.packs.filter((one) => one.pack === "soc2");
  writeFileSync(findings, JSON.stringify(standard));
  assert.strictEqual(sayRun("done", findings).stdout.split("\n").at(-2),
    "Open Evalation SOC 2 Trust Services Criteria Evidence Pack.pdf to work through the fixes. Running /ev-run again after changes uses one pack credit.");
  const runFile = join(folder, "run.json");
  writeFileSync(runFile, JSON.stringify({ target: { kind: "repository" }, packs: [{ pack: "soc2", body: { title: "SOC 2 Trust Services Criteria" } },
    { pack: "iso27001", body: { title: "ISO/IEC 27001" } }, { pack: "hardening", body: { title: "Evalation Hardening Review" } }] }));
  assert.strictEqual(sayRun("reading", runFile).stdout,
    "Reading the repository against SOC 2 Trust Services Criteria, ISO/IEC 27001 and Evalation Hardening Review, in several parts at once. This takes a while.\n");
});

test("show prints the scanner question ready to ask, or the line to say where none is missing or Homebrew is absent", SHELL_BREW, () => {
  const tools = (scan, ...names) => {
    for (const one of names) {
      writeFileSync(join(scan.bin, one), "#!/bin/sh\n");
      chmodSync(join(scan.bin, one), 0o755);
    }
  };
  const bare = machine(null);
  const absent = bare("show", "--phases", "sca,sast");
  assert.strictEqual(absent.asks, null);
  assert.strictEqual(absent.said, "Homebrew is not on this machine, so these tools cannot be installed here. The review runs without them and the report lists what was not checked. To add them yourself, see:\nTrivy: https://github.com/aquasecurity/trivy\nSemgrep: https://github.com/semgrep/semgrep");
  const brewed = machine(FAILS);
  brewed("install", "trivy");
  brewed("decline", "semgrep");
  const two = brewed("show", "--phases", "sca,sast,secret");
  assert.strictEqual(two.said, null);
  const asked = two.asks.questions[0];
  assert.strictEqual(asked.header, "Tools");
  assert.ok(asked.multiSelect);
  assert.deepStrictEqual(asked.options.map((one) => one.label), ["Trivy, checks dependencies for known security flaws",
    "Semgrep, finds risky code patterns", "Gitleaks, finds passwords and keys committed to the code"]);
  assert.match(asked.options[0].description, new RegExp(`^This could not be installed on ${DATE.source}: .*no formula.*\\.$`));
  assert.match(asked.options[1].description, new RegExp(`^You chose not to install this on ${DATE.source}\\.$`));
  assert.strictEqual(asked.options[2].description, "Installs it, so this review can use it.");
  const one = brewed("show", "--phases", "secret");
  assert.strictEqual(one.asks.questions[0].header, "Install");
  assert.match(one.asks.questions[0].question, /^Install Gitleaks with Homebrew\?/);
  tools(brewed, "trivy", "semgrep");
  assert.strictEqual(brewed("show", "--phases", "sca,sast").said, "Trivy and Semgrep, the free security tools this review uses, are already installed.");
  assert.strictEqual(brewed("show", "--phases", "sca").said, "Trivy, the free security tool this review uses, is already installed.");
});

test("the evidence pack's command prints what to say about a report left unprinted or unsigned", () => {
  const { said } = require("../bin/evalation-report");
  const text = said([{ written: "/r/A Evidence Pack.pdf", printed: true, unsigned: "Evalation's server could not be reached",
    then: "Once this machine is online, run /ev-run print again for signed copies. Printing again uses no pack credits." },
  { written: "/r/B Evidence Pack.html", printed: false }], "/r");
  assert.match(text, /A Evidence Pack\.pdf is not signed because Evalation's server could not be reached/);
  assert.match(text, /Once this machine is online, run \/ev-run print again for signed copies\./);
  assert.match(text, /B Evidence Pack\.html/);
  assert.match(text, /printed by hand is not signed/);
  assert.strictEqual(said([{ written: "/r/A Evidence Pack.pdf", printed: true }], "/r"), "");
});

test("the branch check names the repository and its folder, so the pack question can say which is read", () => {
  const tree = repository();
  const checked = JSON.parse(execFileSync(process.execPath, [join(BIN, "evalation-run"), "--branch", tree], { encoding: "utf8" }));
  assert.strictEqual(checked.folder, resolve(tree));
  assert.ok(checked.repository);
});

test("the sign-in is checked before any folder or branch question", () => {
  const text = EV_RUN();
  assert.ok(text.indexOf("evalation-run --titles") >= 0);
  assert.ok(text.indexOf("evalation-run --titles") < text.indexOf("evalation-run --branch"), "--titles runs first in step 1");
});

const faultFile = (said) => {
  const lines = said.trim().split("\n");
  const file = lines.at(-1);
  assert.ok(file.startsWith(join(home, "faults")), `the last line names the file for support: ${said}`);
  assert.strictEqual(lines.at(-2), "To have it fixed, email support@evalation.ai and attach this file, which holds the details:");
  return { lines, detail: require("node:fs").readFileSync(file, "utf8") };
};

test("a fault another command hit is said in a plain line, and its detail goes to a file for support", () => {
  const ran = spawnSync(process.execPath, [join(BIN, "evalation-run"), "--fault", "evalation-verify", "no-plan: run evalation-verify plan /r/f.json /r first"],
    { encoding: "utf8", env: { ...process.env, EVALATION_PLUGIN_HOME: home } });
  assert.strictEqual(ran.status, 0, ran.stderr);
  const { lines, detail } = faultFile(ran.stdout);
  assert.strictEqual(lines[0], "The claims could not be checked, because of a fault in Evalation, so the run stopped. The pack credits for this run were used when it started.");
  assert.doesNotMatch(ran.stdout, /no-plan|\/r\/f\.json/);
  assert.match(detail, /no-plan: run evalation-verify plan/);
});

test("the scan and the evidence pack stop on a fault with plain lines, and the detail goes to a file", () => {
  const scanned = spawnSync(process.execPath, [join(BIN, "evalation-scan"), "run", join(tmpdir(), "evalation-no-such-folder")], { encoding: "utf8",
    env: { ...process.env, EVALATION_PLUGIN_HOME: home } });
  assert.strictEqual(scanned.status, 1);
  const scan = faultFile(scanned.stderr);
  assert.strictEqual(scan.lines[0], "The free security tools could not be run, because of a fault in Evalation, so the run stopped. No pack credits were used.");
  assert.doesNotMatch(scanned.stderr, /no-such-target/);
  assert.match(scan.detail, /no-such-target/);
  const { run } = require("./fixture.js");
  const folder = mkdtempSync(join(tmpdir(), "evalation-empty-"));
  const findings = join(folder, "findings.json");
  writeFileSync(findings, JSON.stringify({ ...run(repository()), schema: "evalation.findings.v1", answers: [] }));
  const reported = spawnSync(process.execPath, [join(BIN, "evalation-report"), findings, folder], { encoding: "utf8",
    env: { ...process.env, EVALATION_PLUGIN_HOME: home } });
  assert.strictEqual(reported.status, 1);
  const report = faultFile(reported.stderr);
  assert.strictEqual(report.lines[0], "The reports could not be written, because of a fault in Evalation, so the run stopped. " +
    "Your findings are kept, and the pack credits for this run were used when it started.");
  assert.doesNotMatch(reported.stderr, /no-answers|findings\.json/);
  assert.match(report.detail, /no-answers/);
});

test("the usual packs list states no cost, which the first pack question already said, and a fault file is named by local time", () => {
  const { entries } = require("../lib/say.js");
  assert.doesNotMatch(entries()["ev-run.usual"].ask, /pack credit/);
  const { fault } = require("../lib/run-say.js");
  const file = fault("A line.", "detail").split("\n").at(-1);
  const now = new Date();
  const local = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  assert.ok(require("node:path").basename(file).startsWith(local), file);
  assert.doesNotMatch(require("node:path").basename(file), /Z-/);
});
