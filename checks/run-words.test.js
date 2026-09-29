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
  return (...args) => JSON.parse(execFileSync(process.execPath, [join(BIN, "evalation-scan"), ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

const FAILS = "#!/bin/sh\necho 'Error: no formula for this tool' >&2\nexit 1\n";
const WORKS = "#!/bin/sh\nprintf '#!/bin/sh\\n' > \"$(dirname \"$0\")/$2\"\nchmod +x \"$(dirname \"$0\")/$2\"\n";

test("a scanner that failed to install is reported as could not be installed, with its reason, and never as declined", () => {
  const scan = machine(FAILS);
  scan("install", "trivy");
  const shown = scan("show", "--phases", "sca");
  assert.strictEqual(shown.phases.sca.declined, false);
  assert.match(shown.phases.sca.could_not_install.why, /no formula/);
  const ran = scan("run", repository(), "--phases", "sca");
  assert.match(ran.not_checked[0].why, /Trivy could not be installed \(.*no formula.*\)/);
  assert.doesNotMatch(JSON.stringify(ran), /chose|declined/);
});

test("a decline is the person's choice with its date, and a later install clears it", () => {
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

test("show describes each tool in plain words with a page to install it by hand, and a scan names what it checked", () => {
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

test("a scan's read-out is one plain sentence per result, said to the person who ran it", () => {
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
  assert.strictEqual(ran.stderr, "Something changed the repository while it was being scanned, so the scan was not kept. Stop whatever is changing it, then run /ev-run again.\n");
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

test("ev-run says each thing once, in the words the reports use, and asks only what it can ask", () => {
  const text = require("node:fs").readFileSync(join(__dirname, "..", "commands", "ev-run.md"), "utf8").replace(/\s+/g, " ");
  const said = [
    "can also take your own questions, written with /ev-questions before a run.",
    "without it every claim is marked asserted, meaning one reading found it and nothing checked it.",
    "\"Each claim is checked against the code before the reports are written. No pack credits are used.\"",
    "\"The reports are written now, with every claim marked asserted.\"",
    "Documents/Evalation/<repository>/<date> <HH.MM>",
    "Of 12 claims, 1 was confirmed against the code.",
    "\"Packs <k>/<n>\"",
    "\"Which of your usual packs should this run read? Tick each pack to read.\"",
    "\"Include all version controlled folders\"",
    "\"Let me choose which ones to include\"",
    "used only as evidence when judging the version controlled code",
    "\"A second copy of a repository is never read.\"",
    "Running the free security tools over the repositories.",
    "Where `--scan` fails, show the line it prints as printed and stop.",
    "${CLAUDE_PLUGIN_ROOT}/bin/evalation-run --titles",
    "Where `--titles` fails, show the line it prints as printed and stop.",
    "`${CLAUDE_PLUGIN_ROOT}/bin/evalation-questions path \"<name>\" --run`",
    "Where `show`, `status`, `evalation-questions list` or `path` fails",
    "with the same packs and question sets",
    "Where there are no usual packs and no set written for no pack, skip this question and ask the full list at once",
    "\"Keep the name <name>\"",
    "\"The reports name the product <name>.\"",
    "Your findings are kept, and the reports can be printed once this is fixed, with no new pack credits.",
    "## Printing a run's reports again",
    "${CLAUDE_PLUGIN_ROOT}/bin/evalation-run --last <target>",
    "The ones you choose are read together as one product, for the same pack credits as one repository.",
    "Each pack ticked uses one pack credit.",
    "No extra pack credits.",
    "Name the balance only in the first pack question and the full list, and say what a tick costs in every question.",
    "Reading takes a while and uses a good part of your Claude usage.",
    "Your own Claude session rereads each claim from scratch on the model you chose.",
    "\"<tools>, the free security tools this review uses, are already installed.\"",
    "\"Nothing is read and no pack credits are used. Switch to main, then run /ev-run again.\"",
    "\"Nothing is read and no pack credits are used. Pull the latest changes, then run /ev-run again.\"",
    "This run had already started, so no more pack credits were used.",
    "`\"pack\":\"custom\"`",
    "in alphabetical order of their labels",
    "\"Which folders without version control should this run use as evidence for the code? Tick each one to use.\"",
    "\"Use your question set \"<set name>\" with <pack title>? No extra pack credits.\"",
    "joined with commas and a final and",
  ];
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
  ];
  assert.deepStrictEqual(said.filter((one) => !text.includes(one)), []);
  assert.deepStrictEqual(unsaid.filter((one) => text.includes(one)), []);
});

test("every question ev-run asks names its header", () => {
  const text = require("node:fs").readFileSync(join(__dirname, "..", "commands", "ev-run.md"), "utf8").replace(/\s+/g, " ");
  const asks = [...text.matchAll(/\bask (?:once, )?"([^"]+\?)/gi)];
  assert.ok(asks.length >= 12, `found ${asks.length} questions`);
  const unheaded = asks.filter((one, at) => {
    const upTo = asks[at + 1]?.index ?? text.length;
    return !/\bheaded "(?:[^"<]{1,12}|[^"<]{1,8} <k>\/<n>)"/i.test(text.slice(one.index, Math.min(upTo, one.index + 1200)));
  }).map((one) => one[1]);
  assert.deepStrictEqual(unheaded, []);
});

test("the branch check names the repository and its folder, so the pack question can say which is read", () => {
  const tree = repository();
  const checked = JSON.parse(execFileSync(process.execPath, [join(BIN, "evalation-run"), "--branch", tree], { encoding: "utf8" }));
  assert.strictEqual(checked.folder, resolve(tree));
  assert.ok(checked.repository);
});
