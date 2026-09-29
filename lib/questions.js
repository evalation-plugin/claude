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
    if (item?.rule !== undefined && !String(item.rule).startsWith(`${item.phase}:`)) {
      said.push(`${where}: a rule starts with its phase, as history:releases does`);
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

function extensible(body) {
  return body?.kind === "standard" && body?.licence?.attribution === "Evalation";
}

function extended(served, set) {
  if (!extensible(served.body)) {
    throw new Error(`${served.body?.title ?? served.pack} keeps the published standard's own clauses, so it takes no extra questions`);
  }
  const slug = String(set.name).trim().replace(/[^A-Za-z0-9]+/g, "-");
  const identifier = `USER-${slug}`;
  const declared = served.body?.sections ?? [];
  if (declared.some((one) => one.identifier === identifier)) {
    throw new Error(`${set.name} is already used in ${served.pack}`);
  }
  const whole = declared.length === 0 ? [{ identifier: "PACK", title: served.body?.title ?? served.pack }] : declared;
  const yours = { identifier, title: `User provided questions: ${set.name}`,
    note: "Questions your team added to this pack, answered the same way as its own and kept apart from them." };
  const entries = (served.body?.entries ?? []).map((one) => (declared.length === 0 ? { ...one, section: "PACK" } : one));
  return {
    ...served,
    body: {
      ...served.body,
      sections: [...whole, yours],
      entries: [...entries, ...entriesOf(set).map((one) => ({ ...one, identifier: `${slug}.${one.identifier}`, shown: one.identifier, section: identifier }))],
    },
  };
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

function fromAccount(held) {
  let set;
  try {
    set = JSON.parse(String(held?.body ?? ""));
  } catch {
    throw new Error(`${held?.name} on the account is not a question set, so it is not used`);
  }
  if (!set || typeof set !== "object" || set.name !== held.name) {
    throw new Error(`${held?.name} on the account names itself ${set?.name ?? "nothing"}, so it is not used`);
  }
  const wrong = problems(set);
  if (wrong.length > 0) throw new Error(`${held.name} on the account is not used, since:\n  ${wrong.join("\n  ")}`);
  return set;
}

function kept(home) {
  return saved(home).map((name) => {
    const set = load(home, name);
    return { name, pack: set.pack, questions: (set.questions ?? []).length };
  });
}

function askServer(path, body) {
  const { runScript } = require("./script.js");
  return JSON.parse(runScript("evalation-ask", [path, JSON.stringify(body)], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

function keepOnAccount(home, name, ask = askServer) {
  const set = load(home, name);
  const wrong = problems(set);
  if (wrong.length > 0) throw new Error(`${name} is not kept on the account, since:\n  ${wrong.join("\n  ")}`);
  return ask("/sets/keep", { name, body: JSON.stringify(set) });
}

function dropFromAccount(name, ask = askServer) {
  return ask("/sets/drop", { name });
}

function listed(home, ask = askServer) {
  const found = new Map(kept(home).map((one) => [one.name, { ...one, where: "machine" }]));
  let account;
  try {
    account = ask("/sets", {}).sets ?? [];
  } catch {
    return { account: "unreachable", sets: [...found.values()] };
  }
  for (const held of account) {
    const here = found.get(held.name);
    try {
      const set = fromAccount(held);
      found.set(held.name, here ? { ...here, where: "both" } : { name: held.name, pack: set.pack, questions: set.questions.length, where: "account" });
    } catch (thrown) {
      if (!here) found.set(held.name, { name: held.name, where: "account", refused: thrown.message });
    }
  }
  return { account: "reached", sets: [...found.values()].sort((a, b) => a.name.localeCompare(b.name)) };
}

function fetched(home, name, ask = askServer) {
  if (!NAME.test(String(name))) throw new Error(`${name}: not a name a set is kept under`);
  if (existsSync(fileOf(home, name))) return fileOf(home, name);
  const held = (ask("/sets", {}).sets ?? []).find((one) => one.name === name);
  if (!held) throw new Error(`${name} is kept neither on this machine nor on the account`);
  save(home, fromAccount(held));
  return fileOf(home, name);
}

module.exports = {
  dropFromAccount, entriesOf, extended, extensible, fetched, fromAccount, keepOnAccount, kept, listed, load, packOf,
  problems, save, saved,
};
