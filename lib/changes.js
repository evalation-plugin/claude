"use strict";

const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { escaped } = require("./sheet.js");
const { entries, say } = require("./say.js");
const { spelling } = require("./spelling.js");

const LADDER = ["covered", "partial-gap", "total-gap"];
const STATUSES = ["covered", "partial-gap", "total-gap", "no-evidence", "org-level", "not-applicable"];
const statusNamed = (status) => (STATUSES.includes(status) ? told(`report.status-${status}`).toLowerCase() : status);

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
  const read = (document) => new Set((document.target?.repositories ?? []).map((one) => one.repository));
  const [readThen, readNow] = [read(before), read(now)];
  return {
    since: before.at,
    repositories: {
      added: [...readNow].filter((one) => !readThen.has(one)).sort(),
      removed: [...readThen].filter((one) => !readNow.has(one)).sort(),
    },
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

const told = (name, values) => say(entries(), name, values);

function readChange(said) {
  const { added = [], removed = [] } = said.repositories ?? {};
  if (added.length > 0 && removed.length > 0) return told("changes.read-both", { added: added.join(", "), removed: removed.join(", ") });
  if (added.length > 0) return told("changes.read-added", { added: added.join(", ") });
  if (removed.length > 0) return told("changes.read-removed", { removed: removed.join(", ") });
  return "";
}

const dated = (at) => new Date(at).toLocaleDateString(spelling() === "us" ? "en-US" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const scoreMoved = (hardness) => (hardness.grade.from !== hardness.grade.to
  ? told("changes.hardness-grade", { from: String(hardness.from), to: String(hardness.to), gradefrom: String(hardness.grade.from), gradeto: String(hardness.grade.to) })
  : told("changes.hardness", { from: String(hardness.from), to: String(hardness.to) }));

const scannersMoved = (scan) => told("changes.scanners", { arrived: String(scan.arrived.length),
  results: told("shared.noun-result", { count: String(scan.arrived.length) }), gone: String(scan.gone.length) });

function changesSection(said, pack) {
  if (!said) return "";
  const scored = said.scored.includes(pack);
  const moved = said.answers.filter((one) => one.pack === pack);
  const shifted = said.concerns.filter((one) => one.pack === pack);
  const scanning = said.scan.arrived.length + said.scan.gone.length > 0;
  const lines = [];
  const say = (kind, text) => lines.push(`<p class="${kind}">${escaped(text)}</p>`);
  if (readChange(said)) say("intro", readChange(said));
  if (scored && said.hardness && said.hardness.from !== said.hardness.to) say("intro", scoreMoved(said.hardness));
  if (!scored && moved.length > 0) {
    say("intro", told("changes.answers", { count: String(moved.length), improved: String(moved.filter((one) => one.direction === "improved").length),
      worsened: String(moved.filter((one) => one.direction === "worsened").length) }));
  }
  if (scanning) say("intro", scannersMoved(said.scan));
  for (const one of moved) {
    const why = one.items.map((item) => told("changes.item", { at: String(item.at), to: String(item.to) })).join(", ");
    const values = { entry: one.entry, title: one.title || told("shared.untitled"), from: statusNamed(one.from), to: statusNamed(one.to) };
    say("because", why ? told("changes.answer-why", { ...values, why }) : told("changes.answer", values));
  }
  for (const one of shifted) {
    say("because", told("changes.concern", { concern: one.concern, title: one.title || "untitled",
      items: one.items.map((item) => told("changes.concern-item", { at: String(item.at), find: item.find, to: String(item.to) })).join(", and ") }));
  }
  if (lines.length === 0) say("intro", told("changes.nothing"));
  if (said.revision.from !== said.revision.to) {
    lines.push(`<p class="because">${escaped(told("changes.revision", { from: String(said.revision.from), to: String(said.revision.to) }))}</p>`);
  }
  return `<div class="block"><h2>${escaped(told("changes.title", { date: dated(said.since) }))}</h2>${lines.join("")}</div>`;
}

function changeNotes(said, pack) {
  if (!said) return [];
  const notes = [];
  if (said.scored.includes(pack) && said.hardness && said.hardness.from !== said.hardness.to) {
    notes.push({ headline: told("changes.note-hardness-title"), body: scoreMoved(said.hardness) });
  }
  for (const one of said.answers.filter((each) => each.pack === pack)) {
    const way = one.direction === "improved" ? "changes.note-improved" : one.direction === "worsened" ? "changes.note-worsened" : "changes.note-moved";
    notes.push({ headline: `${one.entry} ${one.title}`, body: told(way, { from: statusNamed(one.from), to: statusNamed(one.to) }) });
  }
  for (const one of said.concerns.filter((each) => each.pack === pack)) {
    notes.push({ headline: `${one.concern} ${one.title}`,
      body: told("changes.note-items", { items: one.items.map((item) => told("changes.note-find", { find: item.find, to: String(item.to) })).join(", and ") }) });
  }
  if (said.scan.arrived.length + said.scan.gone.length > 0) {
    notes.push({ headline: told("changes.note-scanner-title"), body: scannersMoved(said.scan) });
  }
  if (readChange(said)) notes.unshift({ headline: told("report.repos-title"), body: readChange(said) });
  if (notes.length === 0) return [{ headline: told("changes.note-nothing-title"), body: told("changes.note-nothing") }];
  if (notes.length <= 5) return notes;
  return [...notes.slice(0, 4), { headline: told("changes.note-more-title"), body: told("changes.note-more", { count: String(notes.length - 4) }) }];
}

module.exports = { changeNotes, changes, changesSection, dated, earlierFor };
