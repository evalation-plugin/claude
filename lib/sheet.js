"use strict";

const { existsSync, readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { raised } = require("./errors.js");
const { entries, say } = require("./say.js");

const said = (name, values) => say(entries(), name, values);

const ASSETS = resolve(__dirname, "..", "reporting", "assets");

const PAPER = { width: 8.5, height: 11, margin: 0.45 };

const LABELS = ".pill,.grade,.tag,.obligation,h2 .split";

const CHROME = {
  page: "#070C18",
  panel: "#0E1730",
  card: "#141E3C",
  edge: "rgba(130,160,230,0.32)",
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

function mark() {
  const here = join(ASSETS, "ev-mark.svg");
  if (!existsSync(here)) {
    throw raised(`the brand mark is missing from ${here}, so this would go out unbranded`, "The plugin release is missing reporting/assets/ev-mark.svg, so reports would print without the brand mark. Include that file in the release.");
  }
  return `data:image/svg+xml;base64,${readFileSync(here).toString("base64")}`;
}

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
dl.key{margin:0;font-size:7.5pt;line-height:10pt;display:grid;grid-template-columns:1.15in 1fr;row-gap:0.03in}
dl.key dt{font-family:'JetBrains Mono',monospace;font-size:7pt;
  letter-spacing:0.08em;text-transform:uppercase;color:${CHROME.faint};padding-top:1px;padding-right:0.08in}
dl.key dd{margin:0;color:${CHROME.muted}}
dl.key.wide{grid-template-columns:1.6in 1fr}
ul.repos{margin:0.04in 0 0.08in 0.2in;padding:0;font-size:8pt;line-height:12pt;color:${CHROME.muted}}
ul.repos li{margin:0 0 0.02in 0}
ul.repos b{font-weight:600;color:${CHROME.text}}
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
.cite.item .where > span:last-child{flex:none;white-space:nowrap}
${LABELS}{flex:none;white-space:nowrap}
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
.flow .entry.continues,.flow .entry.fades-in{position:relative;background:none;border-color:transparent}
.flow .entry.continues{padding-bottom:0.22in;margin-bottom:0}
.flow .entry.fades-in{padding-top:0.30in}
.entry.continues::before,.entry.fades-in::before{content:'';position:absolute;inset:0;
  background:${CHROME.card};border:1px solid ${CHROME.edge}}
.entry.continues::before{border-bottom:none;
  -webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 0.22in),transparent);
  mask-image:linear-gradient(to bottom,#000 calc(100% - 0.22in),transparent)}
.entry.fades-in::before{border-top:none;
  -webkit-mask-image:linear-gradient(to top,#000 calc(100% - 0.30in),transparent);
  mask-image:linear-gradient(to top,#000 calc(100% - 0.30in),transparent)}
.entry.fades-in.continues::before{border-top:none;border-bottom:none;
  -webkit-mask-image:linear-gradient(to bottom,transparent,#000 0.30in,#000 calc(100% - 0.22in),transparent);
  mask-image:linear-gradient(to bottom,transparent,#000 0.30in,#000 calc(100% - 0.22in),transparent)}
.entry.continues > *,.entry.fades-in > *{position:relative}
.entry.continues > .onward{text-align:right;padding:0 0.13in;margin:-0.04in 0 0;
  font-family:'JetBrains Mono',monospace;font-size:7pt;letter-spacing:0.06em;color:${CHROME.faint}}
.entry .again{padding:0 0.13in 0.04in;font-family:'JetBrains Mono',monospace;font-size:8pt;
  letter-spacing:0.04em;color:${CHROME.muted}}
.risk{margin:0.09in 0 0;padding:0.07in 0.10in;border-left:2px solid #FFB020;
  background:rgba(255,176,32,0.07);font-size:9pt;line-height:12.5pt}
.risk b{display:block;font-family:'JetBrains Mono',monospace;font-size:7pt;letter-spacing:0.08em;
  text-transform:uppercase;color:#FFB020;font-weight:400;margin-bottom:3px}
.risk p{margin:0 0 0.03in;font-size:9pt;line-height:12.5pt}

.summary{--air:0px}
.summary h2{margin:0}
.summary .part{margin-top:calc(0.20in + var(--air) * 3)}
.summary h3{margin-bottom:calc(0.06in + var(--air) / 2)}
.summary .part p{font-size:9.5pt;line-height:14pt;color:${CHROME.text};margin:0 0 0.06in}
.summary .part p.purpose{color:${CHROME.muted}}
table.counts{width:100%;border-collapse:collapse;font-size:8.5pt;color:${CHROME.text}}
table.counts th{font-family:'JetBrains Mono',monospace;font-size:7pt;font-weight:400;letter-spacing:0.08em;
  text-transform:uppercase;color:${CHROME.faint};text-align:right;padding:calc(3px + var(--air) / 2) 6px;
  border-bottom:1px solid ${CHROME.rule}}
table.counts td{font-family:'JetBrains Mono',monospace;text-align:right;padding:calc(3px + var(--air) / 2) 6px;
  border-bottom:1px solid ${CHROME.hairline}}
table.counts th:first-child,table.counts td:first-child{text-align:left;padding-left:0}
table.counts td:first-child{font-family:'Hanken Grotesk',system-ui,sans-serif}
table.counts td.zero{color:${CHROME.faint}}
table.counts tr.total td{font-weight:700;border-bottom:none}
ol.serious{list-style:none;margin:0;padding:0}
ol.serious li{display:flex;gap:0.10in;align-items:baseline;padding:calc(3px + var(--air) / 2) 0;
  border-bottom:1px solid ${CHROME.hairline};font-size:9pt;line-height:12.5pt}
ol.serious .sid{font-family:'JetBrains Mono',monospace;font-size:8pt;font-weight:700;color:${CHROME.blue};flex:none}
ol.serious .stitle{flex:1;min-width:0}
.summary .pill{font-family:'JetBrains Mono',monospace;font-size:7pt;letter-spacing:0.06em;
  text-transform:uppercase;font-weight:700;padding:2px 7px;color:${CHROME.page}}
.summary p.more{font-family:'JetBrains Mono',monospace;font-size:7.5pt;color:${CHROME.faint};margin:0.06in 0 0}`;
}

const SCAN_SEVERITY = [["critical", "#FB3B4E"], ["high", "#F9581E"], ["medium", "#FFB020"], ["low", CHROME.blue], ["info", CHROME.blue]];
const rankOf = (severity) => { const at = SCAN_SEVERITY.findIndex(([name]) => name === severity); return at < 0 ? SCAN_SEVERITY.length : at; };
const colourOf = (severity) => SCAN_SEVERITY.find(([name]) => name === severity)?.[1] ?? CHROME.faint;

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

const WHY = [
  [/(^|\/)pnpm-lock\.yaml$/, (name) => `pnpm why ${name}`],
  [/(^|\/)package-lock\.json$/, (name) => `npm ls ${name}`],
  [/(^|\/)yarn\.lock$/, (name) => `yarn why ${name}`],
  [/(^|\/)Cargo\.lock$/, (name) => `cargo tree -i ${name}`],
  [/(^|\/)go\.sum$/, (name) => `go mod why -m ${name}`],
];

function installed(group, versions) {
  const known = group.results.every((one) => one.relation);
  const each = versions.map((version) => {
    if (!known) return version;
    const results = group.results.filter((one) => one.version === version);
    if (results.every((one) => one.relation === "direct")) return said("cards.installed-own", { version });
    const via = [...new Set(results.flatMap((one) => one.via ?? []))];
    return said("cards.installed-via", { version, via: via.length > 0 ? via.join(" and ") : "another package" });
  });
  return each.join(" · ") + (known ? "" : `. ${said("cards.installed-unknown", { count: String(versions.length) })}`);
}

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

function packageAdvice(group, plans, { upgradeTo, compared, compatible }) {
  const { name, byVersion, target, unfixed } = planOf(group, upgradeTo, compared);
  const many = group.results.length;
  if (!target) return said("cards.no-fix", { name, count: String(many) });
  const lockfile = group.results[0].at?.path ?? "";
  const why = WHY.find(([pattern]) => pattern.test(lockfile))?.[1](name);
  const fixes = unfixed === 0 ? (many === 1 ? "it" : many === 2 ? "both" : `all ${many}`) : `${many - unfixed} of the ${many}`;
  const versions = [...byVersion.keys()];
  const single = versions.length === 1;
  const known = group.results.every((one) => one.relation);
  const advice = [];
  if (!single) advice.push(said("cards.bring-copies", { which: versions.length === 2 ? "both" : `all ${versions.length}`, name, versions: versions.join(" and "), target, fixes }));
  else if (!known || group.results.every((one) => one.relation === "direct")) advice.push(said("cards.upgrade", { name, from: versions[0], target, fixes }));
  else advice.push(said("cards.version-fixes", { target, fixes }));
  const breaking = (version) => (compatible(version, target) ? "" : ` ${said("cards.breaking", { from: version, target })}`);
  if (!known) {
    if (!single) {
      advice.push(why ? said("cards.unknown-several-why", { why }) : said("cards.unknown-several"));
    } else if (why) {
      advice.push(said("cards.unknown-one-why", { why }));
    }
    advice.push(...(single ? [breaking(versions[0]).trim()].filter(Boolean) : []));
  } else {
    const own = (results) => results.every((one) => one.relation === "direct");
    for (const [version, results] of [...byVersion].sort((a, b) => Number(own(b[1])) - Number(own(a[1])))) {
      if (own(results)) {
        if (single) advice.push(breaking(version).trim());
        else advice.push(`${said("cards.own-copy", { version })}${breaking(version)}`);
        continue;
      }
      const via = [...new Set(results.flatMap((one) => one.via ?? []))];
      const parents = via.map((one) => one.replace(/ [^ ]+$/, ""));
      const planned = parents.filter((one) => plans.get(one)?.target).map((one) => `${one} to ${plans.get(one).target}`);
      const force = OVERRIDE.find(([pattern]) => pattern.test(lockfile))?.[1](name, target, parents.length === 1 ? parents[0] : null) ??
        "your package manager's override for it";
      const what = single ? `${name} ${version}` : version;
      advice.push(planned.length > 0
        ? said(why ? "cards.via-planned-why" : "cards.via-planned", { what, via: via.join(", "), count: String(planned.length), planned: planned.join(" and "), target, force, ...(why ? { why } : {}) })
        : said("cards.via", { what, via: via.length > 0 ? via.join(", ") : "another package", count: String(Math.max(via.length, 1)), name, target, force }));
      if (!compatible(version, target)) {
        advice.push(said("cards.via-breaking", { from: version, target, parents: parents.length > 0 ? parents.join(" and ") : "the package that uses it" }));
      }
    }
  }
  if (unfixed > 0) advice.push(said("cards.unfixed", { count: String(unfixed), name }));
  return advice.filter(Boolean).join(" ");
}

const historyTodo = (measure) => said(`cards.history-${["concentration", "area"].includes(measure) || !entries()[`cards.history-${measure}`] ? "owned" : measure}`);

const licenceCard = (kind) => (entries()[`cards.licence-${kind}-left`]
  ? { left: said(`cards.licence-${kind}-left`), todo: said(`cards.licence-${kind}-todo`) } : null);

function scanResults({ findings, intro, tagWord, tagOf, phaseOf, consequences, remedies, upgradeTo, compared, compatible, cardOf, shown = (path) => path }) {
  const groups = new Map();
  for (const one of findings.filter((each) => !each.names_people)) {
    const { id, name, rule } = cardOf(one);
    if (!groups.has(id)) groups.set(id, { name, phase: one.phase, results: new Map(), places: new Set(), tags: new Set() });
    const group = groups.get(id);
    const place = one.at?.path ? `${shown(one.at.path)}${one.at.from ? `:${one.at.from}` : ""}` : "";
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

  const plans = new Map(cards.filter((one) => one.phase === "sca").map((one) => [one.name, planOf(one, upgradeTo, compared)]));

  const card = (group) => {
    const many = group.results.length;
    const versions = [...new Set(group.results.map((one) => one.version))].sort(compared);
    const counted = group.phase === "sca"
      ? `${many} ${many === 1 ? "advisory" : "advisories"} in ${versions.length === 1 ? versions[0] : `versions ${versions.slice(0, -1).join(", ")} and ${versions.at(-1)}`}`
      : `${group.places.size} ${group.places.size === 1 ? "place" : "places"}`;
    const tag = group.tags.size > 0 ? `${tagWord} ${[...group.tags].join(", ")}` : "";
    const licence = group.phase === "licence" ? licenceCard(String(group.results[0].key).split(":")[1]) : null;
    const risks = licence ? [licence.left] : consequences(group.results.flatMap((one) => one.cwe ?? []));
    let todo;
    if (licence) {
      todo = licence.todo;
    } else if (group.phase === "sca") {
      todo = packageAdvice(group, plans, { upgradeTo, compared, compatible });
    } else if (group.phase === "history") {
      todo = historyTodo(String(group.results[0].key).split(":")[1]);
    } else {
      const places = [...group.places];
      const where = places.length === 1 ? said("cards.where-one", { place: places[0] }) : said("cards.where-many", { count: String(places.length) });
      const fixes = remedies(group.results.flatMap((one) => one.cwe ?? []));
      todo = fixes.length > 0
        ? `${said(group.phase === "secret" ? "cards.credential-at" : "cards.code-at", { where })} ${fixes.join(" ")}`
        : said("cards.rule-unmatched", { where, rule: group.name });
    }
    const opening = `<article class="entry opens" data-lens="Scanner results"><div class="head">` +
      `<span class="id">${escaped(group.name)}</span><span class="ttl">${escaped(`${counted}, ${phaseOf(group.phase)}`)}</span>` +
      `<span class="tag">${escaped(tag)}</span>` +
      `<span class="pill" style="background:${colourOf(group.worst)}">${escaped(group.worst)}</span></div><div class="body">` +
      (group.phase === "sca" ? `<p class="because">${escaped(said("cards.installed", { list: installed(group, versions) }))}</p>`
        : (group.results[0].body ? `<p class="because" data-quoted>${escaped(group.results[0].body)}</p>` : "")) +
      (risks.length > 0 ? `<div class="risk"><b>${escaped(said("cards.left-label"))}</b>${risks.map((one) => `<p>${escaped(one)}</p>`).join("")}</div>` : "") +
      `<div class="did"><b>${escaped(said("cards.todo-label"))}</b>${escaped(todo)}</div></div></article>`;
    const rows = group.phase === "sca"
      ? group.results.map((one) => `<div class="cite"><div class="where"><span>${escaped([
          one.rule,
          ...(versions.length > 1 ? [said("cards.advisory-version", { version: one.version })] : []),
          one.fixed ? said("cards.advisory-fixed", { fixed: one.fixed }) : said("cards.advisory-unfixed"),
          ...(one.places.size > 1 ? [said("cards.advisory-lockfiles", { count: String(one.places.size) })] : []),
        ].join(", "))}</span>` +
          `<span class="grade" style="color:${colourOf(one.severity)}">${escaped(one.severity)}</span></div>` +
          (one.body ? `<p class="looked" data-quoted>${escaped(one.body)}</p>` : "") + `</div>`)
      : [...group.places].map((place) => `<div class="cite"><div class="where"><span>${escaped(place)}</span></div></div>`);
    return opening + rows.map((row, at) =>
      `<article class="entry part${at === rows.length - 1 ? " last" : ""}" data-lens="Scanner results" data-id="${escaped(group.name)}"><div class="body">${row}</div></article>`).join("");
  };

  return `<div class="block lens" data-lens="Scanner results"><h2>${escaped(said("cards.scanner-title", { count: String(cards.length) }))}</h2>` +
    `<p class="blurb">${escaped(intro)}</p></div>` + cards.map(card).join("");
}

function summary({ purpose, shows, columns, rows, serious, none }) {
  const part = (name, label, body) => `<div class="part" data-part="${name}"><h3>${escaped(said(label))}</h3>${body}</div>`;
  const cell = (count) => `<td${count ? "" : ' class="zero"'}>${count}</td>`;
  const total = (counts) => columns.reduce((sum, one) => sum + (counts[one.key] ?? 0), 0);
  const all = Object.fromEntries(columns.map((one) => [one.key, rows.reduce((sum, row) => sum + (row.counts[one.key] ?? 0), 0)]));
  const table = `<table class="counts"><tr><th>${escaped(said("shared.summary-section"))}</th>` +
    columns.map((one) => `<th>${escaped(one.label)}</th>`).join("") + `<th>${escaped(said("shared.summary-total"))}</th></tr>` +
    rows.map((row) => `<tr data-section="${escaped(row.title)}"><td>${escaped(row.title)}</td>` +
      columns.map((one) => cell(row.counts[one.key] ?? 0)).join("") + cell(total(row.counts)) + "</tr>").join("") +
    `<tr class="total"><td>${escaped(said("shared.summary-total"))}</td>${columns.map((one) => cell(all[one.key])).join("")}${cell(total(all))}</tr></table>`;
  const listed = serious.length === 0 ? `<p class="none">${escaped(none)}</p>`
    : `<ol class="serious" data-more-say="${escaped(said("shared.summary-more", { count: "#" }))}">` +
      serious.map((one) => `<li data-entry="${escaped(one.id)}"><span class="sid">${escaped(one.id)}</span>` +
        `<span class="stitle">${escaped(one.title)}</span><span class="pill" style="background:${one.colour}">${escaped(one.label)}</span></li>`).join("") +
      "</ol>";
  return `<div class="block summary" data-summary="1"><h2>${escaped(said("shared.summary-title"))}</h2>` +
    (purpose ? part("purpose", "shared.summary-purpose", `<p class="purpose">${escaped(purpose)}</p>`) : "") +
    part("shows", "shared.summary-shows", shows.filter(Boolean).map((one) => `<p>${escaped(one)}</p>`).join("")) +
    part("sections", "shared.summary-sections", table) +
    part("serious", "shared.summary-serious", listed) +
    "</div>";
}

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
    var id = block.getAttribute('data-id');
    said.textContent = lens + (id ? ', ' + id : '') + ', continued';
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

  function carryOver(from, to) {
    while (from.children.length > 1 && overflows()) to.insertBefore(from.lastElementChild, to.firstChild);
    if (!overflows()) return;
    var last = from.lastChild;
    if (last && last.nodeType === Node.TEXT_NODE) {
      var gap = from.closest('pre') ? '\\n' : ' ';
      var kept = last.textContent.split(gap);
      var moved = [];
      while (kept.length > 1 && overflows()) {
        moved.unshift(kept.pop());
        last.textContent = kept.join(gap);
      }
      if (moved.length) to.insertBefore(document.createTextNode(moved.join(gap)), to.firstChild);
    } else if (from.lastElementChild) {
      var inner = from.lastElementChild.cloneNode(false);
      to.insertBefore(inner, to.firstChild);
      carryOver(from.lastElementChild, inner);
      if (!inner.firstChild) to.removeChild(inner);
    }
  }

  function lines(label) {
    var range = document.createRange();
    range.selectNodeContents(label);
    var rects = range.getClientRects();
    var size = parseFloat(getComputedStyle(label).fontSize) || 8;
    var tops = [];
    for (var r = 0; r < rects.length; r++) {
      var top = rects[r].top;
      if (rects[r].width && tops.every(function (seen) { return Math.abs(seen - top) > size / 2; })) tops.push(top);
    }
    return tops.length;
  }

  function fit(block) {
    var list = block.querySelector('ol.serious');
    if (list) {
      var total = list.children.length;
      while (overflows() && list.children.length > 1) list.removeChild(list.lastElementChild);
      var more = null;
      while (list.children.length < total) {
        if (!more) {
          more = document.createElement('p');
          more.className = 'more';
          list.parentNode.appendChild(more);
        }
        var left = total - list.children.length;
        more.setAttribute('data-more', String(left));
        more.textContent = list.getAttribute('data-more-say').replace('#', String(left));
        if (!overflows() || list.children.length === 1) break;
        list.removeChild(list.lastElementChild);
      }
      list.removeAttribute('data-more-say');
    }
    var air = 0;
    while (air < 24 && !overflows()) {
      air += 1;
      block.style.setProperty('--air', air + 'px');
    }
    if (overflows()) block.style.setProperty('--air', Math.max(air - 1, 0) + 'px');
    var room = flow.getBoundingClientRect();
    flow.setAttribute('data-filled', String(Math.round((block.getBoundingClientRect().bottom - room.top) / room.height * 100)));
  }

  function entryOf(block) {
    var entry = block.classList.contains('entry') ? block : block.lastElementChild;
    return entry && entry.classList.contains('entry') ? entry : null;
  }

  function continues(entry) {
    var ends = !entry.classList.contains('part') || entry.classList.contains('last');
    entry.classList.remove('last');
    if (!entry.classList.contains('part')) entry.classList.add('opens');
    entry.classList.add('continues');
    var onward = document.createElement('p');
    onward.className = 'onward';
    onward.textContent = 'Continued on the next page';
    entry.appendChild(onward);
    return ends;
  }

  function undo(entry, ends) {
    entry.classList.remove('continues');
    if (!entry.classList.contains('part')) entry.classList.remove('opens');
    if (ends && entry.classList.contains('part')) entry.classList.add('last');
    entry.removeChild(entry.querySelector(':scope > .onward'));
  }

  function resumed(entry, restBody, ends) {
    var rest = entry.cloneNode(false);
    rest.className = 'entry part' + (ends ? ' last' : '') + ' fades-in';
    var id = entry.getAttribute('data-id') || (entry.querySelector('.id') || {}).textContent || '';
    var ttl = entry.getAttribute('data-title') || (entry.querySelector('.ttl') || {}).textContent || '';
    rest.setAttribute('data-id', id);
    rest.setAttribute('data-title', ttl);
    var again = document.createElement('div');
    again.className = 'again';
    again.textContent = [id, ttl.replace(/[.]$/, '')].filter(Boolean).join(' ') + ', continued';
    rest.appendChild(again);
    rest.appendChild(restBody);
    return rest;
  }

  function split(block) {
    var entry = entryOf(block);
    if (!entry) return null;
    var body = entry.querySelector(':scope > .body');
    if (!body || !overflows()) return null;
    var ends = continues(entry);
    var restBody = body.cloneNode(false);
    carryOver(body, restBody);
    if (!restBody.firstChild) {
      undo(entry, ends);
      return null;
    }
    return resumed(entry, restBody, ends);
  }

  function flowHere(block) {
    var entry = entryOf(block);
    if (!entry || entry.classList.contains('part')) return null;
    var body = entry.querySelector(':scope > .body');
    if (!body) return null;
    var ends = continues(entry);
    var restBody = body.cloneNode(false);
    var keep = 0;
    while (keep < body.children.length && /\\b(asked|because)\\b/.test(body.children[keep].className)) keep++;
    while (overflows() && body.children.length > Math.max(keep, 1)) restBody.insertBefore(body.lastElementChild, restBody.firstChild);
    var words = null;
    var last = body.lastElementChild;
    if (overflows() && last && last.classList.contains('because')) {
      var line = parseFloat(getComputedStyle(last).lineHeight) || 17;
      var kept = last.textContent.split(' ');
      var moved = [];
      while (kept.length > 1 && overflows() && last.getBoundingClientRect().height > 3 * line + 1) {
        moved.unshift(kept.pop());
        last.textContent = kept.join(' ');
      }
      words = moved.join(' ');
      if (words) {
        var carried = last.cloneNode(false);
        carried.textContent = words;
        restBody.insertBefore(carried, restBody.firstChild);
      }
    }
    if (overflows() || !restBody.firstChild) {
      if (words) {
        last.textContent = last.textContent + ' ' + words;
        restBody.removeChild(restBody.firstChild);
      }
      while (restBody.firstChild) body.appendChild(restBody.firstChild);
      undo(entry, ends);
      return null;
    }
    return resumed(entry, restBody, ends);
  }

  open();
  var blocks = Array.prototype.slice.call(source.children);
  for (var i = 0; i < blocks.length; i++) {
    var block = blocks[i];
    flow.appendChild(block);
    if (block.hasAttribute('data-summary')) {
      fit(block);
      if (i + 1 < blocks.length) open();
      continue;
    }
    if (!overflows()) continue;

    // The block does not fit where it is. On a sheet that already holds something it moves to a
    // fresh one; on an empty sheet it stays, because taking it off and only putting it back when
    // there was something else there drops any block taller than a page.
    if (flow.children.length > 1) {
      var flowed = flowHere(block);
      if (flowed) {
        blocks.splice(i + 1, 0, flowed);
        continue;
      }
      flow.removeChild(block);
      var moved = strays();
      open();
      for (var m = 0; m < moved.length; m++) flow.appendChild(moved[m]);
      // A heading moved over with the block already names it, so the page says continued only when
      // the block arrives without one.
      if (moved.length === 0) carry(block);
      flow.appendChild(block);
    }
    var rest = split(block);
    if (rest) blocks.splice(i + 1, 0, rest);
  }

  source.remove();
  var sheets = out.querySelectorAll('.sheet');
  for (var s = 0; s < sheets.length; s++) {
    sheets[s].querySelector('.foot-right').textContent = 'Page ' + (s + 1) + ' of ' + sheets.length;
    flow = sheets[s].querySelector('.flow');
    var onward = flow.querySelectorAll('.continues > .onward');
    for (var o = 0; o < onward.length; o++) onward[o].textContent = 'Continued on page ' + (s + 2);
    if (overflows()) {
      var last = flow.children[flow.children.length - 1];
      var id = last.querySelector('.id');
      flow.setAttribute('data-cut', 'page ' + (s + 1) + ', ' + (last.getAttribute('data-id') || (id ? id.textContent : 'no entry named')));
    }
    var labels = sheets[s].querySelectorAll(${JSON.stringify(LABELS)});
    for (var l = 0; l < labels.length; l++) {
      if (lines(labels[l]) < 2) continue;
      var card = labels[l].closest('.entry');
      var named = card ? card.getAttribute('data-id') || (card.querySelector('.id') || {}).textContent || '' : '';
      labels[l].setAttribute('data-wrapped', (named ? named + ' ' : '') + labels[l].textContent);
    }
  }
})();
</script>`;
}

module.exports = { CHROME, PAPER, css, escaped, faces, mark, paginator, scanResults, summary };
