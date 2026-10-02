"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const { held } = require("./prose.js");
const { spelled } = require("./spelling.js");
const { raised } = require("./errors.js");

const FOLDER = join(__dirname, "say");

function entries() {
  const out = {};
  for (const file of readdirSync(FOLDER).filter((one) => one.endsWith(".json")).sort()) {
    const command = file.slice(0, -5);
    for (const [name, one] of Object.entries(JSON.parse(readFileSync(join(FOLDER, file), "utf8")))) {
      if (!name.startsWith(`${command}.`)) throw raised(`${name} in ${file} must start with ${command}.`, "An entry in a plugin catalogue file under lib/say does not start with that file's command name. Rename the entry to start with the command name and a dot.");
      out[name] = one;
    }
  }
  return out;
}

function filled(text, values, name) {
  return spelled(text).replace(/<([a-z][a-z0-9 -]*)>/g, (_, blank) => {
    const value = values[blank];
    if (value === undefined || String(value).trim() === "") throw raised(`${name} needs a value for <${blank}>`, "A plugin script said a catalogue line and left one of its blanks unfilled. Change that script to pass a value for every blank the line holds.");
    return String(value);
  });
}

function checked(options, name, ours) {
  if (!Array.isArray(options) || options.length < 2) throw raised(`${name} needs at least two answers`, "A plugin script asked a question whose answers came from a list holding fewer than two. Change that script to say the none or one case with its own catalogue line, and to ask the question only when the list holds two or more.");
  for (const one of options) {
    if (typeof one?.label !== "string" || typeof one?.description !== "string" || !one.label.trim() || !one.description.trim()) {
      throw raised(`${name} has an answer with no label or no description`, "A plugin script built a question answer with no label or no description. Change that script to give every answer both.");
    }
    if (!ours) continue;
    const broken = [...held(one.label).map((rule) => `${rule} in the label`), ...held(one.description).map((rule) => `${rule} in the description`)];
    if (broken.length > 0) throw raised(`${name} has an answer breaking the wording rules: ${broken.join(", ")} of "${one.label}"`, "An answer in a plugin catalogue question breaks the wording rules in lib/prose.js. Reword that answer in its catalogue file under lib/say.");
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
  if (!one) throw raised(`${name} is not a line the plugin holds`, "A plugin script asked for a line its catalogue under lib/say does not hold. Add the line to that command's catalogue file, or correct the line's name in the script.");
  if (one.say) return filled(typeof one.say === "object" ? one.say[Number(values[one.count]) === 1 ? "one" : "many"] : one.say, values, name);
  if (one.several && one.none) throw raised(`${name} is a tick-box question, where ticking nothing already chooses none, so it offers no none answer`, "A tick-box question in a plugin catalogue under lib/say offers a none answer, where ticking nothing already means none. Remove the none answer from that catalogue entry.");
  const question = filled(one.ask, values, name);
  const options = checked(one.options === "given" ? given : one.options.map((each) => ({
    label: filled(each.label, values, name), description: filled(each.description, values, name) })), name, one.options !== "given");
  const none = one.none ? checked([{ label: filled(one.none.label, values, name), description: filled(one.none.description, values, name) },
    { label: "-", description: "-" }], name)[0] : null;
  const groups = (one.options === "given" ? shared(options, none ? 3 : 4) : [options]).map((group) => (none ? [...group, none] : group));
  if (groups.some((group) => group.length < 2)) throw raised(`${name} needs at least two answers in every question`, "A plugin script asked a question whose answers came from a list holding fewer than two. Change that script to say the none or one case with its own catalogue line, and to ask the question only when the list holds two or more.");
  return JSON.stringify({ questions: groups.map((group, at) => ({
    question: groups.length > 1 ? `${question} List ${at + 1} of ${groups.length}.` : question,
    header: groups.length > 1 ? `${one.header} ${at + 1}/${groups.length}` : one.header,
    multiSelect: Boolean(one.several), options: group })) });
}

module.exports = { entries, say };
