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

// The critical and high counts as found, leaving out a rank with none so a sentence never names it.
function severe(counts) {
  return [counts.Critical ? `${counts.Critical} critical` : "", counts.High ? `${counts.High} high` : ""]
    .filter(Boolean).join(" and ");
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

  return {
    all, counts, order, good, hardness, disciplines, clean, loud,
    corroborated, models, serious, depth,
  };
}

// The four executive-summary blocks. Each answers a different question, and the cover verdict is a
// fifth sentence rather than a copy of one of them.
function summary(held) {
  const { counts, hardness, disciplines, loud, good, serious, depth, all } = held;

  // The areas named as carrying the most risk are never also named as carrying the least.
  const best = [...held.order].filter((one) => one.weight > 0 && !loud.includes(one)).reverse().slice(0, 3);

  const built = sentences(
    hardness.score === undefined || hardness.score === null
      ? `The review covered ${disciplines} ${plural(disciplines, "discipline")}.`
      : `The repository scores ${hardness.score} of 100${hardness.grade ? `, grade ${hardness.grade}` : ""}, ` +
        `across ${disciplines} ${plural(disciplines, "discipline")}.`,
    good.length
      ? `We found ${good.length} ${plural(good.length, "control")} working as intended. The score ` +
        "counts them, so a change that breaks one lowers it."
      : "We found no controls working as intended, so the score gives credit for none.",
    // What was read clean belongs to the commentary's own section on it, and saying it here as well
    // would be two sections carrying one sentence.
    best.length
      ? `${list(best.map((one) => one.name))} ${best.length === 1 ? "has" : "have"} the least risk once ` +
        "findings are weighted by severity."
      : "",
  );

  const risk = sentences(
    loud.length
      ? `${list(loud.map((one) => one.name))} ${loud.length === 1 ? "carries" : "carry"} the most risk once ` +
        "findings are weighted by severity."
      : "No area stands out once findings are weighted by severity.",
    loud.length
      ? `${loud[0].name} alone has ${loud[0].findings.length} of the ${all.length} findings` +
        (severe(loud[0].counts) ? `, including ${severe(loud[0].counts)}.` : ".")
      : "",
    counts.Critical
      ? `${counts.Critical} ${plural(counts.Critical, "finding")} ${counts.Critical === 1 ? "is" : "are"} ` +
        "critical, meaning a control is missing altogether. Start there."
      : "There are no critical findings.",
    counts.High
      ? `${counts.High} ${counts.High === 1 ? "is" : "are"} high, where a control is in place and fails.`
      : "",
    depth ? `The other ${depth} ${depth === 1 ? "is" : "are"} medium, low or info.` : "",
  );

  const takes = sentences(
    serious
      ? `Fixing the ${severe(counts)} ${plural(serious, "finding")} removes the serious risk. ` +
        `The other ${depth} are lower-priority hardening.`
      : `No critical or high findings are open. The ${depth} open ${plural(depth, "finding")} ` +
        `${depth === 1 ? "is" : "are"} lower-priority hardening.`,
    "Each finding names the change that fixes it, so the work can be estimated up front.",
    loud.length > 1
      ? `${list(loud.map((one) => one.name))} hold ` +
        `${loud.reduce((sum, one) => sum + one.findings.length, 0)} of the ${all.length} findings between them.`
      : "",
  );

  const bottom = sentences(
    "We read the code without running it and changed nothing in the repository.",
    "Every finding cites the file and lines it rests on, so anyone can check it against the code.",
  );

  // The lead under the executive summary's own heading. It has a full page width and carries what a
  // reader needs before the four panels: what was assessed and what it came to.
  const lead = sentences(
    `${all.length} ${plural(all.length, "finding")} across ${disciplines} ${plural(disciplines, "discipline")}.`,
    serious
      ? `${counts.Critical ? "" : "None is critical. "}The ${severe(counts)} ` +
        `${plural(serious, "finding")} ${serious === 1 ? "is the one that changes" : "are the ones that change"} the risk.`
      : "None is critical or high.",
  );

  // The cover says what a reader should take away in one line, written from the mix rather than
  // lifted from a block below it, so the first slide and the second do not print the same sentence.
  const verdict = sentences(
    counts.Critical
      ? `The review found ${counts.Critical} critical ${plural(counts.Critical, "finding")}, and ` +
        `${counts.Critical === 1 ? "it comes" : "they come"} first.`
      : "The review found no critical findings.",
    serious && !counts.Critical
      ? `The ${counts.High} high ${plural(counts.High, "finding")} matter most.`
      : "",
    !serious ? "What is left is lower-priority hardening." : "",
    good.length ? `${good.length} controls were found working and are worth keeping as they are.` : "",
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
        `${first.name} holds ${first.findings.length} of the ${all.length} findings` +
        (severe(first.counts) ? `, including ${severe(first.counts)}.` : "."),
        loud.length > 1
          ? `${list(loud.slice(1).map((one) => one.name))} come next.`
          : "No other area comes close once findings are weighted by severity.",
        "With time for one area, start here.",
      )),
    });
  }

  out.push({
    headline: counts.Critical ? "Some controls are missing altogether" : "No control is missing altogether",
    body: trimmed(sentences(
      `The mix is ${counts.Critical} critical, ${counts.High} high, ${counts.Medium} medium, ` +
      `${counts.Low} low and ${counts.Info} info.`,
      counts.Critical
        ? "A critical finding means a control is missing, so it changes what the system can promise."
        : "Each finding is a weakness in a control that is already there.",
      serious && depth
        ? `The ${severe(counts)} ${plural(serious, "finding")} change the risk, and the other ${depth} make the ` +
          "system harder to break."
        : "",
    )),
  });

  // Written whether or not there is anything good to report, because "we looked and found nothing
  // holding" is itself a finding and a reader who is not told it will assume it was not looked for.
  out.push({
    headline: good.length || clean.length ? "What is already holding" : "Nothing was recorded as holding",
    body: trimmed(sentences(
      good.length
        ? `${good.length} ${plural(good.length, "control")} ${good.length === 1 ? "was" : "were"} found ` +
          "working: places where we looked for a weakness and found the control doing its job."
        : "We found no controls working as intended.",
      // Four names is what the slide holds. Past that the sentence says it is naming some of them,
      // since a count of five followed by four names reads as a miscount.
      clean.length
        ? `${clean.length} ${plural(clean.length, "discipline")} found nothing to fix` +
          (clean.length > 4
            ? `, among them ${list(clean.slice(0, 4).map((one) => one.name))}.`
            : `: ${list(clean.map((one) => one.name))}.`)
        : order.length === 1 ? "The one discipline read found something to fix."
        : `All ${order.length} disciplines found at least one thing to fix.`,
      good.length
        ? "They are listed so a change that weakens one gets noticed."
        : "A control the review did not reach may still exist.",
    )),
  });

  out.push({
    headline: "How far the reading was corroborated",
    body: trimmed(sentences(
      `We read the repository against ${order.length} ${plural(order.length, "discipline")}` +
      (models.length ? `, using ${list(models)}` : "") + ".",
      corroborated
        ? `${corroborated} of ${all.length} findings were confirmed by a second check or found by a scanner. ` +
          `The other ${all.length - corroborated} rest on one reading and are marked asserted.`
        : "Every finding rests on one reading and is marked asserted, so check each against the code " +
          "before acting on it.",
    )),
  });

  const tiers = { p0: counts.Critical, p1: counts.High, p2: counts.Medium, p3: counts.Low + counts.Info };
  out.push({
    headline: "What the fixes take",
    body: trimmed(sentences(
      `The work splits into ${tiers.p0} to do first, ${tiers.p1} near-term, ${tiers.p2} should-fix and ` +
      `${tiers.p3} cleanup.`,
      // Said from the number rather than beside it. A share of seven per cent described as
      // concentrated is a sentence the figure next to it disproves.
      loud.length
        ? (() => {
          const share = Math.round((loud[0].findings.length / Math.max(1, all.length)) * 100);
          return share >= 35
            ? `${loud[0].name} alone has ${share}% of it.`
            : `The heaviest area, ${loud[0].name}, has ${share}% of the findings, so the work is spread ` +
              "across the system.";
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
