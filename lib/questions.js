// questions - what a customer asks of a repository, beside or instead of a pack's own entries.
//
// A customer's question is held to the rules a pack's entry is: a plain question, and a list of the
// things to look for, so its status is counted from items and two runs answer it alike. A set is the
// customer's own, kept on their machine under the name they give it, and read by a run as data.
"use strict";

const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { held } = require("./prose.js");

const PROOFS = ["runs", "written", "scan"];
const PHASES = ["sca", "sast", "secret", "history"];
const SEVERITIES = ["critical", "high", "medium", "low"];
const NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,59}$/;
// Words that judge instead of naming something a reader can find or not.
const JUDGED = /\b(adequate|adequately|appropriate|appropriately|sufficient|sufficiently|proper|properly|reasonable|reasonably|effective|effectively|suitable|good|best practice)\b/i;

/** Every rule a set breaks, each naming the question and the part. Empty where it holds. */
function problems(set) {
  const said = [];
  if (!String(set?.name ?? "").trim()) said.push("the set has no name");
  else if (!NAME.test(set.name)) said.push(`${set.name}: a name holds letters, numbers, spaces, hyphens and underscores, 60 at most`);
  const questions = Array.isArray(set?.questions) ? set.questions : [];
  if (questions.length === 0) said.push("the set holds no questions");
  const seen = new Set();
  for (const one of questions) said.push(...questionProblems(one, seen));
  return said;
}

function questionProblems(one, seen) {
  const id = String(one?.identifier ?? "");
  const said = [];
  if (!/^Q[1-9][0-9]*$/.test(id)) said.push(`${id || "a question"}: an identifier is Q and a number, as Q1 is`);
  if (seen.has(id)) said.push(`${id}: given twice`);
  seen.add(id);
  said.push(...words(`${id} title`, one?.title));
  said.push(...words(`${id} intent`, one?.intent));
  const intent = String(one?.intent ?? "").trim();
  if (intent && !intent.endsWith("?")) said.push(`${id} intent: not a question`);
  if (intent.split(/\s+/).length > 25) said.push(`${id} intent: over 25 words`);
  const items = one?.looks_for;
  if (!Array.isArray(items) || items.length < 2 || items.length > 8) {
    said.push(`${id}: looks_for holds 2 to 8 items`);
    return said;
  }
  items.forEach((item, at) => {
    const where = `${id} item ${at + 1}`;
    said.push(...words(where, item?.find));
    if (JUDGED.test(String(item?.find ?? ""))) said.push(`${where}: judges instead of naming a thing a person could find`);
    if (!PROOFS.includes(item?.proof)) said.push(`${where}: proof is runs, written or scan`);
    if (item?.proof === "scan" && (!PHASES.includes(item.phase) || (item.at_least !== undefined && !SEVERITIES.includes(item.at_least)))) {
      said.push(`${where}: a scan item names phase sca, sast, secret or history, and any at_least is a severity`);
    }
  });
  return said;
}

function words(where, text) {
  if (!String(text ?? "").trim()) return [`${where}: empty`];
  return held(text).map((rule) => `${where}: ${rule}`);
}

/** Each question as an entry, marked as the customer's so a reader is handed it behind a fence. */
function entriesOf(set) {
  return set.questions.map((one) => ({
    identifier: one.identifier, title: one.title, intent: one.intent, looks_for: one.looks_for,
    bears_on: "repository", written_by: "customer",
  }));
}

/** The custom pack, built here and asked of no server, so it is never charged for. */
function packOf(set) {
  return {
    pack: "custom",
    kind: "standard",
    body: {
      pack: "custom", kind: "standard", title: set.name,
      entry_noun: { one: "question", many: "questions" },
      entries: entriesOf(set),
    },
  };
}

/** A served pack with the customer's questions after its own entries. */
function extended(served, set) {
  const own = new Set((served.body?.entries ?? []).map((one) => one.identifier));
  for (const one of set.questions) {
    if (own.has(one.identifier)) throw new Error(`${one.identifier} is already an entry of ${served.pack}`);
  }
  return { ...served, body: { ...served.body, entries: [...(served.body?.entries ?? []), ...entriesOf(set)] } };
}

const fileOf = (home, name) => join(home, "questions", `${name}.json`);

/** Keeps a set under its name for a later run. An existing set is replaced only when asked. */
function save(home, set, { replace = false } = {}) {
  const wrong = problems(set);
  if (wrong.length > 0) throw new Error(`the set is not kept, since it has problems:\n  ${wrong.join("\n  ")}`);
  if (existsSync(fileOf(home, set.name)) && !replace) throw new Error(`${set.name} is already saved, and is replaced only when asked`);
  mkdirSync(join(home, "questions"), { recursive: true, mode: 0o700 });
  writeFileSync(fileOf(home, set.name), JSON.stringify(set, null, 2) + "\n", { mode: 0o600 });
}

/** The names of the sets kept on this machine. */
function saved(home) {
  if (!existsSync(join(home, "questions"))) return [];
  return readdirSync(join(home, "questions")).filter((one) => one.endsWith(".json")).map((one) => one.slice(0, -5)).sort();
}

function load(home, name) {
  if (!NAME.test(String(name))) throw new Error(`${name}: not a name a set is kept under`);
  return JSON.parse(readFileSync(fileOf(home, name), "utf8"));
}

module.exports = { entriesOf, extended, load, packOf, problems, save, saved };
