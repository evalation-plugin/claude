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
    unsigned: [{ file: "/r/A Pack.pdf", why: "the server could not be reached" }] });
  assert.match(text, /A Pack\.pdf is not signed because the server could not be reached/);
  assert.match(text, /print the reports again/);
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
  ];
  assert.deepStrictEqual(said.filter((one) => !text.includes(one)), []);
  assert.deepStrictEqual(unsaid.filter((one) => text.includes(one)), []);
});

test("the branch check names the repository and its folder, so the pack question can say which is read", () => {
  const tree = repository();
  const checked = JSON.parse(execFileSync(process.execPath, [join(BIN, "evalation-run"), "--branch", tree], { encoding: "utf8" }));
  assert.strictEqual(checked.folder, resolve(tree));
  assert.ok(checked.repository);
});
