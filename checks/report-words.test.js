"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { repository, run } = require("./fixture.js");
const { page } = require("../bin/evalation-report");
const { held, offences } = require("../lib/prose.js");
const { spellingOf, spelled } = require("../lib/spelling.js");

const shown = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

function opened(document) {
  const asked = new Map(document.packs.flatMap((pack) => pack.entries_asked.map((one) => [`${pack.pack}/${one.identifier}`, one])));
  return shown(page(document, document.answers.filter((one) => one.pack === "soc2"), asked));
}

test("every check of the Writing standard a machine can decide refuses its example and passes a plain sentence", () => {
  const caught = {
    "a dash": `The scan ran ${String.fromCharCode(0x2014)} and found nothing.`,
    "a semicolon": "The scan ran; it found nothing.",
    "a flipped pair": "It isn't a bug, it's a missing check.",
    "a trailing which clause": "That takes records from those months, which a repository does not keep.",
    "a cleft sentence": "It is the scan that finds them.",
    "a being appositive": "The guard, being shared, covers every route.",
    "a passive with its actor": "The report is written by the plugin.",
    "a double negative": "The change is not unusual.",
    "a banned word": "This is a robust guard.",
    "an uncommon word": "The credits accrue monthly.",
    "filler": "It is important to note that the scan ran.",
    "an announcement": "Two things need your decision: the scope and the date.",
    "a closer": "In summary, the guard holds.",
    "spatial framing": "The check sits at the heart of the review.",
    "commentary": "This matters because the guard is shared.",
    "a US spelling": "The organization keeps its color settings.",
    "the same opening twice running": "The scan ran over the code. The scan found two weaknesses.",
    "short sentences in a row": "The scan ran. It found two. Both are fixed.",
    "an internal status name": "This is total-gap because both items are missing.",
  };
  for (const [rule, example] of Object.entries(caught)) assert.ok(held(example).includes(rule), `${rule}: ${example} gave ${held(example)}`);
  assert.deepStrictEqual(held("The scan read every dependency your repository names and found two with known advisories, both fixed in a later release."), []);
  assert.deepStrictEqual(held("Pick the one which suits you."), []);
});

test("an advisory's text names its package once and ends each sentence with one full stop", () => {
  const { adapterFor } = require("../bin/evalation-scan");
  const out = JSON.stringify({ Results: [{ Target: "pnpm-lock.yaml", Vulnerabilities: [{
    VulnerabilityID: "CVE-1", PkgID: "undici@7.27.2", PkgName: "undici", InstalledVersion: "7.27.2", Severity: "LOW",
    Title: "undici: Undici: Response queue poisoning.", Description: "A server can inject a response." }] }] });
  const [one] = adapterFor("sca", "trivy").read(out, "/nowhere");
  assert.strictEqual(one.body, "undici: Response queue poisoning. A server can inject a response.");
});

test("a reason the pack gives is worded at print, so an earlier run's findings carry the current words", () => {
  const document = run();
  const one = document.answers.find((each) => each.pack === "soc2" && each.from === "authored" && each.status === "org-level");
  assert.ok(one, "the fixture holds an org-level answer from the pack");
  one.because = "This old wording, which a repository does not record, is gone.";
  assert.doesNotMatch(opened(document), /This old wording/);
});

test("spelling follows the person's locale, and a line written once reads right in either", () => {
  assert.strictEqual(spellingOf({ LANG: "en_NZ.UTF-8" }, null), "commonwealth");
  assert.strictEqual(spellingOf({ LANG: "en_US.UTF-8" }, null), "us");
  assert.strictEqual(spellingOf({ LANG: "en_US.UTF-8" }, "British English"), "commonwealth");
  assert.strictEqual(spellingOf({ LANG: "en_GB.UTF-8" }, "American English"), "us");
  assert.strictEqual(spellingOf({}, null, "en_US@rg=nzzzzz"), "commonwealth");
  assert.strictEqual(spellingOf({ LANG: "de_DE.UTF-8" }, null), "us");
  assert.strictEqual(spelled("The organisation's colour licence was analysed.", "us"), "The organization's color license was analyzed.");
  assert.strictEqual(spelled("Organise the colours.", "commonwealth"), "Organise the colours.");
});

test("the opening page counts in agreement and says nothing the writing rules refuse", () => {
  const text = opened({ ...run(repository()), target: { repository: "acme/app", path: "/x", kind: "solution", name: "Acme",
    repositories: [{ folder: "api", repository: "acme/api", vcs: "git" }, { folder: "web", repository: "acme/web", vcs: "git" }], left_out: [] } });
  assert.match(text, /The other \w+ is about how the organisation runs/);
  assert.doesNotMatch(text, /The other 1 /);
  const work = text.slice(text.indexOf("Repositories read"), text.indexOf("Reading "));
  assert.deepStrictEqual(offences(work).map((one) => `${one.rule}: ${one.near}`), []);
});

test("only a published standard is told about records kept over a period of months", () => {
  const published = run(repository());
  assert.match(opened(published), /period of months/);
  const ours = run(repository());
  ours.packs[0] = { ...ours.packs[0], version_is_ours: true };
  assert.doesNotMatch(opened(ours), /period of months/);
});
