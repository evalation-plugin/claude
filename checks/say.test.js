"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync, spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
require("./fixture.js");

const { say, entries } = require("../lib/say.js");
const { held } = require("../lib/prose.js");

const SAMPLE = {
  "sample.line": { say: "You have <credits> pack credits left." },
  "sample.ask": { ask: "Keep your usual packs, <titles>?", header: "Usual packs",
    options: [{ label: "Keep these packs", description: "Your checks still use <titles>." }, { label: "Choose again", description: "Shows every pack." }] },
  "sample.tick": { ask: "Which packs should this run read? Tick each pack to read.", header: "Packs", several: true, options: "given" },
};

test("a line is printed with its blanks filled, and never with one left empty", () => {
  assert.strictEqual(say(SAMPLE, "sample.line", { credits: "12" }), "You have 12 pack credits left.");
  assert.throws(() => say(SAMPLE, "sample.line", {}), /credits/);
  assert.throws(() => say(SAMPLE, "sample.nothing", {}), /sample\.nothing/);
});

test("a question comes out ready for the question tool, blanks filled in its answers too", () => {
  const asked = JSON.parse(say(SAMPLE, "sample.ask", { titles: "SOC 2" }));
  assert.deepStrictEqual(asked, { questions: [{ question: "Keep your usual packs, SOC 2?", header: "Usual packs", multiSelect: false,
    options: [{ label: "Keep these packs", description: "Your checks still use SOC 2." }, { label: "Choose again", description: "Shows every pack." }] }] });
});

test("answers a script supplies are held to the same rules and split into questions of two to four", () => {
  const options = Array.from({ length: 9 }, (_, at) => ({ label: `Pack ${at}`, description: "A pack." }));
  const asked = JSON.parse(say(SAMPLE, "sample.tick", {}, options));
  assert.deepStrictEqual(asked.questions.map((one) => one.options.length), [3, 3, 3]);
  assert.deepStrictEqual(asked.questions.map((one) => one.header), ["Packs 1/3", "Packs 2/3", "Packs 3/3"]);
  assert.ok(asked.questions.every((one) => one.multiSelect));
  assert.throws(() => say(SAMPLE, "sample.tick", {}, [{ label: "A; B", description: "x." }, { label: "C", description: "y." }]), /semicolon/);
  assert.throws(() => say(SAMPLE, "sample.tick", {}, [{ label: "A", description: "x." }]), /two/);
});

test("every line and question the plugin holds passes its own wording rules and the question tool's limits", () => {
  const broken = [];
  for (const [name, one] of Object.entries(entries())) {
    const words = [one.say, one.ask, ...(Array.isArray(one.options) ? one.options.flatMap((each) => [each.label, each.description]) : [])].filter(Boolean);
    for (const text of words) for (const found of held(text)) broken.push(`${name}: ${found.rule ?? found} in "${text}"`);
    if (one.ask) {
      if ((one.header ?? "").length === 0 || one.header.length > 12) broken.push(`${name}: header must be 1 to 12 characters`);
      if (one.options !== "given" && !(Array.isArray(one.options) && one.options.length >= 2 && one.options.length <= 4)) broken.push(`${name}: two to four answers`);
      if (Array.isArray(one.options) && one.options.some((each) => !each.description)) broken.push(`${name}: an answer with no description`);
    }
    if (!one.say === !one.ask) broken.push(`${name}: holds exactly one of say or ask`);
  }
  assert.deepStrictEqual(broken, []);
});

test("every name a command asks for is one the plugin holds", () => {
  const names = new Set(Object.keys(entries()));
  const COMMANDS = join(__dirname, "..", "commands");
  const unknown = require("node:fs").readdirSync(COMMANDS).filter((one) => one.endsWith(".md")).flatMap((file) =>
    [...readFileSync(join(COMMANDS, file), "utf8").matchAll(/evalation-say ([a-z0-9.-]+)/g)].map((found) => found[1])
      .filter((name) => !names.has(name)).map((name) => `${file}: ${name}`));
  assert.deepStrictEqual(unknown, []);
});

const COMMANDS_AT = join(__dirname, "..", "commands");
const commandFiles = () => require("node:fs").readdirSync(COMMANDS_AT).filter((one) => one.endsWith(".md"));

test("no command writes a line for the person itself, so every line comes from the catalogue", () => {
  const quoted = commandFiles().flatMap((file) => {
    const text = readFileSync(join(COMMANDS_AT, file), "utf8").replace(/^---[\s\S]*?\n---\n/, "").replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
    return [...text.replace(/\s+/g, " ").matchAll(/"([^"]+)"/g)].map((found) => found[1])
      .filter((one) => one.trim().split(/\s+/).length >= 3).map((one) => `${file}: "${one}"`);
  });
  assert.deepStrictEqual(quoted, []);
});

test("every line in the catalogue is used by a command or a script, and a command that uses one may run it", () => {
  const { readdirSync } = require("node:fs");
  const sources = [
    ...commandFiles().map((one) => readFileSync(join(COMMANDS_AT, one), "utf8")),
    ...readdirSync(join(__dirname, "..", "bin")).map((one) => readFileSync(join(__dirname, "..", "bin", one), "utf8")),
    ...readdirSync(join(__dirname, "..", "lib")).filter((one) => one.endsWith(".js")).map((one) => readFileSync(join(__dirname, "..", "lib", one), "utf8")),
  ].join("\n");
  assert.deepStrictEqual(Object.keys(entries()).filter((name) => !sources.includes(name)), []);
  const unallowed = commandFiles().filter((file) => {
    const text = readFileSync(join(COMMANDS_AT, file), "utf8");
    return /evalation-say /.test(text) && !/^allowed-tools:.*Bash\(evalation-say:\*\)/m.test(text);
  });
  assert.deepStrictEqual(unallowed, []);
});

test("the command line prints what say gives, and refuses an unknown name with a reason", () => {
  const bin = join(__dirname, "..", "bin", "evalation-say");
  const name = Object.keys(entries())[0];
  assert.ok(name, "the plugin holds at least one line");
  const refused = spawnSync(process.execPath, [bin, "no.such-line"], { encoding: "utf8" });
  assert.strictEqual(refused.status, 1);
  assert.match(refused.stderr, /no\.such-line/);
  assert.strictEqual(typeof execFileSync, "function");
});
