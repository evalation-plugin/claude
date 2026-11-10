"use strict";

const { spelling, usWord } = require("./spelling.js");

const said = (() => {
  const kept = new Map();
  return (name, values = {}) => {
    const key = JSON.stringify([name, values]);
    if (!kept.has(key)) {
      const { entries, say } = require("./say.js");
      kept.set(key, say(entries(), name, values));
    }
    return kept.get(key);
  };
})();

const standard = () => [
  "prose.standard-how", "prose.standard-reader", "prose.standard-names", "prose.standard-risk", "prose.standard-facts",
  "prose.standard-length", "prose.standard-spelling", "prose.standard-never", "prose.standard-words",
].map((name) => said(name, { language: spelling() === "us" ? "American" : "British" })).join(" ");

const DASHES = new RegExp(`[${String.fromCharCode(0x2014, 0x2013)}]`);

const RULES = [
  { get rule() { return said("prose.rule-dash"); }, test: DASHES },
  { get rule() { return said("prose.rule-semicolon"); }, test: /;/ },
  {
    get rule() { return said("prose.rule-flipped"); },
    test: /\b(rather than|instead of|not only)\b|,\s+not\s+\w|\b(isn't|is not|aren't|are not|wasn't|was not)\b[^.?!]{1,60},\s*(it's|it is|they're|they are)\b/i,
  },
  { get rule() { return said("prose.rule-which"); }, test: /\bwhich is why\b|,\s+which\b(?!\s+(way|one|ones|of)\b)/i },
  { get rule() { return said("prose.rule-cleft"); }, test: /(^|[.?!:]\s+)(It is|It's|It was)\s[^.?!]{1,60}?\s(that|who)\s/ },
  { get rule() { return said("prose.rule-appositive"); }, test: /,\s+being\s/i },
  { get rule() { return said("prose.rule-passive"); }, test: /\b(is|are|was|were|been|being|be)\s+\w+(ed|en)\s+by\s/i },
  { get rule() { return said("prose.rule-negative"); }, test: /\bnot\s+(un(?!der|til|less|ique|it|iver|ion)[a-z]{3,}|without)\b|\bnever\s+not\b/i },
  {
    get rule() { return said("prose.rule-banned"); },
    test: /\b(furthermore|moreover|tapestry|delve|delves|robust|seamless|seamlessly|leverage|leverages|landscape|crucial|navigate|navigates)\b/i,
  },
  {
    get rule() { return said("prose.rule-uncommon"); },
    test: /\b(accrue|accrues|accrued|warrant|warrants|utilise|utilises|utilize|facilitate|facilitates|commence|commences|endeavour|ascertain|numerous|prior to|in order to|whilst|thereby|therein|aforementioned|plethora|myriad|pivotal|paramount|holistic|synergy|streamline|empower|elevate)\b/i,
  },
  {
    rule: "filler",
    test: /\b(it is important to note|it's important to note|to be clear|worth mentioning|worth noting|needless to say|it's worth|it is worth|importantly)\b/i,
  },
  { get rule() { return said("prose.rule-announcement"); }, test: /(^|[.?!]\s+)(Two|Three|Four|Five|A few|Several|Some) (things|points|questions|decisions|items)\b[^.?!]*:/ },
  { get rule() { return said("prose.rule-closer"); }, test: /\blet me know\b|(^|[.?!]\s+)(In summary|To sum up|In short|In conclusion|Overall),/ },
  { get rule() { return said("prose.rule-spatial"); }, test: /\b(at the heart of|under the hood|this is where|lives (in|on|at))\b/i },
  { get rule() { return said("prose.rule-status"); }, test: /\b(total-gap|partial-gap|no-evidence|not-applicable|does-not-apply|not-checked)\b/ },
  { rule: "commentary", test: /\b(this|that|it) (matters|is what matters)\b|\bthe (most important|key) (thing|point)\b/i },
];

const sentencesOf = (text) => String(text).split(/(?<=[.?!])\s+(?=[A-Z0-9"'(])/).map((one) => one.trim()).filter(Boolean);
const wordsIn = (sentence) => sentence.split(/\s+/).filter((one) => /\w/.test(one)).length;

const PARAGRAPH_RULES = [
  {
    get rule() { return said("prose.rule-opening"); },
    find: (sentences) => sentences.findIndex((one, at) => at > 0 && /^\w+/.test(one) &&
      one.match(/^\w+/)[0].toLowerCase() === (sentences[at - 1].match(/^\w+/) ?? [""])[0].toLowerCase()),
  },
  {
    get rule() { return said("prose.rule-short"); },
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
    if (word) out.push({ rule: said("prose.rule-spelling"), near: word });
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

const READING_RULES = [
  {
    get rule() { return said("prose.rule-person"); },
    test: /(^|[.?!,:]\s+|\b[a-z]+\s+)I(?=\s|[,.])|\bI'(m|ve|d|ll)\b|\b([Ww]e|[Ww]e're|[Ww]e've|[Oo]urs?|us|me|[Mm]y)\b/,
  },
];

function readingOffences(text, how = "commonwealth") {
  const written = own(text).replace(/\s+/g, " ").trim();
  const extra = READING_RULES.flatMap((one) => {
    const at = written.match(one.test);
    return at ? [{ rule: one.rule, near: written.slice(Math.max(0, at.index - 20), at.index + at[0].length), match: at[0] }] : [];
  });
  return [...broken(text, how), ...extra];
}

function readingHeld(text, how = "commonwealth") {
  return readingOffences(text, how).map((one) => one.rule);
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

module.exports = { READING_RULES, RULES, get WRITING_STANDARD() { return standard(); }, facing, held, offences, own, readingHeld, readingOf, readingOffences, servedOf };
