// changes - what moved between two runs of one repository.
//
// An answer carries the same id in every run of a repository, from the repository, the pack and the
// entry, and a scanner result the same key, so two runs line up exactly. What an insurer or a board
// wants from the second run is what moved since the first, and this is that.
"use strict";

const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { escaped } = require("./sheet.js");

// Better to worse. A status off this ladder, org-level or not applicable, moves sideways.
const LADDER = ["covered", "partial-gap", "total-gap"];
const NAMED = { covered: "covered", "partial-gap": "partial", "total-gap": "gap", "org-level": "org-level", "not-applicable": "not applicable" };

/** The newest earlier run of the same repository kept on this machine, or null. */
function earlierFor(document, home) {
  const folder = join(home, "findings");
  if (!existsSync(folder)) return null;
  const packs = new Set((document.packs ?? []).map((one) => one.pack));
  let best = null;
  for (const name of readdirSync(folder).filter((one) => one.endsWith(".json"))) {
    let one;
    try {
      one = JSON.parse(readFileSync(join(folder, name), "utf8"));
    } catch {
      // empty-catch:allow: a file that will not parse is no earlier run, and the newest that does is wanted.
      continue;
    }
    if (one.run === document.run || one.target?.repository !== document.target?.repository) continue;
    if (!(String(one.at) < String(document.at))) continue;
    if (!(one.packs ?? []).some((pack) => packs.has(pack.pack))) continue;
    if (!best || String(one.at) > String(best.at)) best = one;
  }
  return best;
}

function direction(from, to) {
  const [a, b] = [LADDER.indexOf(from), LADDER.indexOf(to)];
  if (a < 0 || b < 0) return "changed";
  return b < a ? "improved" : "worsened";
}

/** Everything that moved from the earlier run to this one. */
function changes(now, before) {
  if (!before) return null;
  const was = new Map((before.answers ?? []).map((one) => [`${one.pack}/${one.entry}`, one]));
  const lists = new Map();
  const titles = new Map();
  for (const pack of now.packs ?? []) {
    for (const one of pack.entries_asked ?? []) {
      lists.set(`${pack.pack}/${one.identifier}`, one.looks_for ?? []);
      titles.set(`${pack.pack}/${one.identifier}`, one.title ?? "");
    }
  }
  const answers = [];
  for (const one of now.answers ?? []) {
    const key = `${one.pack}/${one.entry}`;
    const earlier = was.get(key);
    if (!earlier || earlier.status === one.status) continue;
    const list = lists.get(key) ?? [];
    const items = (one.looked_for ?? []).flatMap((row, at) => {
      const from = earlier.looked_for?.[at]?.result;
      return from && from !== row.result ? [{ at: at + 1, find: list[at]?.find ?? "", from, to: row.result }] : [];
    });
    answers.push({ pack: one.pack, entry: one.entry, title: titles.get(key) ?? "", from: earlier.status, to: one.status,
      direction: direction(earlier.status, one.status), items });
  }
  // A concern has no status to move, so what moved is its items, which the hardness score counts.
  const rowsBefore = new Map((before.accounted ?? []).map((one) => [`${one.pack}/${one.concern}`, one]));
  const concerns = [];
  for (const one of now.accounted ?? []) {
    const key = `${one.pack}/${one.concern}`;
    const list = lists.get(key) ?? [];
    const items = (one.looked_for ?? []).flatMap((row, at) => {
      const from = rowsBefore.get(key)?.looked_for?.[at]?.result;
      return from && from !== row.result ? [{ at: at + 1, find: list[at]?.find ?? "", from, to: row.result }] : [];
    });
    if (items.length > 0) concerns.push({ pack: one.pack, concern: one.concern, title: titles.get(key) ?? "", items });
  }
  const keys = (document) => new Map((document.scan?.relevant ?? []).map((one) => [one.key, one]));
  const [then, current] = [keys(before), keys(now)];
  return {
    since: before.at,
    revision: { from: before.revision, to: now.revision },
    answers,
    concerns,
    scored: (now.packs ?? []).filter((one) => one.kind === "concern-set").map((one) => one.pack),
    scan: {
      arrived: [...current.values()].filter((one) => !then.has(one.key)),
      gone: [...then.values()].filter((one) => !current.has(one.key)),
    },
    hardness: before.hardness && now.hardness
      ? { from: before.hardness.score, to: now.hardness.score, grade: { from: before.hardness.grade, to: now.hardness.grade } }
      : null,
  };
}

const dated = (at) => new Date(at).toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** The section a pack's report opens its findings with, or nothing where there is no earlier run. */
function changesSection(said, pack) {
  if (!said) return "";
  const scored = said.scored.includes(pack);
  const moved = said.answers.filter((one) => one.pack === pack);
  const shifted = said.concerns.filter((one) => one.pack === pack);
  const scanning = said.scan.arrived.length + said.scan.gone.length > 0;
  const lines = [];
  const say = (kind, text) => lines.push(`<p class="${kind}">${escaped(text)}</p>`);
  if (scored && said.hardness && said.hardness.from !== said.hardness.to) {
    say("intro", `The hardness score moved from ${said.hardness.from} to ${said.hardness.to}` +
      `${said.hardness.grade.from !== said.hardness.grade.to ? `, grade ${said.hardness.grade.from} to ${said.hardness.grade.to}` : ""}.`);
  }
  if (!scored && moved.length > 0) {
    const improved = moved.filter((one) => one.direction === "improved").length;
    say("intro", `${moved.length} ${moved.length === 1 ? "answer" : "answers"} moved: ${improved} improved and ` +
      `${moved.filter((one) => one.direction === "worsened").length} worsened.`);
  }
  if (scanning) {
    say("intro", `The scanners found ${said.scan.arrived.length} new ${said.scan.arrived.length === 1 ? "result" : "results"}, ` +
      `and ${said.scan.gone.length} earlier ${said.scan.gone.length === 1 ? "result is" : "results are"} gone.`);
  }
  for (const one of moved) {
    const why = one.items.map((item) => `item ${item.at} is now ${item.to}`).join(", ");
    say("because", `${one.entry} ${one.title}: ${NAMED[one.from] ?? one.from} to ${NAMED[one.to] ?? one.to}${why ? `, since ${why}` : ""}.`);
  }
  for (const one of shifted) {
    say("because", `${one.concern} ${one.title}: ${one.items.map((item) => `item ${item.at}, ${item.find}, is now ${item.to}`).join(", and ")}.`);
  }
  if (lines.length === 0) say("intro", "Nothing changed in the answers or the scanner results.");
  if (said.revision.from !== said.revision.to) {
    lines.push(`<p class="because">${escaped(`The questions moved from revision ${said.revision.from} to ${said.revision.to} between the two runs.`)}</p>`);
  }
  return `<div class="block"><h2>${escaped(`What changed since ${dated(said.since)}`)}</h2>${lines.join("")}</div>`;
}

/**
 * What moved, as headings and short paragraphs for the board pack's slide, which holds five. The
 * same facts as the section the reports open with, in the slide's shape.
 */
function changeNotes(said, pack) {
  if (!said) return [];
  const notes = [];
  if (said.scored.includes(pack) && said.hardness && said.hardness.from !== said.hardness.to) {
    notes.push({ headline: "The hardness score", body: `The hardness score moved from ${said.hardness.from} to ${said.hardness.to}` +
      `${said.hardness.grade.from !== said.hardness.grade.to ? `, grade ${said.hardness.grade.from} to ${said.hardness.grade.to}` : ""}.` });
  }
  for (const one of said.answers.filter((each) => each.pack === pack)) {
    notes.push({ headline: `${one.entry} ${one.title}`, body: `${one.direction === "improved" ? "Improved" : one.direction === "worsened" ? "Worsened" : "Moved"}, ` +
      `from ${NAMED[one.from] ?? one.from} to ${NAMED[one.to] ?? one.to}.` });
  }
  for (const one of said.concerns.filter((each) => each.pack === pack)) {
    notes.push({ headline: `${one.concern} ${one.title}`,
      body: `${one.items.map((item) => `${item.find} is now ${item.to}`).join(", and ")}.` });
  }
  if (said.scan.arrived.length + said.scan.gone.length > 0) {
    notes.push({ headline: "Scanner results", body: `The scanners found ${said.scan.arrived.length} new ` +
      `${said.scan.arrived.length === 1 ? "result" : "results"}, and ${said.scan.gone.length} earlier ` +
      `${said.scan.gone.length === 1 ? "result is" : "results are"} gone.` });
  }
  if (notes.length === 0) return [{ headline: "Nothing moved", body: "Nothing changed in the answers, the items or the scanner results." }];
  if (notes.length <= 5) return notes;
  return [...notes.slice(0, 4), { headline: "And more", body: `${notes.length - 4} more moved, each listed in the detail.` }];
}

module.exports = { changeNotes, changes, changesSection, dated, earlierFor };
