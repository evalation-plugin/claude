"use strict";

const { spelling, usWord } = require("./spelling.js");

const WRITING_STANDARD = [
  "How to write anything a customer reads.",
  "Write for a reader who is not technical and has to decide what to do, the way a knowledgeable person talks to a colleague:",
  "plain English, short, active voice, each point once and every sentence earning its place.",
  "Write files, commands and package names as they are, name everything else by what it does, explain a technical name in",
  "the same sentence, and invent no terms. Say what is at risk, what fixes it and what happens if it is left.",
  "Give facts and let the reader weigh them. Vary sentence length, and let a sentence carry its reason in a clause.",
  `Spell in ${spelling() === "us" ? "American" : "British"} English.`,
  "Never write an em or en dash, a semicolon, antithesis in any form such as \"it isn't X, it's Y\", \"X rather than Y\",",
  "\"X instead of Y\" or \"not only X but also Y\", a cleft sentence such as \"it is X that\", a trailing which clause,",
  "an \"X, being Y\" appositive, passive voice, a double negative, an opener that fills, signposts or announces, a closing",
  "summary, a metaphor or flourish, spatial framing of an abstract thing, commentary on why something matters, a \"what\"",
  "clause standing in for a name, two sentences in a row opening on the same word, more than one short sentence in a",
  "paragraph, or a point made twice. Use the common word: never furthermore, moreover, robust, seamless, leverage,",
  "crucial, navigate, landscape, delve, tapestry, accrue or warrant.",
].join(" ");

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);

const RULES = [
  { rule: "a dash", test: DASHES },
  { rule: "a semicolon", test: /;/ },
  {
    rule: "a flipped pair",
    test: /\b(rather than|instead of|not only)\b|,\s+not\s+\w|\b(isn't|is not|aren't|are not|wasn't|was not)\b[^.?!]{1,60},\s*(it's|it is|they're|they are)\b/i,
  },
  { rule: "a trailing which clause", test: /\bwhich is why\b|,\s+which\b(?!\s+(way|one|ones|of)\b)/i },
  { rule: "a cleft sentence", test: /(^|[.?!:]\s+)(It is|It's|It was)\s[^.?!]{1,60}?\s(that|who)\s/ },
  { rule: "a being appositive", test: /,\s+being\s/i },
  { rule: "a passive with its actor", test: /\b(is|are|was|were|been|being|be)\s+\w+(ed|en)\s+by\s/i },
  { rule: "a double negative", test: /\bnot\s+(un(?!der|til|less|ique|it|iver|ion)[a-z]{3,}|without)\b|\bnever\s+not\b/i },
  {
    rule: "a banned word",
    test: /\b(furthermore|moreover|tapestry|delve|delves|robust|seamless|seamlessly|leverage|leverages|landscape|crucial|navigate|navigates)\b/i,
  },
  {
    rule: "an uncommon word",
    test: /\b(accrue|accrues|accrued|warrant|warrants|utilise|utilises|utilize|facilitate|facilitates|commence|commences|endeavour|ascertain|numerous|prior to|in order to|whilst|thereby|therein|aforementioned|plethora|myriad|pivotal|paramount|holistic|synergy|streamline|empower|elevate)\b/i,
  },
  {
    rule: "filler",
    test: /\b(it is important to note|it's important to note|to be clear|worth mentioning|worth noting|needless to say|it's worth|it is worth|importantly)\b/i,
  },
  { rule: "an announcement", test: /(^|[.?!]\s+)(Two|Three|Four|Five|A few|Several|Some) (things|points|questions|decisions|items)\b[^.?!]*:/ },
  { rule: "a closer", test: /\blet me know\b|(^|[.?!]\s+)(In summary|To sum up|In short|In conclusion|Overall),/ },
  { rule: "spatial framing", test: /\b(at the heart of|under the hood|this is where|lives (in|on|at))\b/i },
  { rule: "an internal status name", test: /\b(total-gap|partial-gap|no-evidence|not-applicable|does-not-apply|not-checked)\b/ },
  { rule: "commentary", test: /\b(this|that|it) (matters|is what matters)\b|\bthe (most important|key) (thing|point)\b/i },
];

const sentencesOf = (text) => String(text).split(/(?<=[.?!])\s+(?=[A-Z0-9"'(])/).map((one) => one.trim()).filter(Boolean);
const wordsIn = (sentence) => sentence.split(/\s+/).filter((one) => /\w/.test(one)).length;

const PARAGRAPH_RULES = [
  {
    rule: "the same opening twice running",
    find: (sentences) => sentences.findIndex((one, at) => at > 0 && /^\w+/.test(one) &&
      one.match(/^\w+/)[0].toLowerCase() === (sentences[at - 1].match(/^\w+/) ?? [""])[0].toLowerCase()),
  },
  {
    rule: "short sentences in a row",
    find: (sentences) => (sentences.length >= 3 && sentences.filter((one) => wordsIn(one) < 9).length >= 2
      ? sentences.findIndex((one) => wordsIn(one) < 9) : -1),
  },
];

function broken(text, how) {
  const written = own(text).replace(/\s+/g, " ").trim();
  const out = [];
  for (const one of RULES) {
    const at = written.match(one.test);
    if (at) out.push({ rule: one.rule, near: written.slice(Math.max(0, at.index - 20), at.index + at[0].length), match: at[0] });
  }
  if (how !== "us") {
    const word = usWord(written);
    if (word) out.push({ rule: "a US spelling", near: word });
  }
  const sentences = sentencesOf(written);
  for (const one of PARAGRAPH_RULES) {
    const at = one.find(sentences);
    if (at >= 0) out.push({ rule: one.rule, near: sentences[at].slice(0, 60) });
  }
  return out;
}

const FACING = new Set(["observed", "required", "because", "justification", "remedy", "below_scan", "searched", "why", "summary", "title"]);

function held(text, how = "commonwealth") {
  return broken(text, how).map((one) => one.rule);
}

function offences(text, how = "commonwealth") {
  return broken(text, how);
}

function readingOf(document) {
  return [...facing({ answers: document?.answers, findings: document?.findings, accounted: document?.accounted })
    .map((one) => one.text), ...servedOf(document)];
}

function own(text) {
  return String(text ?? "").replace(/`[^`]*`/g, " ").replace(/"[^"\n]*"/g, " ");
}

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

function servedOf(document) {
  const out = [];
  const add = (value) => { if (typeof value === "string" && value.trim()) out.push(value); };
  for (const pack of document?.packs ?? []) {
    add(pack.title);
    add(pack.description);
    for (const part of pack.sections ?? []) { add(part.title); add(part.note); }
    for (const entry of pack.entries_asked ?? []) {
      for (const key of ["title", "intent", "note", "justification"]) add(entry[key]);
      for (const item of entry.looks_for ?? []) add(item.find);
    }
  }
  return out;
}

module.exports = { RULES, WRITING_STANDARD, facing, held, offences, own, readingOf, servedOf };
