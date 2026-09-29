"use strict";

const { basename } = require("node:path");
const { entries, say } = require("./say.js");
const { dated } = require("./changes.js");

const STALE_DAYS = 14;

const line = (name, values) => say(entries(), name, values);
const ask = (name, values, given) => say(entries(), name, values, given);

function joined(items) {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const tracked = (solution) => solution.repositories.filter((one) => one.vcs === "git");
const untracked = (solution) => solution.repositories.filter((one) => one.vcs !== "git");
const byLabel = (a, b) => a.label.localeCompare(b.label);

function found(solution) {
  const git = tracked(solution).length;
  const plain = untracked(solution).length;
  const which = git === 1
    ? ["ev-run.found-one-no-plain", "ev-run.found-one-one-plain"][plain] ?? "ev-run.found-one"
    : ["ev-run.found-no-plain", "ev-run.found-one-plain"][plain] ?? "ev-run.found";
  return [
    line(which, { git, plain }),
    line("ev-run.found-together"),
    ...(solution.left_out.length > 0 ? [line("ev-run.found-copy")] : []),
  ].join(" ");
}

function pick(solution) {
  return ask("ev-run.pick", {}, tracked(solution)
    .map((one) => ({ label: one.repository, description: line("ev-run.pick-folder", { folder: one.folder }) })).sort(byLabel));
}

function holds(one) {
  if (!one.files || !one.first) return line("ev-run.evidence-empty");
  return one.files === 1 ? line("ev-run.evidence-file", { first: one.first }) : line("ev-run.evidence-files", { files: one.files, first: one.first });
}

function evidence(solution) {
  const plain = untracked(solution);
  if (plain.length === 0) return null;
  if (plain.length === 1) return ask("ev-run.evidence-one", { folder: plain[0].folder });
  return ask("ev-run.evidence", {}, plain.map((one) => ({ label: one.folder, description: holds(one) })).sort(byLabel));
}

function named(solution) {
  const offered = [];
  const offer = (entry, name) => {
    if (!name || offered.some((one) => one.name === name)) return;
    offered.push({ name, label: line(entry, { name }), description: line("ev-run.name-means", { name }) });
  };
  if (solution.name) offer("ev-run.name-keep", solution.name);
  offer("ev-run.name-folder", basename(solution.root));
  const owners = [...new Set(tracked(solution).map((one) => (one.repository.includes("/") ? one.repository.split("/")[0] : null)))];
  if (owners.length === 1 && owners[0]) offer("ev-run.name-use", owners[0]);
  if (offered.length < 2 && tracked(solution)[0]) offer("ev-run.name-use", tracked(solution)[0].repository);
  return ask("ev-run.name", {}, offered.map(({ label, description }) => ({ label, description })));
}

const branchName = (one) => one.branch ?? line("ev-run.no-branch");

function stale(newest, now = Date.now()) {
  return Boolean(newest) && now - new Date(newest).getTime() > STALE_DAYS * 24 * 60 * 60 * 1000;
}

const day = (newest) => dated(String(newest).slice(0, 10));

function branches(solution) {
  const off = tracked(solution).filter((one) => one.on_main === false);
  if (off.length === 0) return null;
  return off.map((one) => line("ev-run.branches-each", { repository: one.repository, branch: branchName(one), main: one.main })).join(" ");
}

function copies(solution, now = Date.now()) {
  const old = tracked(solution).filter((one) => stale(one.newest, now));
  if (old.length === 0) return null;
  return old.map((one) => line("ev-run.copies-each", { repository: one.repository, date: day(one.newest) })).join(" ");
}

const offMain = (facts) => line("ev-run.off-main", { branch: branchName(facts), main: facts.main });
const branchAsk = (facts) => ask("ev-run.branch", { branch: branchName(facts) });
const staleSaid = (facts) => line("ev-run.stale", { date: day(facts.newest) });

const titled = (titles, handles) => handles.map((handle) => titles.find((one) => one.pack === handle)).filter(Boolean);
const packOption = (one) => ({ label: one.title ?? one.pack, description: one.summary ?? one.title ?? one.pack });
const customSets = (sets) => sets.filter((one) => one.pack === "custom" && !one.refused);

function all({ credits, titles, first = false }) {
  return ask(first ? "ev-run.all-first" : "ev-run.all", { credits }, titles.map(packOption));
}

function packs({ repository, credits, usual, titles, sets }) {
  const mine = titled(titles, usual);
  const options = [];
  if (mine.length > 0) {
    const names = joined(mine.map((one) => one.title ?? one.pack));
    options.push({ label: line("ev-run.packs-usual"), description: mine.length === 1
      ? line("ev-run.packs-usual-cost-one", { titles: names }) : line("ev-run.packs-usual-cost", { titles: names, count: mine.length }) });
  }
  options.push({ label: line("ev-run.packs-choose"), description: line("ev-run.packs-choose-means") });
  if (customSets(sets).length > 0) options.push({ label: line("ev-run.packs-only"), description: line("ev-run.packs-only-means") });
  if (options.length === 1) return all({ credits, titles, first: true });
  return ask("ev-run.packs", { repository, credits }, options);
}

function usualAsk({ usual, titles }) {
  return ask("ev-run.usual", {}, titled(titles, usual).map(packOption));
}

const setHolds = (one) => (one.questions === 1 ? line("ev-run.set-holds-one") : line("ev-run.set-holds", { count: one.questions }));
const setOption = (one) => ({ label: one.name, description: setHolds(one) });

function setsFor({ pack, titles, sets }) {
  const title = titles.find((one) => one.pack === pack)?.title ?? pack;
  const written = sets.filter((one) => one.pack === pack && !one.refused);
  if (written.length === 0) return line("ev-run.sets-none", { pack: title });
  if (written.length === 1) {
    const [one] = written;
    return ask("ev-run.sets-one", { set: one.name, pack: title }, [
      { label: line("ev-run.set-use", { set: one.name }), description: setHolds(one) },
      { label: line("ev-run.set-alone"), description: line("ev-run.set-alone-means") },
    ]);
  }
  return ask("ev-run.sets-many", { pack: title }, written.map(setOption));
}

const onlySets = (sets) => ask("ev-run.only-sets", {}, customSets(sets).map(setOption));

function short(credits, count) {
  if (Number(credits) === 1) return line("ev-run.short-one-credit", { count });
  if (Number(count) === 1) return line("ev-run.short-one-pack", { credits });
  return line("ev-run.short", { credits, count });
}

function reading(run) {
  const titles = (run.packs ?? []).map((one) => one.body?.title ?? one.title ?? one.pack);
  return line(run.target?.kind === "solution" ? "ev-run.reading-several" : "ev-run.reading", { packs: joined(titles) });
}

function tally(total, confirmed, corrected, withdrawn) {
  const [n, v, c, w] = [total, confirmed, corrected, withdrawn].map(Number);
  const said = [v === 0 ? line("ev-run.tally-none", { total: n }) : v === 1 ? line("ev-run.tally-one", { total: n })
    : line("ev-run.tally", { total: n, confirmed: v })];
  if (c > 0 && w > 0) said.push(c === 1 ? line("ev-run.tally-both-one", { withdrawn: w }) : line("ev-run.tally-both", { corrected: c, withdrawn: w }));
  else if (c > 0) said.push(c === 1 ? line("ev-run.tally-corrected-one") : line("ev-run.tally-corrected", { corrected: c }));
  else if (w > 0) said.push(w === 1 ? line("ev-run.tally-withdrawn-one") : line("ev-run.tally-withdrawn", { withdrawn: w }));
  if (v < n) said.push(line("ev-run.tally-rest"));
  return said.join(" ");
}

function next(document) {
  const { reviewName } = require("./reports.js");
  const held = document.packs ?? [];
  const concerns = held.filter((one) => one.kind === "concern-set");
  const files = concerns.length > 0
    ? [`${concerns.length === 1 ? reviewName(document, concerns[0].pack) : "Evalation Findings"} Detail.pdf`]
    : held.filter((one) => one.kind === "standard").map((one) => `${reviewName(document, one.pack)} Evidence Pack.pdf`);
  const count = held.filter((one) => one.pack !== "custom").length;
  const which = count === 0 ? "ev-run.next-free" : count === 1 ? "ev-run.next-one" : "ev-run.next";
  return line(which, { files: joined(files), count });
}

module.exports = {
  all, branchAsk, branches, copies, evidence, found, named, next, offMain, onlySets, packs, pick, reading,
  setsFor, short, stale, staleSaid, tally, usualAsk, joined,
};
