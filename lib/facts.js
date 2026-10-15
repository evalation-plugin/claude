"use strict";

const { raised } = require("./errors.js");
const { line } = require("./run-say.js");

const RESULTS = ["holds", "does-not-hold", "cannot-tell"];
const MOST = 25;

function refused(causes) {
  return Object.assign(raised(`${causes.join(" ")} ${line("ev-run.facts-remedy")}`, null), { factsField: true });
}

function faultIn(entry, pack) {
  const held = entry?.facts;
  if (held === undefined) return null;
  const id = String(entry?.identifier ?? "");
  const said = (name, text) => line(name, { entry: id, pack, text });
  if (!Array.isArray(held) || held.length === 0) return said("ev-run.facts-not-list", "none");
  const seen = new Set();
  for (const one of held) {
    const text = String(one).slice(0, 80);
    if (typeof one !== "string" || one.trim() === "" || one !== one.trim() || !one.endsWith("?")) return said("ev-run.facts-not-question", text);
    if (seen.has(one)) return said("ev-run.facts-twice", text);
    seen.add(one);
  }
  return null;
}

function factsOf(entry, pack = "") {
  const fault = faultIn(entry, pack);
  if (fault) throw refused([fault]);
  return entry?.facts ?? [];
}

function checkedPacks(packs) {
  const faults = (packs ?? []).flatMap((pack) => (pack.body?.entries ?? []).map((entry) => faultIn(entry, pack.pack)).filter(Boolean));
  if (faults.length > 0) throw refused(faults);
}

function distinct(served) {
  const held = new Map();
  for (const one of served.to_read ?? []) {
    for (const entry of one.entries) {
      for (const fact of factsOf(entry, one.pack)) held.set(fact, [...(held.get(fact) ?? []), `${one.pack}/${entry.identifier}`]);
    }
  }
  return held;
}

function groupsOf(served) {
  if (served.facts) return [];
  const all = [...distinct(served).keys()];
  const parts = Math.ceil(all.length / MOST);
  const size = Math.ceil(all.length / Math.max(parts, 1));
  return Array.from({ length: parts }, (_, at) => all.slice(at * size, (at + 1) * size))
    .map((facts, at, list) => ({ group: at + 1, of: list.length, facts }));
}

function rowProblems(row, at) {
  const number = at + 1;
  if (!RESULTS.includes(row?.result)) return [line("ev-run.fact-result", { number, result: JSON.stringify(row?.result) })];
  const cites = Array.isArray(row.evidence) && row.evidence.length > 0;
  const searched = String(row.searched ?? "").trim() !== "";
  if (row.result === "holds" && !cites) return [line("ev-run.fact-no-evidence", { number })];
  if (row.result === "does-not-hold" && !cites && !searched) return [line("ev-run.fact-no-search", { number, result: row.result })];
  if (row.result === "cannot-tell" && !searched) return [line("ev-run.fact-no-search", { number, result: row.result })];
  return [];
}

function partProblems(group, part) {
  const rows = Array.isArray(part?.facts) ? part.facts : [];
  const said = [];
  const asked = new Set(group.facts);
  const seen = new Set();
  rows.forEach((row, at) => {
    if (!asked.has(row?.fact)) said.push(line("ev-run.fact-unknown", { fact: String(row?.fact).slice(0, 80) }));
    else if (seen.has(row.fact)) said.push(line("ev-run.fact-twice-row", { fact: row.fact }));
    seen.add(row?.fact);
    said.push(...rowProblems(row, at));
  });
  for (const fact of group.facts) if (!seen.has(fact)) said.push(line("ev-run.fact-missing", { number: group.group, fact }));
  return said;
}

function answerFor(pack, entry, row) {
  return {
    pack,
    entry: entry.identifier,
    status: "not-applicable",
    from: "fact",
    fact: row.fact,
    evidence: row.evidence ?? [],
    because: line("report.fact-not-applicable", { fact: row.fact }),
    justification: line("report.fact-justification", { fact: row.fact }),
  };
}

function settled(served, rows) {
  const no = new Map(rows.filter((one) => one.result === "does-not-hold").map((one) => [one.fact, one]));
  const answered = [];
  const to_read = (served.to_read ?? []).map((one) => ({
    ...one,
    entries: one.entries.filter((entry) => {
      const fact = factsOf(entry, one.pack).find((each) => no.has(each));
      if (fact) answered.push(answerFor(one.pack, entry, no.get(fact)));
      return !fact;
    }),
  }));
  return { ...served, to_read, answered: [...(served.answered ?? []), ...answered], facts: rows };
}

module.exports = { RESULTS, checkedPacks, distinct, factsOf, groupsOf, partProblems, rowProblems, settled };
