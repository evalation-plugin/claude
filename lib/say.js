"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { held } = require("./prose.js");

const entries = () => JSON.parse(readFileSync(join(__dirname, "say.json"), "utf8"));

function filled(text, values, name) {
  return text.replace(/<([a-z][a-z0-9 -]*)>/g, (_, blank) => {
    const value = values[blank];
    if (value === undefined || String(value).trim() === "") throw new Error(`${name} needs a value for <${blank}>`);
    return String(value);
  });
}

function checked(options, name) {
  if (!Array.isArray(options) || options.length < 2) throw new Error(`${name} needs at least two answers`);
  for (const one of options) {
    if (typeof one?.label !== "string" || typeof one?.description !== "string" || !one.label.trim() || !one.description.trim()) {
      throw new Error(`${name} has an answer with no label or no description`);
    }
    const broken = [...held(one.label), ...held(one.description)];
    if (broken.length > 0) throw new Error(`${name} has an answer breaking the wording rules: ${broken.join(", ")} in "${one.label}"`);
  }
  return options;
}

function shared(options) {
  const count = Math.ceil(options.length / 4);
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
  const question = filled(one.ask, values, name);
  const options = checked(one.options === "given" ? given : one.options.map((each) => ({
    label: filled(each.label, values, name), description: filled(each.description, values, name) })), name);
  const groups = one.options === "given" ? shared(options) : [options];
  if (groups.some((group) => group.length < 2)) throw new Error(`${name} needs at least two answers in every question`);
  return JSON.stringify({ questions: groups.map((group, at) => ({
    question, header: groups.length > 1 ? `${one.header} ${at + 1}/${groups.length}` : one.header,
    multiSelect: Boolean(one.several), options: group })) });
}

module.exports = { entries, say };
