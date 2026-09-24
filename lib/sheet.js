// sheet - the one page design both deliverables are drawn on.
//
// A consultant hands over the findings detail and the evidence pack together, and the two were drawn
// by two files that had drifted: different paper, different card, different rules about what a gap
// on a page means. So the chrome, the paper, the card and the paginator live here, and a change to
// the design is one edit rather than two that have to be remembered.
//
// What each builder still owns is what it is about: the findings detail owns severity, the evidence
// pack owns coverage, and neither writes into the other's vocabulary.
"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");

const ASSETS = resolve(__dirname, "..", "reporting", "assets");

// One paper for both, so a delivery is not half one size and half another. Portrait, because both
// artefacts are prose and a line across a landscape page runs past what anybody reads comfortably.
const PAPER = { width: 8.5, height: 11, margin: 0.45 };

const CHROME = {
  page: "#070C18",
  panel: "#0E1730",
  // A card and its edge, both well clear of the page. The panel the rest of the house uses sits one
  // step off it, which is enough for a single box and not enough for twenty down one page.
  card: "#141E3C",
  edge: "rgba(130,160,230,0.32)",
  // Inside a card, set below it. A bar lighter than the card it sits in reads as another card.
  inset: "#0B1226",
  rule: "#1B2748",
  hairline: "rgba(130,160,230,0.13)",
  ember: "#F9581E",
  blue: "#6B8FFF",
  text: "#E6ECF7",
  muted: "#9DAAC6",
  faint: "#6F82AB",
};

const FONTS = [
  ["Hanken Grotesk", "HankenGrotesk-Regular.ttf", 400],
  ["Hanken Grotesk", "HankenGrotesk-Bold.ttf", 700],
  ["JetBrains Mono", "JetBrainsMono-Regular.ttf", 400],
  ["JetBrains Mono", "JetBrainsMono-Bold.ttf", 700],
];

function escaped(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function faces() {
  return FONTS.map(([family, file, weight]) => {
    const data = readFileSync(join(ASSETS, "fonts", file)).toString("base64");
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
      `src:url(data:font/ttf;base64,${data}) format('truetype')}`;
  }).join("");
}

/**
 * The brand mark, read as required. Read as optional it fails quietly: the page renders, looks
 * nearly right, and goes out unbranded, which nobody notices until a customer has sent it on.
 */
function mark() {
  const here = join(ASSETS, "ev-mark.svg");
  if (!existsSync(here)) {
    throw new Error(`the brand mark is missing from ${here}, so this would go out unbranded`);
  }
  return `data:image/svg+xml;base64,${readFileSync(here).toString("base64")}`;
}

/** The whole stylesheet both deliverables draw on. What differs between them is only their colours. */
function css() {
  const { width, height, margin } = PAPER;
  return `${faces()}
@page{size:${width}in ${height}in;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:${CHROME.page};color:${CHROME.text};
  font-family:'Hanken Grotesk',system-ui,sans-serif;
  -webkit-print-color-adjust:exact;print-color-adjust:exact}

.sheet{position:relative;width:${width}in;height:${height}in;overflow:hidden;background:${CHROME.page};
  page-break-after:always;break-after:page;padding:${margin}in}
.sheet:last-child{page-break-after:auto;break-after:auto}

.masthead{position:absolute;left:${margin}in;right:${margin}in;top:0.34in;height:0.70in}
.title{font-size:18pt;font-weight:700;color:${CHROME.text};margin:0}
.subtitle{font-size:9.5pt;color:${CHROME.muted};margin:0.05in 0 0}
.mark{position:absolute;right:0;top:0.02in;height:0.42in}

/* The flow stops well clear of the foot. Ending it where the foot's own rule begins lets a last
   line print hard against the rule, which reads as a page that ran out of room. */
.flow{position:absolute;left:${margin}in;right:${margin}in;top:1.12in;bottom:0.62in;overflow:hidden}

.foot{position:absolute;left:${margin}in;right:${margin}in;bottom:0.34in;
  display:flex;justify-content:space-between;
  font-family:'JetBrains Mono',monospace;font-size:7pt;letter-spacing:0.05em;color:${CHROME.faint};
  border-top:1px solid ${CHROME.hairline};padding-top:5px}

h2{font-size:13pt;font-weight:700;color:${CHROME.text};margin:0 0 0.14in}
/* The split is one reading and wraps as one. A long section name pushed it onto a second line and
   broke it mid-count, so a heading read "C" on one line and "0" on the next. */
h2 .split{font-family:'JetBrains Mono',monospace;font-size:10pt;font-weight:400;
  white-space:nowrap}
h2 .bar-sep{color:${CHROME.rule};margin:0 5px}
/* Set open. At eight point with tight tracking the mono W runs into the H beside it and "WHERE"
   reads as "#HERE", which is the kind of thing a reader notices and cannot explain. */
h3{font-family:'JetBrains Mono',monospace;font-size:8.5pt;font-weight:400;letter-spacing:0.16em;
  text-transform:uppercase;color:${CHROME.faint};margin:0 0 0.06in}
p{font-size:9.5pt;line-height:13pt;color:${CHROME.text};margin:0 0 0.05in}
.blurb{color:${CHROME.muted};font-size:9pt;margin:0 0 0.09in}
.lede{color:${CHROME.muted};margin:0 0 0.09in}
.none{color:${CHROME.faint};font-style:italic}
.block{margin:0 0 0.15in}
/* A section opens on a gap about twice the one between its own cards, so a page reads as several
   sections and not as one column. Adjacent margins collapse to the larger of the two, so this has
   to beat a card's own bottom margin to show at all. A section at the top of a page takes no gap,
   since there is nothing above it to be separated from. */
.lens{margin-top:0.44in}
.flow > .lens:first-child{margin-top:0}
/* The last block on a sheet must not push its own margin into the measurement that decides whether
   it fits, or every sheet stops one section early. */
.flow > .block:last-child,.flow > .entry:last-child{margin-bottom:0}

/* A section said again where its cards run past the foot of a page. */
.carry{font-family:'JetBrains Mono',monospace;font-size:8pt;letter-spacing:0.1em;
  text-transform:uppercase;color:${CHROME.faint};margin:0 0 0.09in;
  border-bottom:1px solid ${CHROME.hairline};padding-bottom:4px}

.facts{display:flex;flex-wrap:wrap;gap:8px 26px;margin:0 0 0.16in;padding:0;list-style:none;
  font-size:8pt;color:${CHROME.faint}}
.facts b{display:block;color:${CHROME.text};font-weight:400;font-family:'JetBrains Mono',monospace;
  font-size:8.5pt;margin-top:2px}

.tally{display:flex;gap:7px;margin:0;padding:0;list-style:none}
/* The same surface a card sits on, so the document has one raised thing and not two. */
.tally li{flex:1 1 0;border:1px solid ${CHROME.edge};background:${CHROME.card};padding:0.08in 0.10in}
.tally .n{font-family:'JetBrains Mono',monospace;font-size:17pt;font-weight:700;line-height:1.1}
.tally .l{font-size:7.5pt;color:${CHROME.faint};margin-top:2px}
.bar{display:flex;height:6px;overflow:hidden;margin:7px 0 0;background:${CHROME.rule}}
.bar span{display:block}

/* The opening is set a half point tighter than a card. It holds the facts, the split, what was
   done and the key, and set at the cards' own size the key falls onto the second page. */
p.intro{font-size:9pt;line-height:12.5pt}
.columns{display:flex;gap:0.28in;align-items:flex-start}
.columns .column{flex:1 1 0;min-width:0}
.columns .column p{color:${CHROME.muted};font-size:8.5pt;line-height:12pt}

/* A term and what it means, side by side at a fixed term width. Set as a list the terms are a
   column of one word each with the meanings wrapping under them, which reads as prose broken in
   half and not as a key. */
dl.key{margin:0;font-size:7.5pt;line-height:10pt}
dl.key dt{float:left;clear:left;width:1.15in;font-family:'JetBrains Mono',monospace;font-size:7pt;
  letter-spacing:0.08em;text-transform:uppercase;color:${CHROME.faint};padding-top:1px}
dl.key dd{margin:0 0 0.03in 1.15in;color:${CHROME.muted}}
/* A wider term column where a term would wrap. A wrapped term is two lines tall beside a
   description that is one, which puts the next term alongside the wrong description. */
dl.key.wide dt{width:1.6in}
dl.key.wide dd{margin-left:1.6in}
/* Something that did not run, set in its own colour in both columns, so the eye finds the gaps in
   the list and does not read eight lines to work out which two are missing. */
dl.key dt.off,dl.key dd.off{color:#FFB020}

.score{margin:0.16in 0 0;text-align:center}
.chip{background:${CHROME.card};border-left:3px solid ${CHROME.ember};
  padding:0.12in 0.22in;margin:0;display:inline-flex;align-items:baseline;gap:0.10in;
  white-space:nowrap}
.chip-label{font-family:'JetBrains Mono',monospace;font-size:7.5pt;letter-spacing:0.10em;
  color:${CHROME.faint}}
.chip-score{font-size:20pt;font-weight:700;color:${CHROME.text}}
.chip-of{font-size:9pt;color:${CHROME.muted}}
.chip-grade{font-size:11pt;color:${CHROME.text}}

/* The card is what says where one entry ends and the next begins, and which of the parts on the
   page belong to which. Space alone does not do that: a reader counting blank gaps has to measure
   them against each other to tell a gap inside an entry from a gap between two. */
.entry{background:${CHROME.card};border:1px solid ${CHROME.edge};margin:0 0 0.22in;overflow:hidden}
.entry .head{display:flex;gap:0.09in;align-items:baseline;padding:0.10in 0.13in 0}
.entry .id{font-family:'JetBrains Mono',monospace;font-size:8.5pt;font-weight:700;
  color:${CHROME.blue};flex:none}
.entry .ttl{font-size:10pt;line-height:13pt;font-weight:700;flex:1;min-width:0}
.entry .tag{font-family:'JetBrains Mono',monospace;font-size:7.5pt;color:${CHROME.faint};flex:none}
.entry .pill{font-family:'JetBrains Mono',monospace;font-size:7pt;letter-spacing:0.06em;
  text-transform:uppercase;font-weight:700;padding:2px 7px;flex:none;color:${CHROME.page}}
.entry .body{padding:0 0.13in 0.12in}
.entry .body:empty{padding:0 0 0.03in}
/* The question the entry was asked, before what it answers. A reader judging whether a status is
   right has to know what was being asked. */
.asked{margin:0.07in 0 0;font-size:9pt;line-height:12.5pt;color:${CHROME.muted};font-style:italic}
.because{margin:0.07in 0 0;font-size:9pt;line-height:12.5pt;color:${CHROME.text}}

.cite{margin:0.09in 0 0}
.cite .where{display:flex;justify-content:space-between;gap:0.12in;padding:5px 9px;
  background:${CHROME.inset};font-family:'JetBrains Mono',monospace;font-size:7.5pt;
  color:${CHROME.muted}}
.cite .grade{text-transform:uppercase;letter-spacing:0.06em;font-size:7pt;align-self:center;flex:none}
/* The line the claim rests on, as it is in the file. Set in the mono face and wrapped, since a
   quote that runs off the edge of the page is a quote a reader cannot check. */
.cite pre{margin:0;padding:7px 9px;background:${CHROME.inset};border-top:1px solid ${CHROME.hairline};
  font-family:'JetBrains Mono',monospace;font-size:7.5pt;line-height:11pt;color:${CHROME.text};
  white-space:pre-wrap;word-break:break-word}
/* What was searched where an answer rests on something being absent. The same box as a quote, in the
   body face, since it is the reading's own sentence and not the repository's line. */
.cite p.looked{margin:0;padding:7px 9px;background:${CHROME.inset};border-top:1px solid ${CHROME.hairline};
  font-size:8pt;line-height:11pt;color:${CHROME.text}}
/* One thing an entry looks for. Its name is the pack's sentence, so it is set in the body face, with
   each place it was found under it in the face a location takes. */
.cite.item .where span:first-child{font-family:'Hanken Grotesk',system-ui,sans-serif;font-size:8pt;color:${CHROME.text}}
.cite .at{display:flex;justify-content:space-between;gap:0.12in;padding:4px 9px;background:${CHROME.inset};
  border-top:1px solid ${CHROME.hairline};font-family:'JetBrains Mono',monospace;font-size:7pt;color:${CHROME.muted}}

.did{margin:0.09in 0 0;padding:0.07in 0.10in;border-left:2px solid ${CHROME.ember};
  background:rgba(249,88,30,0.09);font-size:9pt;line-height:12.5pt}
.did b{display:block;font-family:'JetBrains Mono',monospace;font-size:7pt;letter-spacing:0.08em;
  text-transform:uppercase;color:${CHROME.ember};font-weight:400;margin-bottom:3px}

/* A scanner result's card. It opens as a card and each advisory or place under it is a block of
   its own, so a library with thirty advisories runs onto the next page instead of being cut off at
   the foot of this one. The pieces join into one card on the page. */
.entry.opens{margin-bottom:0;border-bottom:none}
.entry.part{margin:0;border-top:none;border-bottom:none}
.entry.part .body{padding:0 0.13in 0.05in}
.entry.part.last{border-bottom:1px solid ${CHROME.edge};margin-bottom:0.22in}
.entry.part.last .body{padding-bottom:0.12in}
.entry.part.resumes{border-top:1px solid ${CHROME.edge};padding-top:0.06in}
.risk{margin:0.09in 0 0;padding:0.07in 0.10in;border-left:2px solid #FFB020;
  background:rgba(255,176,32,0.07);font-size:9pt;line-height:12.5pt}
.risk b{display:block;font-family:'JetBrains Mono',monospace;font-size:7pt;letter-spacing:0.08em;
  text-transform:uppercase;color:#FFB020;font-weight:400;margin-bottom:3px}
.risk p{margin:0 0 0.03in;font-size:9pt;line-height:12.5pt}`;
}

// A scanner's severities worst first, and the colour each takes: red through amber is the risk
// ladder, and low sits in the house blue, as the findings detail colours its own severities.
const SCAN_SEVERITY = [["critical", "#FB3B4E"], ["high", "#F9581E"], ["medium", "#FFB020"], ["low", CHROME.blue], ["info", CHROME.blue]];
const rankOf = (severity) => { const at = SCAN_SEVERITY.findIndex(([name]) => name === severity); return at < 0 ? SCAN_SEVERITY.length : at; };
const colourOf = (severity) => SCAN_SEVERITY.find(([name]) => name === severity)?.[1] ?? CHROME.faint;

/**
 * The scanner results a report bears on, as cards under their own heading after everything else.
 * One card per library and version for dependency advisories, carrying every advisory against it,
 * and one per rule for what static analysis and the secret scan found, carrying every place it
 * fired. Each card says what the weakness is in the scanner's words, what somebody could do with it
 * if it is left, and what closes it, which for a library is the one upgrade that clears every
 * advisory against it. The worst cards come first. A report with no scanner results carries none.
 *
 * tagOf names, for one result, the report's own link to it: the criteria it bears on, or the
 * finding that cites it.
 */
// How a package manager forces a version on the copies below the fix, by the lockfile it keeps. pnpm
// selects the old copies by range, and npm and yarn scope it to the package that brings the copy in,
// so a newer major another package uses is left alone.
const OVERRIDE = [
  [/(^|\/)pnpm-lock\.yaml$/, (name, to) => `an override in package.json, "pnpm": { "overrides": { "${name}@<${to}": "^${to}" } }`],
  [/(^|\/)package-lock\.json$/, (name, to, parent) => parent
    ? `an override in package.json, "overrides": { "${parent}": { "${name}": "^${to}" } }`
    : `an override in package.json, "overrides": { "${name}": "^${to}" }`],
  [/(^|\/)yarn\.lock$/, (name, to, parent) => `a resolution in package.json, "resolutions": { "${parent ? `${parent}/` : "**/"}${name}": "^${to}" }`],
  [/(^|\/)Cargo\.lock$/, (name, to) => `cargo update -p ${name} --precise ${to}`],
  [/(^|\/)(poetry\.lock|requirements[^/]*\.txt|Pipfile\.lock|uv\.lock)$/, (name, to) => `a constraint of ${name}>=${to}`],
  [/(^|\/)go\.sum$/, (name, to) => `go get ${name}@v${to}`],
];

// The command that shows which package brings a dependency in, by the lockfile it keeps.
const WHY = [
  [/(^|\/)pnpm-lock\.yaml$/, (name) => `pnpm why ${name}`],
  [/(^|\/)package-lock\.json$/, (name) => `npm ls ${name}`],
  [/(^|\/)yarn\.lock$/, (name) => `yarn why ${name}`],
  [/(^|\/)Cargo\.lock$/, (name) => `cargo tree -i ${name}`],
  [/(^|\/)go\.sum$/, (name) => `go mod why -m ${name}`],
];

/**
 * How each installed copy of a package is there: the repository's own dependency, or brought in by
 * which of its dependencies. A scan from before the plugin read the dependency graph did not record
 * it, and the line says so.
 */
function installed(group, versions) {
  const known = group.results.every((one) => one.relation);
  const each = versions.map((version) => {
    if (!known) return version;
    const results = group.results.filter((one) => one.version === version);
    if (results.every((one) => one.relation === "direct")) return `${version}, the repository's own dependency`;
    const via = [...new Set(results.flatMap((one) => one.via ?? []))];
    return `${version}, brought in by ${via.length > 0 ? via.join(" and ") : "another package"}`;
  });
  return each.join(" · ") + (known ? "" : `. This scan did not record which package brings ${versions.length === 1 ? "it" : "each"} in.`);
}

/** One package's versions, the version that clears every advisory against every copy, and how many none does. */
function planOf(group, upgradeTo, compared) {
  const byVersion = new Map();
  for (const one of group.results) {
    if (!byVersion.has(one.version)) byVersion.set(one.version, []);
    byVersion.get(one.version).push(one);
  }
  let target = null;
  let unfixed = 0;
  for (const [version, results] of byVersion) {
    const got = upgradeTo(version, results.map((one) => one.fixed));
    unfixed += got.unfixed;
    if (got.target && (!target || compared(got.target, target) > 0)) target = got.target;
  }
  return { name: group.results[0].package, byVersion, target, unfixed };
}

/**
 * What to do about one package, in the order it has to happen. The repository's own dependency is
 * upgraded. A copy another package brings in moves when that package does, so where that package has
 * a card of its own the advice is to make its upgrade first and check what is left, and otherwise to
 * upgrade it to a release using the fixed version. An override is the fallback, confined to the old
 * copies, and a fix that is a breaking step under semantic versioning is said to be one, since
 * forcing it can break the package that asked for the old line.
 */
function packageAdvice(group, plans, { upgradeTo, compared, compatible }) {
  const { name, byVersion, target, unfixed } = planOf(group, upgradeTo, compared);
  const many = group.results.length;
  if (!target) return `No published version of ${name} fixes ${many === 1 ? "this" : "these"}, so reduce what reaches it or replace it.`;
  const lockfile = group.results[0].at?.path ?? "";
  const why = WHY.find(([pattern]) => pattern.test(lockfile))?.[1](name);
  const said = [`Bring every copy of ${name} to ${target}, which fixes ${unfixed === 0 ? (many === 1 ? "it" : `all ${many}`) : `${many - unfixed} of the ${many}`}.`];
  const breaking = (version) => (compatible(version, target) ? "" : ` ${target} is a breaking step from ${version} under semantic versioning, so check its release notes before shipping it.`);
  // A scan from before the plugin read the dependency graph marked every package direct, so a card
  // says which package brought a copy in only where the scan said, and otherwise how to find out.
  if (!group.results.every((one) => one.relation)) {
    if (byVersion.size > 1) {
      said.push(`The lockfile holds ${byVersion.size} copies, ${[...byVersion.keys()].join(" and ")}, so another package likely brings one in.` +
        `${why ? ` ${why} shows which.` : ""} Upgrade the repository's own dependency, and upgrade or override whatever brings in the other.`);
    } else {
      said.push(`Upgrade ${name}${why ? `, and where it is not a dependency of the repository's own, ${why} shows which package brings it in` : ""}.`);
    }
  } else {
    // The repository's own copy first, since it is the one upgrade fully in its hands.
    const own = (results) => results.every((one) => one.relation === "direct");
    for (const [version, results] of [...byVersion].sort((a, b) => Number(own(b[1])) - Number(own(a[1])))) {
      if (own(results)) {
        said.push(`Upgrade the repository's own dependency on ${name}, now ${version}.${breaking(version)}`);
        continue;
      }
      const via = [...new Set(results.flatMap((one) => one.via ?? []))];
      const parents = via.map((one) => one.replace(/ [^ ]+$/, ""));
      const planned = parents.filter((one) => plans.get(one)?.target).map((one) => `${one} to ${plans.get(one).target}`);
      const force = OVERRIDE.find(([pattern]) => pattern.test(lockfile))?.[1](name, target, parents.length === 1 ? parents[0] : null) ??
        "your package manager's override for it";
      said.push(planned.length > 0
        ? `${version} comes in through ${via.join(", ")}, whose own ${planned.length === 1 ? "card already calls" : "cards already call"} for upgrading ${planned.join(" and ")}. Make that upgrade first, then${why ? ` run ${why} to` : ""} check whether a copy below ${target} is left, and only if one is, force it with ${force}.`
        : `${version} comes in through ${via.length > 0 ? via.join(", ") : "another package"}: upgrade ${via.length === 1 ? "it" : "them"} to a release that uses ${name} ${target} or later, and if none does yet, force it with ${force}.`);
      if (!compatible(version, target)) {
        said.push(`${target} is a breaking step from ${version} under semantic versioning, so forcing it can break ${parents.length > 0 ? parents.join(" and ") : "the package that uses it"}: test before shipping.`);
      }
    }
  }
  if (unfixed > 0) said.push(`No published version fixes the other ${unfixed}, so reduce what reaches ${name} or replace it.`);
  return said.join(" ");
}

function scanResults({ findings, intro, tagWord, tagOf, phaseOf, consequences, remedies, upgradeTo, compared, compatible }) {
  const groups = new Map();
  for (const one of findings) {
    const rule = String(one.title ?? one.key).split(" in ")[0];
    // A package is one card whatever versions of it the lockfile holds, since one version clears all.
    const name = one.phase === "sca" ? one.package : rule;
    const id = `${one.phase}:${name}`;
    if (!groups.has(id)) groups.set(id, { name, phase: one.phase, results: new Map(), places: new Set(), tags: new Set() });
    const group = groups.get(id);
    const place = one.at?.path ? `${one.at.path}${one.at.from ? `:${one.at.from}` : ""}` : "";
    if (!group.results.has(one.key)) group.results.set(one.key, { ...one, rule, places: new Set() });
    group.results.get(one.key).places.add(place);
    group.places.add(place);
    for (const tag of tagOf(one)) group.tags.add(tag);
  }
  if (groups.size === 0) return "";

  const cards = [...groups.values()].map((group) => {
    const results = [...group.results.values()].sort((a, b) => rankOf(a.severity) - rankOf(b.severity) || a.rule.localeCompare(b.rule));
    return { ...group, results, worst: results[0].severity };
  }).sort((a, b) => rankOf(a.worst) - rankOf(b.worst) || b.results.length - a.results.length || a.name.localeCompare(b.name));

  // Each package's own upgrade, so a copy another package brings in can point at that package's card.
  const plans = new Map(cards.filter((one) => one.phase === "sca").map((one) => [one.name, planOf(one, upgradeTo, compared)]));

  const card = (group) => {
    const many = group.results.length;
    const versions = [...new Set(group.results.map((one) => one.version))].sort(compared);
    const counted = group.phase === "sca"
      ? `${many} ${many === 1 ? "advisory" : "advisories"} in ${versions.length === 1 ? versions[0] : `versions ${versions.slice(0, -1).join(", ")} and ${versions.at(-1)}`}`
      : `${group.places.size} ${group.places.size === 1 ? "place" : "places"}`;
    const tag = group.tags.size > 0 ? `${tagWord} ${[...group.tags].join(", ")}` : "";
    const risks = consequences(group.results.flatMap((one) => one.cwe ?? []));
    let todo;
    if (group.phase === "sca") {
      todo = packageAdvice(group, plans, { upgradeTo, compared, compatible });
    } else {
      // The place and the fix for the class of weakness the rule reports. Where no class is known the
      // card says which rule to satisfy, and never points at a description it may not carry.
      const places = [...group.places];
      const where = places.length === 1 ? `at ${places[0]}` : `at each of the ${places.length} places listed`;
      const fixes = remedies(group.results.flatMap((one) => one.cwe ?? []));
      todo = fixes.length > 0
        ? `${group.phase === "secret" ? "For the credential" : "Change the code"} ${where}. ${fixes.join(" ")}`
        : `Change the code ${where} so the ${group.name} rule no longer finds it.`;
    }
    const opening = `<article class="entry opens" data-lens="Scanner results"><div class="head">` +
      `<span class="id">${escaped(group.name)}</span><span class="ttl">${escaped(`${counted}, ${phaseOf(group.phase)}`)}</span>` +
      `<span class="tag">${escaped(tag)}</span>` +
      `<span class="pill" style="background:${colourOf(group.worst)}">${escaped(group.worst)}</span></div><div class="body">` +
      (group.phase === "sca" ? `<p class="because">${escaped(`Installed: ${installed(group, versions)}`)}</p>`
        : (group.results[0].body ? `<p class="because" data-quoted>${escaped(group.results[0].body)}</p>` : "")) +
      (risks.length > 0 ? `<div class="risk"><b>If it is left</b>${risks.map((one) => `<p>${escaped(one)}</p>`).join("")}</div>` : "") +
      `<div class="did"><b>What to do</b>${escaped(todo)}</div></div></article>`;
    // Under the card, each advisory with what it is, or each place the rule fired.
    const rows = group.phase === "sca"
      ? group.results.map((one) => `<div class="cite"><div class="where"><span>${escaped(one.rule)}` +
          `${versions.length > 1 ? escaped(`, in ${one.version}`) : ""}` +
          `${one.fixed ? escaped(`, fixed in ${one.fixed}`) : ", no fixed version"}` +
          `${one.places.size > 1 ? escaped(`, in ${one.places.size} lockfiles`) : ""}</span>` +
          `<span class="grade" style="color:${colourOf(one.severity)}">${escaped(one.severity)}</span></div>` +
          (one.body ? `<p class="looked" data-quoted>${escaped(one.body)}</p>` : "") + `</div>`)
      : [...group.places].map((place) => `<div class="cite"><div class="where"><span>${escaped(place)}</span></div></div>`);
    return opening + rows.map((row, at) =>
      `<article class="entry part${at === rows.length - 1 ? " last" : ""}" data-lens="${escaped(group.name)}"><div class="body">${row}</div></article>`).join("");
  };

  const counted = cards.reduce((sum, one) => sum + one.results.length, 0);
  return `<div class="block lens" data-lens="Scanner results"><h2>Scanner results (${counted})</h2>` +
    `<p class="blurb">${escaped(intro)}</p></div>` + cards.map(card).join("");
}

/**
 * The script that lays the page out before it prints. A card's height depends on how its text
 * wraps, which only the browser knows, and a page number cannot be written by a stylesheet. So each
 * block is measured and moved onto a fresh sheet the moment it would cross the foot. A card is never
 * split down the middle: it moves whole.
 */
function paginator({ title, subtitle, foot }) {
  return `<div id="out"></div>
<script>
(function () {
  var source = document.getElementById('source');
  var out = document.getElementById('out');
  var title = ${JSON.stringify(title)};
  var subtitle = ${JSON.stringify(subtitle)};
  var foot = ${JSON.stringify(foot)};
  var mark = ${JSON.stringify(mark())};
  var sheet = null, flow = null;

  function open() {
    sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.innerHTML =
      '<div class="masthead"><p class="title"></p>' +
      '<p class="subtitle"></p><img class="mark"></div>' +
      '<div class="flow"></div>' +
      '<div class="foot"><span class="foot-left"></span><span class="foot-right"></span></div>';
    sheet.querySelector('.title').textContent = title;
    sheet.querySelector('.subtitle').textContent = subtitle;
    sheet.querySelector('.mark').src = mark;
    sheet.querySelector('.foot-left').textContent = foot;
    out.appendChild(sheet);
    flow = sheet.querySelector('.flow');
    return flow;
  }

  // Measured from the boxes themselves and never from scrollHeight, which counts a trailing margin
  // as content and so ends every sheet a section early.
  function overflows() {
    var last = flow.children[flow.children.length - 1];
    if (!last) return false;
    return last.getBoundingClientRect().bottom > flow.getBoundingClientRect().bottom + 0.5;
  }

  // A section continuing onto a fresh sheet names itself at the top of it. The word is spelled out
  // and not abbreviated, so a page carrying one reads as a continuation to anybody.
  function carry(block) {
    var lens = block.getAttribute('data-lens');
    if (!lens) return;
    var said = document.createElement('p');
    said.className = 'carry';
    said.textContent = lens + ', continued';
    flow.appendChild(said);
    // A piece of a card continuing onto a fresh sheet closes its top edge, so it reads as a card.
    if (block.classList.contains('part')) block.classList.add('resumes');
  }

  // A section with no cards under it must not be the last thing on a page. Left there its heading
  // reads as a footnote to the section above it, and somebody looking for that section finds it
  // where they were not looking. A section that does have a card under it is left alone: a heading
  // with its first card is a section properly opened, wherever on the page it starts.
  //
  // Taken off the end one at a time, since two empty sections in a row end a page together.
  function strays() {
    var held = [];
    while (flow.children.length > 1) {
      var last = flow.children[flow.children.length - 1];
      if (!last.classList.contains('lens') || last.querySelector('.entry')) break;
      flow.removeChild(last);
      held.unshift(last);
    }
    return held;
  }

  open();
  var blocks = Array.prototype.slice.call(source.children);
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    flow.appendChild(block);
    if (!overflows()) continue;

    // The block does not fit where it is. On a sheet that already holds something it moves to a
    // fresh one; on an empty sheet it stays, because taking it off and only putting it back when
    // there was something else there drops any block taller than a page.
    if (flow.children.length > 1) {
      flow.removeChild(block);
      var moved = strays();
      open();
      for (var m = 0; m < moved.length; m++) flow.appendChild(moved[m]);
      // A heading moved over with the block already names it, so the page says continued only when
      // the block arrives without one.
      if (moved.length === 0) carry(block);
      flow.appendChild(block);
    }
  }

  source.remove();
  var sheets = out.querySelectorAll('.sheet');
  for (var s = 0; s < sheets.length; s++) {
    sheets[s].querySelector('.foot-right').textContent = 'Page ' + (s + 1) + ' of ' + sheets.length;
  }
})();
</script>`;
}

module.exports = { CHROME, PAPER, css, escaped, faces, mark, paginator, scanResults };
