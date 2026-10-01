"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { held } = require("./prose.js");
const { raised } = require("./errors.js");

const FOLDER = join(__dirname, "say");

function entries() {
  const out = {};
  for (const file of readdirSync(FOLDER).filter((one) => one.endsWith(".json")).sort()) {
    const command = file.slice(0, -5);
    for (const [name, one] of Object.entries(JSON.parse(readFileSync(join(FOLDER, file), "utf8")))) {
      if (!name.startsWith(`${command}.`)) throw raised(`${name} in ${file} must start with ${command}.`, "rename the entry so it starts with its catalogue file's command name and a dot");
      out[name] = one;
    }
  }
  return out;
}

function filled(text, values, name) {
  return text.replace(/<([a-z][a-z0-9 -]*)>/g, (_, blank) => {
    const value = values[blank];
    if (value === undefined || String(value).trim() === "") throw raised(`${name} needs a value for <${blank}>`, "pass a value for every blank the line holds where the line is said");
    return String(value);
  });
}

function checked(options, name, ours) {
  if (!Array.isArray(options) || options.length < 2) throw raised(`${name} needs at least two answers`, "handle none and one answer before asking, and ask only with two or more");
  for (const one of options) {
    if (typeof one?.label !== "string" || typeof one?.description !== "string" || !one.label.trim() || !one.description.trim()) {
      throw raised(`${name} has an answer with no label or no description`, "give every answer a label and a description");
    }
    if (!ours) continue;
    const broken = [...held(one.label).map((rule) => `${rule} in the label`), ...held(one.description).map((rule) => `${rule} in the description`)];
    if (broken.length > 0) throw raised(`${name} has an answer breaking the wording rules: ${broken.join(", ")} of "${one.label}"`, "reword the answer in the catalogue to the wording rules lib/prose.js holds");
  }
  return options;
}

function shared(options, most = 4) {
  const out = [];
  for (let at = 0; at < options.length; at += most) out.push(options.slice(at, at + most));
  if (out.length > 1 && out[out.length - 1].length === 1) out[out.length - 1].unshift(out[out.length - 2].pop());
  return out;
}

function say(held, name, values = {}, given) {
  const one = held[name];
  if (!one) throw raised(`${name} is not a line the plugin holds`, "add the line to its command's catalogue in lib/say, or name a line that is there");
  if (one.say) return filled(one.say, values, name);
  if (one.several && one.none) throw raised(`${name} is a tick-box question, where ticking nothing already chooses none, so it offers no none answer`, "remove the none answer from the tick-box question in the catalogue");
  const question = filled(one.ask, values, name);
  const options = checked(one.options === "given" ? given : one.options.map((each) => ({
    label: filled(each.label, values, name), description: filled(each.description, values, name) })), name, one.options !== "given");
  const none = one.none ? checked([{ label: filled(one.none.label, values, name), description: filled(one.none.description, values, name) },
    { label: "-", description: "-" }], name)[0] : null;
  const groups = (one.options === "given" ? shared(options, none ? 3 : 4) : [options]).map((group) => (none ? [...group, none] : group));
  if (groups.some((group) => group.length < 2)) throw raised(`${name} needs at least two answers in every question`, "handle none and one answer before asking, and ask only with two or more");
  return JSON.stringify({ questions: groups.map((group, at) => ({
    question: groups.length > 1 ? `${question} List ${at + 1} of ${groups.length}.` : question,
    header: groups.length > 1 ? `${one.header} ${at + 1}/${groups.length}` : one.header,
    multiSelect: Boolean(one.several), options: group })) });
}

module.exports = { entries, say };
