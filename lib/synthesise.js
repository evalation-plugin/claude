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
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function plural(count, one, many) {
  return count === 1 ? one : (many ?? `${one}s`);
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

  const corroborated = all.filter((one) => one.result && one.result !== "Agent-asserted").length;
  const models = [...new Set(all.map((one) => one.model).filter(Boolean))].sort();

  const serious = counts.Critical + counts.High;
  const depth = counts.Medium + counts.Low;

  return {
    all, counts, order, good, hardness, disciplines, clean, loud,
    corroborated, models, serious, depth,
  };
}

// The four executive-summary blocks. Each answers a different question, and the cover verdict is a
// fifth sentence rather than a copy of one of them.
function summary(held) {
  const { counts, hardness, disciplines, loud, good, serious, depth, all } = held;

  const best = [...held.order].filter((one) => one.weight > 0).reverse().slice(0, 3);

  const built = sentences(
    hardness.score === undefined || hardness.score === null
      ? `The review read ${disciplines} ${plural(disciplines, "discipline")} against the repository.`
      : `Measured across ${disciplines} independent ${plural(disciplines, "discipline")}, the ` +
        `repository scores ${hardness.score} of 100${hardness.grade ? ` (grade ${hardness.grade})` : ""}.`,
    `Each discipline was read on its own and answered on its own, so no area's result depends on ` +
    "another's, and every finding below carries the line it rests on.",
    good.length
      ? `${good.length} positive ${plural(good.length, "control")} were recorded as working as ` +
        "intended, which the score credits and which a later change could take away."
      : "No positive controls were recorded, so nothing here is credited as already holding and the " +
        "score carries no allowance for one.",
    // What was read clean belongs to the commentary's own section on it, and saying it here as well
    // would be two sections carrying one sentence.
    best.length
      ? `The strongest areas are ${list(best.map((one) => one.name))}, which carry the least ` +
        "severity-weighted risk in this review."
      : "",
  );

  const risk = sentences(
    loud.length
      ? `Risk concentrates in ${list(loud.map((one) => one.name))}, which ${loud.length === 1 ? "carries" : "carry"} ` +
        "the most severity-weighted findings in this review."
      : "No area carries a concentration of severity worth singling out.",
    loud.length
      ? `${loud[0].name} alone holds ${loud[0].findings.length} of the ${all.length} findings, ` +
        `including ${loud[0].counts.Critical} critical and ${loud[0].counts.High} high.`
      : "",
    counts.Critical
      ? `${counts.Critical} ${plural(counts.Critical, "finding")} ${counts.Critical === 1 ? "is" : "are"} ` +
        "critical, meaning the control is absent rather than thin, and they set the order of the work."
      : "No critical findings were raised, so nothing here demands attention before everything else.",
    counts.High
      ? `${counts.High} are high severity: real weaknesses in controls that exist but do not hold.`
      : "",
    counts.Medium || counts.Low
      ? `The remaining ${counts.Medium + counts.Low} are depth, and none of them changes what the ` +
        "system guarantees."
      : "",
  );

  const takes = sentences(
    serious
      ? `Closing the ${serious} critical and high ${plural(serious, "finding")} clears the material risk; ` +
        `the remaining ${depth} are hardening depth.`
      : `There is no critical or high-severity work outstanding; the ${depth} open ${plural(depth, "finding")} ` +
        "are hardening depth.",
    "Each carries a named remediation, so the work is a list of bounded fixes rather than a redesign.",
    loud.length
      ? `The work is not evenly spread: ${list(loud.map((one) => one.name))} account for ` +
        `${loud.reduce((sum, one) => sum + one.findings.length, 0)} of the ${all.length} findings ` +
        "between them, so sequencing by area closes more than sequencing by severity alone."
      : "",
    "None of it is open-ended: every finding names the change that closes it, so the list can be " +
    "estimated and worked rather than investigated first.",
  );

  const bottom = sentences(
    `${all.length} ${plural(all.length, "finding")} across ${disciplines} ` +
      `${plural(disciplines, "discipline")}, read-only` +
      (hardness.score === undefined || hardness.score === null
        ? "."
        : `, hardness ${hardness.score}/100${hardness.grade ? ` grade ${hardness.grade}` : ""}.`),
    serious
      ? `${serious} of those ${plural(serious, "finding")} ${serious === 1 ? "is" : "are"} ` +
        "critical or high and carry the risk; the rest raise the floor."
      : "Nothing critical or high is outstanding.",
    "Nothing was executed and nothing was changed: every answer is a reading of the repository as it " +
    "stands, and every one of them cites the line it rests on so it can be checked without us.",
    "The assessment reproduces: the same repository read again at the same governance revision " +
    "returns the same findings and the same score.",
  );

  // The lead under the executive summary's own heading. It has a full page width and carries what a
  // reader needs before the four panels: what was assessed, how, and what it came to.
  const lead = sentences(
    `${all.length} ${plural(all.length, "finding")} across ${disciplines} independent ` +
    `${plural(disciplines, "discipline")}, read without executing anything and without changing ` +
    "anything.",
    counts.Critical
      ? `${counts.Critical} of them are critical and ${counts.High} high, which together are the ` +
        "work that changes the risk."
      : `Nothing critical was found; ${counts.High} high-severity ${plural(counts.High, "finding")} ` +
        `${counts.High === 1 ? "is" : "are"} the work that changes the risk.`,
    hardness.score === undefined || hardness.score === null
      ? ""
      : `The repository scores ${hardness.score} of 100${hardness.grade ? `, grade ${hardness.grade}` : ""}, ` +
        "and the four panels below say how it is built, where the risk sits, what closing it takes " +
        "and what the whole of it comes to.",
  );

  // The cover says what a reader should take away in one line, written from the mix rather than
  // lifted from a block below it, so the first slide and the second do not print the same sentence.
  const verdict = sentences(
    counts.Critical
      ? "The review found critical-severity gaps, and they are the first thing to look at."
      : "The review found no critical-severity gaps.",
    serious && !counts.Critical
      ? `The work that matters is ${counts.High} high-severity ${plural(counts.High, "finding")}, ` +
        "each a bounded fix."
      : "",
    !serious ? "What remains is depth rather than structural weakness." : "",
    good.length ? `${good.length} controls were found working and are worth protecting as they are.` : "",
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
    out.push({
      headline: `${first.name} carries the most risk`,
      body: trimmed(sentences(
        `${first.name} holds ${first.findings.length} of the ${all.length} findings, including ` +
        `${first.counts.Critical} critical and ${first.counts.High} high.`,
        loud.length > 1
          ? `${list(loud.slice(1).map((one) => one.name))} follow it.`
          : "No other area comes close on weighted severity.",
        "A reader with time for one area should spend it here, because this is where a failure costs the most.",
      )),
    });
  }

  out.push({
    headline: counts.Critical ? "The findings include structural gaps" : "The findings are depth, not structure",
    body: trimmed(sentences(
      `The mix is ${counts.Critical} critical, ${counts.High} high, ${counts.Medium} medium and ` +
      `${counts.Low} low.`,
      counts.Critical
        ? "A critical finding is one where the control is absent rather than thin, so these change what " +
          "the system guarantees rather than how well it guarantees it."
        : "Nothing found requires the design to change: every item is a fix inside the existing shape " +
          "of the system.",
      serious && depth
        ? `The ${serious} at the top of the list are the ones that alter the risk; the ${depth} below ` +
          "them raise the floor."
        : "",
    )),
  });

  // Written whether or not there is anything good to report, because "we looked and found nothing
  // holding" is itself a finding and a reader who is not told it will assume it was not looked for.
  out.push({
    headline: good.length || clean.length ? "What is already holding" : "Nothing was recorded as holding",
    body: trimmed(sentences(
      good.length
        ? `${good.length} positive ${plural(good.length, "control")} were recorded: places the review ` +
          "looked for a weakness and found the control doing its job."
        : "No positive controls were recorded, so this review credits nothing as already holding and " +
          "the score carries no allowance for one.",
      clean.length
        ? `${clean.length} ${plural(clean.length, "discipline")} ${clean.length === 1 ? "was" : "were"} ` +
          `read end to end and returned nothing to fix: ${list(clean.slice(0, 4).map((one) => one.name))}.`
        : `Every one of the ${order.length} disciplines returned at least one finding, so there is no ` +
          "area this review can point at as clean.",
      good.length
        ? "These are worth naming because a change that weakens one of them is a regression nothing " +
          "else in this report would catch."
        : "That is a statement about what was found rather than about what exists: a control the " +
          "review did not reach is not a control it disproved.",
    )),
  });

  out.push({
    headline: "How far the reading was corroborated",
    body: trimmed(sentences(
      `${order.length} independent ${plural(order.length, "discipline")} read the repository` +
      (models.length ? ` across ${list(models)}` : "") + ".",
      corroborated
        ? `${corroborated} of ${all.length} findings were confirmed by a second reading or by a scanner; ` +
          `the remaining ${all.length - corroborated} rest on a single reading and are labelled as such.`
        : `Every finding rests on a single reading and is labelled agent-asserted, so each should be ` +
          "reproduced before it is acted on.",
      "Every finding cites the line it rests on, so any of them can be checked against the code directly.",
    )),
  });

  const tiers = { p0: counts.Critical, p1: counts.High, p2: counts.Medium, p3: counts.Low };
  out.push({
    headline: "What closing this actually takes",
    body: trimmed(sentences(
      `The work sorts into ${tiers.p0} first, ${tiers.p1} near-term, ${tiers.p2} should-fix and ` +
      `${tiers.p3} cleanup.`,
      // Said from the number rather than beside it. A share of seven per cent described as
      // concentrated is a sentence the figure next to it disproves.
      loud.length
        ? (() => {
          const share = Math.round((loud[0].findings.length / Math.max(1, all.length)) * 100);
          return share >= 35
            ? `It is concentrated: ${loud[0].name} alone accounts for ${share}% of it.`
            : `It is spread rather than concentrated: the heaviest area, ${loud[0].name}, holds ` +
              `${share}% of the findings, so closing it does not close the list.`;
        })()
        : "",
      "None of it is open-ended, because every finding names the change that closes it.",
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
    headline: `The risk path through ${loud[0].name}`,
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
        found.push(`${said.get(key)} and ${where} both say ${JSON.stringify(one.trim().slice(0, 60))}`);
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
    out.strengths = held.good.map((one) => one.finding).filter(Boolean);
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
  if (twice.length) throw new Error(`the narrative repeats itself:\n  ${twice.join("\n  ")}`);

  return out;
}

module.exports = { synthesise, repeated };
