"use strict";

const { readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

const PAIRS = {
  colour: "color", colours: "colors", coloured: "colored", behaviour: "behavior", behaviours: "behaviors", favour: "favor",
  favours: "favors", favoured: "favored", favourite: "favorite", honour: "honor", honoured: "honored", labour: "labor",
  neighbour: "neighbor", neighbours: "neighbors", flavour: "flavor", humour: "humor", rumour: "rumor", armour: "armor",
  odour: "odor", harbour: "harbor", vigour: "vigor", savour: "savor",
  organisation: "organization", organisations: "organizations", organisational: "organizational", organise: "organize",
  organised: "organized", organises: "organizes", organising: "organizing", realise: "realize", realised: "realized",
  realises: "realizes", realising: "realizing", recognise: "recognize", recognised: "recognized", recognises: "recognizes",
  recognising: "recognizing", prioritise: "prioritize", prioritised: "prioritized", summarise: "summarize",
  summarised: "summarized", summarises: "summarizes", authorise: "authorize", authorised: "authorized",
  authorises: "authorizes", authorisation: "authorization", authorisations: "authorizations", unauthorised: "unauthorized",
  minimise: "minimize", minimised: "minimized", maximise: "maximize", optimise: "optimize", optimised: "optimized",
  customise: "customize", customised: "customized", standardise: "standardize", categorise: "categorize",
  emphasise: "emphasize", finalise: "finalize", finalised: "finalized", initialise: "initialize", initialised: "initialized",
  normalise: "normalize", normalised: "normalized", normalising: "normalizing", serialise: "serialize", serialised: "serialized", sanitise: "sanitize",
  sanitised: "sanitized", sanitises: "sanitizes", sanitising: "sanitizing", synchronise: "synchronize",
  synchronised: "synchronized", apologise: "apologize", criticise: "criticize", specialise: "specialize",
  specialised: "specialized", visualise: "visualize", centralise: "centralize", centralised: "centralized",
  generalise: "generalize", itemise: "itemize", capitalise: "capitalize", characterise: "characterize",
  localise: "localize", localised: "localized", personalise: "personalize", personalised: "personalized",
  stabilise: "stabilize", tokenise: "tokenize", harmonise: "harmonize", modernise: "modernize", jeopardise: "jeopardize",
  penalise: "penalize", memorise: "memorize", legitimise: "legitimize", utilise: "utilize", parameterise: "parameterize",
  parameterised: "parameterized", parameterising: "parameterizing",
  analyse: "analyze", analysed: "analyzed", analysing: "analyzing", paralyse: "paralyze",
  licence: "license", licences: "licenses", defence: "defense", defences: "defenses", offence: "offense",
  offences: "offenses", pretence: "pretense", centre: "center", centres: "centers", centred: "centered", theatre: "theater",
  catalogue: "catalog", catalogues: "catalogs", catalogued: "cataloged", analogue: "analog",
  travelled: "traveled", travelling: "traveling", cancelled: "canceled", cancelling: "canceling", labelled: "labeled",
  labelling: "labeling", modelled: "modeled", modelling: "modeling", signalled: "signaled", signalling: "signaling",
  fuelled: "fueled", levelled: "leveled", totalled: "totaled", enrolment: "enrollment", enrolments: "enrollments",
  fulfil: "fulfill", fulfils: "fulfills", fulfilment: "fulfillment", instalment: "installment", instalments: "installments",
  skilful: "skillful", grey: "gray", ageing: "aging", judgement: "judgment", judgements: "judgments",
  acknowledgement: "acknowledgment", acknowledgements: "acknowledgments",
};

const AMBIGUOUS = new Set(["license", "licenses", "meter", "program", "programs", "dialog", "check", "practice"]);
const US = new Map(Object.entries(PAIRS).filter(([, us]) => !AMBIGUOUS.has(us)).map(([ours, us]) => [us, ours]));
const SAME = new Set(["advise", "revise", "otherwise", "exercise", "promise", "precise", "rise", "arise", "wise", "likewise",
  "surprise", "expertise", "enterprise", "compromise", "supervise", "devise", "comprise", "raise", "noise", "praise", "premise",
  "franchise", "disguise", "concise", "paradise", "despise", "improvise", "excise", "apprise", "clockwise", "demise",
  "merchandise", "televise", "poise", "cruise", "bruise", "our", "ours", "hour", "hours", "four", "your", "yours", "pour",
  "tour", "tours", "flour", "sour", "detour", "contour", "devour", "scour", "license", "licensed", "licensing", "practise",
  "practised", "analyses", "size", "sizes", "sized", "resize", "seize", "prize", "capsize"]);

const caseOf = (from, to) => (from === from.toUpperCase() && from.length > 1 ? to.toUpperCase()
  : from[0] === from[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);

function spellingOf(env = process.env, language = null, appleLocale = null) {
  const named = String(language ?? "");
  if (/\b(american|us|united states)\b/i.test(named)) return "us";
  if (/\b(british|uk|new zealand|nz|australian|irish|canadian|south african|indian|commonwealth)\b/i.test(named)) return "commonwealth";
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || appleLocale || "";
  const [, tongue, region, override] = /^([a-z]{2,3})(?:[_-]([A-Za-z]{2}))?[^@]*(?:@.*\brg=([a-z]{2}))?/.exec(locale) ?? [];
  if (tongue !== "en") return "us";
  const where = (override ?? region ?? "").toUpperCase();
  return where && where !== "US" ? "commonwealth" : "us";
}

function languageSetting() {
  try {
    return JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8")).language ?? null;
  } catch (thrown) {
    if (thrown.code === "ENOENT" || thrown instanceof SyntaxError) return null;
    throw thrown;
  }
}

function appleLocale() {
  if (process.platform !== "darwin") return null;
  const said = require("node:child_process").spawnSync("defaults", ["read", "-g", "AppleLocale"], { encoding: "utf8" });
  return said.status === 0 ? said.stdout.trim() : null;
}

let held = null;

function spelling() {
  if (process.env.EVALATION_SPELLING) return process.env.EVALATION_SPELLING;
  if (held) return held;
  const env = process.env;
  held = spellingOf(env, languageSetting(), env.LC_ALL || env.LC_MESSAGES || env.LANG ? null : appleLocale());
  return held;
}

function spelled(text, how = spelling()) {
  if (how !== "us") return String(text);
  return String(text).replace(/[A-Za-z]+/g, (word) => {
    const us = PAIRS[word.toLowerCase()];
    if (us) return caseOf(word, us);
    if (/isations?$/i.test(word) && !SAME.has(word.toLowerCase())) return word.replace(/isation/i, (one) => caseOf(one, "ization"));
    return word;
  });
}

function usWord(text) {
  return String(text).match(/[A-Za-z]+/g)?.find((word) => US.has(word.toLowerCase())) ?? null;
}

function unheld(text) {
  return (String(text).match(/[A-Za-z]+/g) ?? []).map((word) => word.toLowerCase()).filter((word) => {
    if (PAIRS[word] || SAME.has(word)) return false;
    const base = word.replace(/(d|s|ing|ed)$/, "");
    if (SAME.has(base) || SAME.has(`${base}e`)) return false;
    return /i[sz](e|ed|es|ing)$|i[sz]ations?$|[^aeiou]our(s|ed|ing)?$/.test(word) && !/^[a-z]{1,3}$/.test(word);
  });
}

module.exports = { PAIRS, spelled, spelling, spellingOf, unheld, usWord };
