"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { repository, run, scanned } = require("./fixture.js");
const { page } = require("../bin/evalation-report");
const { browser, print, settled } = require("../lib/print.js");
const { readingOf } = require("../lib/prose.js");

const tree = repository();
scanned(tree, []);

const criteria = ["PRO-16", "PRO-06", "ISM-1876", "ISM-1690", "ISM-1693", "ISM-2028", "ISM-2054", "ISM-1144", "ISM-0380", "ISM-1550", "ISM-1558", "ISM-1913"];

const advisory = (name, version, id) => ({ key: `sca:${name}@${version}:${id}`, phase: "sca", severity: "moderate", title: `${id} in ${name} ${version}`,
  package: name, version, fixed: "99.0.0", transitive: true, relation: "transitive", at: { path: "pnpm-lock.yaml" }, body: "An advisory in the package.", cwe: [] });

const bearing = (names) => {
  const document = run(tree);
  const soc2 = document.packs[0];
  soc2.entries_asked = criteria.map((identifier) => ({ identifier, title: `Rule ${identifier}`, intent: "How is this kept?", bears_on: "repository",
    looks_for: [{ find: "No known advisories in the pinned dependencies", proof: "scan", phase: "sca", at_least: "low" }] }));
  soc2.selected = criteria;
  document.answers = criteria.map((entry) => ({ pack: "soc2", entry, status: "covered", because: "The scan found nothing serious.",
    looked_for: [{ result: "found", evidence: [] }] }));
  document.scan = { relevant: names.flatMap((name) => [advisory(name, "10.0.0", "GHSA-aaaa-bbbb-cccc"), advisory(name, "13.0.0", "GHSA-dddd-eeee-ffff")]) };
  return document;
};

const asked = (document) => {
  const map = new Map();
  for (const pack of document.packs) for (const one of pack.entries_asked ?? []) map.set(`${pack.pack}/${one.identifier}`, one);
  return map;
};

const html = (document) => page(document, document.answers.filter((one) => one.pack === "soc2"), asked(document));

const MEASURE = `<script>
var waiting = setInterval(function () {
  if (document.body.getAttribute('data-fonts') !== 'ready') return;
  clearInterval(waiting);
  var cards = document.querySelectorAll('.entry[data-lens="Scanner results"]:not(.part)');
  var found = [];
  for (var c = 0; c < cards.length; c++) {
    var card = cards[c];
    var box = card.getBoundingClientRect();
    var title = card.querySelector('.ttl').getBoundingClientRect();
    var past = 0;
    var all = card.querySelectorAll('*');
    for (var a = 0; a < all.length; a++) {
      var range = document.createRange();
      range.selectNodeContents(all[a]);
      var edge = range.getBoundingClientRect();
      if (edge.width && edge.right - box.right > 1) past++;
    }
    found.push({ name: card.querySelector('.id').textContent, share: title.width / box.width, past: past });
  }
  document.body.setAttribute('data-measured', JSON.stringify(found));
}, 50);
</script>`;

const measured = (document) => {
  const file = join(mkdtempSync(join(tmpdir(), "evalation-head-")), "pack.html");
  writeFileSync(file, `${html(document)}${MEASURE}`);
  const laid = settled(browser(), file);
  return JSON.parse(laid.match(/data-measured="([^"]*)"/)[1].replace(/&quot;/g, '"'));
};

const printed = (document, change = (text) => text) => {
  const folder = mkdtempSync(join(tmpdir(), "evalation-head-"));
  return print(change(html(document)), join(folder, "pack.html"), join(folder, "pack.pdf"), null, readingOf(document));
};

test("a scanner card bearing on twelve criteria keeps its title at full width and inside the card", () => {
  const document = bearing(["uuid", "@opentelemetry/instrumentation-knex"]);
  const cards = measured(document);
  assert.strictEqual(cards.length, 2);
  for (const card of cards) {
    assert.ok(card.share > 0.5, `${card.name} title is ${Math.round(card.share * 100)} percent of its card`);
    assert.strictEqual(card.past, 0, `${card.name} has text past its card's right edge`);
  }
  assert.strictEqual(printed(document).printed, true);
});

test("the page check refuses a title laid out narrow in its card", () => {
  const narrow = (text) => text.replace("</style>", ".entry .ttl{max-width:0.6in}</style>");
  assert.throws(() => printed(bearing(["uuid"]), narrow), (thrown) => thrown.unfit && thrown.faults.some((one) => /title/.test(one)));
});

test("the page check refuses text laid out past its card's right edge", () => {
  const past = (text) => text.replace("</style>", ".entry .bears{white-space:nowrap}</style>");
  assert.throws(() => printed(bearing(["uuid"]), past), (thrown) => thrown.unfit && thrown.faults.some((one) => /edge/.test(one)));
});
