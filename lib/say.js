"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { held } = require("./prose.js");

const FOLDER = join(__dirname, "say");

function entries() {
  const out = {};
  for (const file of readdirSync(FOLDER).filter((one) => one.endsWith(".json")).sort()) {
    const command = file.slice(0, -5);
    for (const [name, one] of Object.entries(JSON.parse(readFileSync(join(FOLDER, file), "utf8")))) {
      if (!name.startsWith(`${command}.`)) throw new Error(`${name} in ${file} must start with ${command}.`);
      out[name] = one;
    }
  }
  return out;
}

function filled(text, values, name) {
  return text.replace(/<([a-z][a-z0-9 -]*)>/g, (_, blank) => {
    const value = values[blank];
    if (value === undefined || String(value).trim() === "") throw new Error(`${name} needs a value for <${blank}>`);
    return String(value);
  });
}

function checked(options, name, ours) {
  if (!Array.isArray(options) || options.length < 2) throw new Error(`${name} needs at least two answers`);
  for (const one of options) {
    if (typeof one?.label !== "string" || typeof one?.description !== "string" || !one.label.trim() || !one.description.trim()) {
      throw new Error(`${name} has an answer with no label or no description`);
    }
    if (!ours) continue;
    const broken = [...held(one.label).map((rule) => `${rule} in the label`), ...held(one.description).map((rule) => `${rule} in the description`)];
    if (broken.length > 0) throw new Error(`${name} has an answer breaking the wording rules: ${broken.join(", ")} of "${one.label}"`);
  }
  return options;
}

function shared(options, most = 4) {
  const count = Math.ceil(options.length / most);
  const size = Math.floor(options.length / count);
  const larger = options.length % count;
  const out = [];
  let at = 0;
  for (let one = 0; one < count; one += 1) {
    const take = one < larger ? size + 1 : size;
    out.push(options.slice(at, at + take));
    at += take;
  }
  return out;
}

function say(held, name, values = {}, given) {
  const one = held[name];
  if (!one) throw new Error(`${name} is not a line the plugin holds`);
  if (one.say) return filled(one.say, values, name);
  if (one.several && one.none) throw new Error(`${name} is a tick-box question, where ticking nothing already chooses none, so it offers no none answer`);
  const question = filled(one.ask, values, name);
  const options = checked(one.options === "given" ? given : one.options.map((each) => ({
    label: filled(each.label, values, name), description: filled(each.description, values, name) })), name, one.options !== "given");
  const none = one.none ? checked([{ label: filled(one.none.label, values, name), description: filled(one.none.description, values, name) },
    { label: "-", description: "-" }], name)[0] : null;
  const groups = (one.options === "given" ? shared(options, none ? 3 : 4) : [options]).map((group) => (none ? [...group, none] : group));
  if (groups.some((group) => group.length < 2)) throw new Error(`${name} needs at least two answers in every question`);
  return JSON.stringify({ questions: groups.map((group, at) => ({
    question: groups.length > 1 ? `${question} List ${at + 1} of ${groups.length}.` : question,
    header: groups.length > 1 ? `${one.header} ${at + 1}/${groups.length}` : one.header,
    multiSelect: Boolean(one.several), options: group })) });
}

module.exports = { entries, say };
