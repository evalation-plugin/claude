// prose - the standard every word a customer reads is held to, and the part of it a machine can
// decide.
//
// A finding is read by somebody who has to act on it, and the person who acts is usually not the
// person who wrote the code. A sentence like "the second catches one built by hand that never went
// through the builder" is true, and to a leader deciding whether to fund the fix it says nothing:
// they cannot tell what was at risk or what happens if it is left. Meaning is not the price of
// plainness. Name the thing in ordinary words and the sentence gets shorter, not vaguer.
//
// The standard rides in the instruction the run follows, because that is where the words are
// written. What is decidable is checked here as well, because an instruction nothing enforces holds
// until the day it is inconvenient.
//
// Held to the writer's own words. Anything in backticks or double quotes is the repository's, and a
// finding that quotes a line of code is quoting punctuation somebody else chose.
"use strict";

/** What the run is told, in the words the engine tells its own steps. */
const WRITING_STANDARD = [
  "How to write anything a customer reads.",
  "Write plain English for a reader who is not technical: a leader who has to decide what to do " +
  "about this and has never opened the codebase. Write what you could say aloud to them: files, " +
  "commands and package names as they are, everything else by what it does in everyday words, " +
  "active voice, short sentences, each point once.",
  "Where a technical name is the only accurate one, say what it is in the same sentence.",
  "Losing the meaning is not plainness. Say what is at risk, what it would take, and what happens " +
  "if it is left, in words that need no glossary.",
  "No dashes, no semicolons, no 'X rather than Y', no 'which is why', no invented terms, no " +
  "metaphors.",
].join(" ");

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);

// Each is decidable by looking, so each is checked. The rest of the standard is judgement and sits
// in the instruction.
const RULES = [
  { rule: "a dash", test: DASHES },
  { rule: "a semicolon", test: /;/ },
  { rule: "a flipped pair", test: /\b(rather than|instead of|not only)\b|,\s+not\s+\w/i },
  { rule: "a trailing which clause", test: /\bwhich is why\b/i },
  {
    rule: "a banned word",
    test: /\b(furthermore|moreover|tapestry|delve|delves|robust|seamless|seamlessly|leverage|leverages|landscape|crucial|navigate|navigates)\b/i,
  },
  {
    rule: "filler",
    test: /\b(it is important to note|to be clear|worth mentioning|worth noting|let me know)\b/i,
  },
];

/** The fields of a findings document a customer reads. Everything else is the run's own bookkeeping. */
const FACING = new Set(["observed", "required", "because", "justification", "remedy", "below_scan", "searched", "why", "summary", "title"]);

/**
 * Every rule the text breaks, judged on the writer's own words. A quoted line of code carries
 * whatever punctuation its author used, and refusing a finding for the semicolons in the line it is
 * about would refuse the findings that cite their evidence most exactly.
 */
function held(text) {
  const written = own(text);
  return RULES.filter((one) => one.test.test(written)).map((one) => one.rule);
}

/**
 * Each rule the text breaks, with the words leading up to where it breaks it. Only those before, since
 * a page splitting a sentence at a full stop inside a quote changes what follows.
 */
function offences(text) {
  const written = own(text).replace(/\s+/g, " ").trim();
  const out = [];
  for (const one of RULES) {
    const at = written.match(one.test);
    if (at) out.push({ rule: one.rule, near: written.slice(Math.max(0, at.index - 20), at.index + at[0].length) });
  }
  return out;
}

/** Everything the reading wrote that a customer reads, one text per field. */
function readingOf(document) {
  return facing({ answers: document?.answers, findings: document?.findings, accounted: document?.accounted })
    .map((one) => one.text);
}

/** The writer's own words, with what is quoted from the repository taken out. */
function own(text) {
  return String(text ?? "").replace(/`[^`]*`/g, " ").replace(/"[^"\n]*"/g, " ");
}

/**
 * Every person-facing field in a document, named by where it sits, so one walk covers an answer's
 * justification, a finding's remedy and an accounted row's reason alike.
 */
// A claim's history and verification hold the verifier's own reasons, working notes a correcting
// reader sees and no customer reads, so they are not held to the rules the reading's words are.
const NOTES = new Set(["history", "verification"]);

function facing(value, at = "") {
  const found = [];
  if (value === null || typeof value !== "object") return found;
  for (const [key, one] of Object.entries(value)) {
    if (NOTES.has(key)) continue;
    const here = at.length === 0 ? key : `${at}/${key}`;
    if (typeof one === "string") {
      if (FACING.has(key) && one.trim().length > 0) found.push({ at: here, text: one });
    } else if (Array.isArray(one)) {
      one.forEach((each, index) => found.push(...facing(each, `${here}/${index}`)));
    } else if (one !== null && typeof one === "object") {
      found.push(...facing(one, here));
    }
  }
  return found;
}

module.exports = { RULES, WRITING_STANDARD, facing, held, offences, own, readingOf };
