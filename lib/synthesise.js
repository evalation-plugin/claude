// synthesise - the narrative a run has earned, derived from its own findings.
//
// The deck carries slots the findings file has no field for: the verdict on the cover, the executive
// summary, the commentary, the risk path, the strengths and the roadmap. This writes them from the
// findings themselves.
//
// **No model is in it.** The same findings produce the same words every time, so two runs of one
// repository can be compared and a customer can re-run and get their report back rather than a new
// opinion. A sentence here is arithmetic over the findings dressed as English, and where the findings
// do not support a sentence, the sentence is not written.
//
// **Nothing is said twice.** Each section is computed from a different measurement: where the weight
// sits, what the severity mix means, what held up, how well corroborated the reading is, and what
// closing actually takes. A reader who has read one section learns something new from the next, and a
// check at the end refuses output where two sections share a sentence.
//
// **Anything already present is kept.** A hand-written or model-written narrative in the findings file
// wins over what this derives, so this only fills what is missing.
"use strict";

const { raised } = require("./errors.js");
const { entries, say } = require("./say.js");

const said = (name, values) => say(entries(), name, values);

// What a finding of each severity is worth when ranking where the risk actually sits. Critical
// dominates by design: one critical finding matters more than a page of low ones, and a ranking that
// treats them additively puts the noisiest area on top rather than the most dangerous.
const WEIGHT = { Critical: 100, High: 20, Medium: 5, Low: 1, Info: 0 };

// What a commentary body may run to. Five blocks have to sit on one slide with clear space between
// them, and the slide holds about this much each: written longer, the blocks fill every gap and the
// page reads as one wall of text however much is in it.
//
// It is a bound on each block rather than on the commentary, which is why five of them still carry
// more than the four longer ones did.
const BODY_LIMIT = 240;

// The executive-summary panels are three times the size of a commentary block, so they carry three
// times the words. One bound for both left the four panels a third full, which is the slide a reader
// spends the longest on saying the least.
const SUMMARY_LIMIT = 700;

// The cover carries one sentence under four numbers, and nothing else fits beside them.
const VERDICT_LIMIT = 320;

function issues(document) {
  const out = [];
  for (const category of document.categories ?? []) {
    if (!category || category.positive) continue;
    for (const one of category.findings ?? []) {
      if (one && one.sev !== "Positive") out.push({ ...one, category: category.name ?? "" });
    }
  }
  return out;
}

function counted(findings) {
  const held = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
  for (const one of findings) {
    if (held[one.sev] !== undefined) held[one.sev] += 1;
  }
  return held;
}

function weighed(findings) {
  return findings.reduce((sum, one) => sum + (WEIGHT[one.sev] ?? 0), 0);
}

// Categories ordered by how much weighted severity each carries. Ties break on the name so the same
// findings always order the same way.
function ranked(document) {
  return (document.categories ?? [])
    .filter((one) => one && !one.positive)
    .map((one) => ({
      name: one.name ?? "",
      findings: one.findings ?? [],
      weight: weighed(one.findings ?? []),
      counts: counted(one.findings ?? []),
    }))
    .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name));
}

function list(names) {
  if (!names.length) return "";
  if (names.length === 1) return names[0];
  return said("shared.list-and", { rest: names.slice(0, -1).join(", "), last: names[names.length - 1] });
}

function plural(count, word) {
  return said(`shared.noun-${word}`, { count: String(count) });
}

function severe(counts) {
  return list([counts.Critical ? said("summary.severe-critical", { count: String(counts.Critical) }) : "",
    counts.High ? said("summary.severe-high", { count: String(counts.High) }) : ""].filter(Boolean));
}

// A sentence only where the number behind it is real. Written this way so a run with nothing to say
// about something says nothing, rather than saying it has none of it.
function sentences(...parts) {
  return parts.filter(Boolean).join(" ");
}

// Kept to whole sentences. Cutting at a character leaves a clause hanging, and a report that ends a
// sentence with a semicolon and nothing after it reads as broken rather than as brief: the words are
// what a reader judges the assessment by, so the last one has to be the one that was meant.
function trimmed(text, limit = BODY_LIMIT) {
  const whole = String(text ?? "").trim();
  if (whole.length <= limit) return whole;

  // A sentence ends at a full stop that is not part of a number and is followed by a capital. Split
  // on every full stop instead and a model version ends one: "Opus 4.8" became a sentence ending in
  // "4" and one beginning "8.", which is what a reader would call broken.
  const said = whole.split(/(?<=[^0-9]\.)\s+(?=[A-Z(])/);
  let out = "";
  for (const one of said) {
    if (out && `${out} ${one}`.trim().length > limit) break;
    out = out ? `${out} ${one}` : one;
  }
  return (out.trim() || said[0].trim());
}

function positives(document) {
  const out = [];
  for (const category of document.categories ?? []) {
    for (const one of category?.findings ?? []) {
      if (one?.sev === "Positive") out.push(one);
    }
  }
  return out;
}

function build(document) {
  const all = issues(document);
  const counts = counted(all);
  const order = ranked(document);
  const good = positives(document);
  const hardness = document.hardness ?? {};
  const disciplines = order.length;
  const clean = order.filter((one) => one.findings.length === 0);
  const loud = order.filter((one) => one.weight > 0).slice(0, 3);

  const corroborated = all.filter((one) => one.result && one.result !== "asserted").length;
  const models = [...new Set(all.map((one) => one.model).filter(Boolean))].sort();

  const serious = counts.Critical + counts.High;
  const depth = counts.Medium + counts.Low + counts.Info;

  const read = (document.solution?.repositories ?? []).filter((one) => one.vcs === "git").length;
  const whole = document.solution ? said("summary.whole-product", { count: String(read) }) : said("shared.whole-one");
  return {
    all, counts, order, good, hardness, disciplines, clean, loud,
    corroborated, models, serious, depth, whole,
  };
}

// The four executive-summary blocks. Each answers a different question, and the cover verdict is a
// fifth sentence rather than a copy of one of them.
function summary(held) {
  const { counts, hardness, disciplines, loud, good, serious, depth, all } = held;

  // The areas named as carrying the most risk are never also named as carrying the least.
  const best = [...held.order].filter((one) => one.weight > 0 && !loud.includes(one)).reverse().slice(0, 3);

  const n = String;
  const built = sentences(
    hardness.score === undefined || hardness.score === null
      ? said("summary.covered", { count: n(disciplines), disciplines: plural(disciplines, "discipline") })
      : said(hardness.grade ? "summary.score-graded" : "summary.score", { whole: said(held.whole === said("shared.whole-one") ? "summary.whole-repository-start" : "summary.whole-product-start"),
        score: n(hardness.score), ...(hardness.grade ? { grade: n(hardness.grade) } : {}), count: n(disciplines), disciplines: plural(disciplines, "discipline") }),
    good.length
      ? said("summary.good", { count: n(good.length), controls: plural(good.length, "control") })
      : said("summary.good-none"),
    best.length ? said("summary.least", { names: list(best.map((one) => one.name)), count: n(best.length) }) : "",
  );

  const risk = sentences(
    loud.length
      ? said("summary.most", { names: list(loud.map((one) => one.name)), count: n(loud.length) })
      : said("summary.most-none"),
    loud.length
      ? said(severe(loud[0].counts) ? "summary.alone-including" : "summary.alone",
        { name: loud[0].name, count: n(loud[0].findings.length), total: n(all.length), ...(severe(loud[0].counts) ? { severe: severe(loud[0].counts) } : {}) })
      : "",
    counts.Critical ? said("summary.critical", { count: n(counts.Critical) }) : said("summary.critical-none"),
    counts.High ? said("summary.high", { count: n(counts.High) }) : "",
    depth ? said("summary.rest", { count: n(depth) }) : "",
  );

  const takes = sentences(
    serious
      ? (depth
        ? said("summary.serious-fix", { severe: severe(counts), findings: plural(serious, "finding"), count: n(depth) })
        : said("summary.serious-fix-only", { severe: severe(counts), findings: plural(serious, "finding") }))
      : said("summary.no-serious", { count: n(depth) }),
    said("summary.each-names-fix"),
    loud.length > 1
      ? said("summary.between", { names: list(loud.map((one) => one.name)), count: n(loud.reduce((sum, one) => sum + one.findings.length, 0)), total: n(all.length) })
      : "",
  );

  const bottom = said("summary.untouched", { whole: held.whole });

  const lead = sentences(
    said("summary.lead-count", { count: n(all.length), findings: plural(all.length, "finding"), areas: n(disciplines), disciplines: plural(disciplines, "discipline") }),
    serious && !counts.Critical ? said("summary.lead-none-critical") : "",
    serious ? said("summary.lead-serious", { severe: severe(counts), count: n(serious) }) : said("summary.lead-calm"),
  );

  const verdict = sentences(
    counts.Critical ? said("summary.verdict-critical", { count: n(counts.Critical) }) : said("summary.verdict-none"),
    serious && !counts.Critical ? said("summary.verdict-high", { count: n(counts.High) }) : "",
    !serious ? said("summary.verdict-hardening") : "",
    good.length ? said("summary.verdict-good", { count: n(good.length) }) : "",
  );

  return {
    // The cover's sentence is bound by the space beside four numbers; the four summary panels are
    // bound by the panels, which are far larger. One bound for both left every panel a third full.
    verdict: trimmed(verdict, VERDICT_LIMIT),
    lead: trimmed(lead, SUMMARY_LIMIT),
    build_quality: trimmed(built, SUMMARY_LIMIT),
    where_risk: trimmed(risk, SUMMARY_LIMIT),
    what_it_takes: trimmed(takes, SUMMARY_LIMIT),
    bottom_line: trimmed(bottom, SUMMARY_LIMIT),
  };
}

// Five paragraphs, each measuring something the others do not: where the weight sits, what the mix
// means, what held, how well corroborated the reading is, and what closing takes. Written to be worth
// reading in full rather than to fill the slide.
function commentary(held) {
  const { counts, order, good, loud, clean, corroborated, models, all, serious, depth } = held;
  const out = [];

  if (loud.length) {
    const first = loud[0];
    const heavy = severe(first.counts);
    out.push({
      headline: said("summary.c-heaviest-title", { name: first.name }),
      body: trimmed(sentences(
        said(heavy ? "summary.c-heaviest-holds-including" : "summary.c-heaviest-holds",
          { name: first.name, count: String(first.findings.length), total: String(all.length), ...(heavy ? { severe: heavy } : {}) }),
        loud.length > 1
          ? said("summary.c-next", { names: list(loud.slice(1).map((one) => one.name)), count: String(loud.length - 1) })
          : said("summary.c-next-none"),
      )),
    });
  }

  out.push({
    headline: said(counts.Critical ? "summary.c-missing-title" : "summary.c-none-missing-title"),
    body: trimmed(sentences(
      said("summary.c-mix", { critical: String(counts.Critical), high: String(counts.High), medium: String(counts.Medium), low: String(counts.Low), info: String(counts.Info) }),
      said(counts.Critical ? "summary.c-critical-means" : "summary.c-weakness"),
      serious && depth ? said("summary.c-change", { severe: severe(counts), count: String(serious), depth: String(depth) }) : "",
    )),
  });

  // Written whether or not there is anything good to report, because "we looked and found nothing
  // holding" is itself a finding and a reader who is not told it will assume it was not looked for.
  out.push({
    headline: said(good.length || clean.length ? "summary.c-holding-title" : "summary.c-nothing-holding-title"),
    body: trimmed(sentences(
      good.length ? said("summary.c-good", { count: String(good.length) }) : said("summary.c-good-none"),
      clean.length
        ? (clean.length > 4
          ? said("summary.c-clean-among", { count: String(clean.length), names: list(clean.slice(0, 4).map((one) => one.name)) })
          : said("summary.c-clean", { count: String(clean.length), names: list(clean.map((one) => one.name)) }))
        : order.length === 1 ? said("summary.c-one-found")
        : said("summary.c-all-found", { count: String(order.length) }),
      good.length ? "" : said("summary.c-unreached"),
    )),
  });

  out.push({
    headline: said("summary.c-checks-title"),
    body: trimmed(sentences(
      said(models.length ? "summary.c-read-using" : "summary.c-read",
        { whole: held.whole, count: String(order.length), disciplines: plural(order.length, "discipline"), ...(models.length ? { models: list(models) } : {}) }),
      corroborated === all.length && corroborated > 0
        ? said("summary.c-confirmed-all", { total: String(all.length) })
        : corroborated
        ? said("summary.c-confirmed", { count: String(corroborated), total: String(all.length), rest: String(all.length - corroborated) })
        : said("summary.c-unconfirmed"),
    )),
  });

  const tiers = { p0: counts.Critical, p1: counts.High, p2: counts.Medium, p3: counts.Low + counts.Info };
  out.push({
    headline: said("summary.c-fixes-title"),
    body: trimmed(sentences(
      said("summary.c-tiers", { p0: String(tiers.p0), p1: String(tiers.p1), p2: String(tiers.p2), p3: String(tiers.p3) }),
      // Said from the number rather than beside it. A share of seven per cent described as
      // concentrated is a sentence the figure next to it disproves.
      loud.length
        ? (() => {
          const share = Math.round((loud[0].findings.length / Math.max(1, all.length)) * 100);
          return said(share >= 35 ? "summary.c-share-high" : "summary.c-share-spread", { name: loud[0].name, share: String(share) });
        })()
        : "",
    )),
  });

  return out;
}

// The chain worth reading: the heaviest findings in the heaviest area, in severity order, said as the
// steps they would actually be taken in.
function riskPath(held) {
  const { loud, all } = held;
  if (!loud.length) return null;

  const order = ["Critical", "High", "Medium", "Low", "Info"];
  const worst = [...loud[0].findings]
    .sort((a, b) => order.indexOf(a.sev) - order.indexOf(b.sev)
      || String(a.id).localeCompare(String(b.id)))
    .slice(0, 4);
  if (!worst.length) return null;

  return {
    headline: said("summary.path-title", { name: loud[0].name }),
    steps: worst.map((one, at) => ({
      title: `${at + 1} - ${one.id ?? ""}`,
      detail: trimmed(`${one.finding ?? ""}`),
    })),
    fix: trimmed(worst[0].remediation ?? ""),
    _ids: worst.map((one) => one.id),
    _total: all.length,
  };
}

// Each tier carries where its work lands as well as how much of it there is. A tier that is only a
// list of identifiers tells a reader nothing they can act on: what they need to know is how much
// work, which parts of the system it is in, and what the tier means.
function roadmap(held) {
  const tiers = { p0: [], p1: [], p2: [], p3: [] };
  const into = { Critical: "p0", High: "p1", Medium: "p2", Low: "p3", Info: "p3" };
  for (const one of held.all) {
    const tier = into[one.sev];
    if (tier) {
      tiers[tier].push({ id: one.id ?? "", title: one.finding ?? "", where: one.category ?? "" });
    }
  }
  return tiers;
}

// Two disciplines finding the same class of thing is worth more than either finding it alone, so the
// themes are the classes that appear in more than one.
function themes(held) {
  const seen = new Map();
  for (const one of held.all) {
    const key = String(one.finding ?? "").toLowerCase().split(/\s+/).slice(0, 4).join(" ");
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, { theme: one.finding ?? "", ids: [], where: new Set() });
    seen.get(key).ids.push(one.id);
    seen.get(key).where.add(one.category);
  }
  return [...seen.values()]
    .filter((one) => one.where.size > 1)
    .slice(0, 5)
    .map((one) => ({ theme: one.theme, finding_ids: one.ids }));
}

// Nothing may be said twice. Two sections carrying one sentence is the failure this catches: it reads
// as a report with less in it than its page count claims.
function repeated(document) {
  const said = new Map();
  const found = [];

  const add = (where, text) => {
    for (const one of String(text ?? "").split(/(?<=\.)\s+/)) {
      const key = one.trim().toLowerCase();
      if (key.length < 25) continue;
      if (said.has(key) && said.get(key) !== where) {
        found.push(`${said.get(key)} and ${where} both say ${JSON.stringify(one.trim().slice(0, 60))}`); // say:allow: machine, a build fault no person reads
      }
      said.set(key, where);
    }
  };

  for (const [name, value] of Object.entries(document.exec_summary ?? {})) add(`exec_summary.${name}`, value);
  (document.commentary ?? []).forEach((one, at) => add(`commentary[${at}]`, one.body));
  return found;
}

function synthesise(document) {
  const out = { ...document };
  const held = build(out);

  if (!out.exec_summary || !Object.keys(out.exec_summary).length) out.exec_summary = summary(held);
  if (!out.commentary || (Array.isArray(out.commentary) && !out.commentary.length)) {
    out.commentary = commentary(held);
  }
  if (!out.strengths || !out.strengths.length) {
    out.strengths = held.good.map((one) => one.title || one.finding).filter(Boolean);
  }
  if (!out.roadmap || !Object.values(out.roadmap).some((one) => one?.length)) {
    out.roadmap = roadmap(held);
  }
  if (!out.risk_path || !out.risk_path.steps?.length) {
    const path = riskPath(held);
    if (path) out.risk_path = path;
  }
  if (!out.convergent_themes || !out.convergent_themes.length) out.convergent_themes = themes(held);

  const twice = repeated(out);
  if (twice.length) throw raised(`the narrative repeats itself:\n  ${twice.join("\n  ")}`, null); // say:allow: machine, a build fault no person reads

  return out;
}

module.exports = { synthesise, repeated };
