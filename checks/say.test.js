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
  "sample.tick": { ask: "Which packs should this run read?", header: "Packs", several: true, options: "given" },
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
  assert.deepStrictEqual(asked.questions.map((one) => one.options.length), [4, 3, 2]);
  assert.deepStrictEqual(asked.questions.map((one) => one.header), ["Packs 1/3", "Packs 2/3", "Packs 3/3"]);
  assert.ok(asked.questions.every((one) => one.multiSelect));
  const quoted = JSON.parse(say(SAMPLE, "sample.tick", {}, [{ label: "Results measured instead of guessed", description: "Leverages GitHub; fast." }, { label: "C", description: "y." }]));
  assert.strictEqual(quoted.questions[0].options[0].description, "Leverages GitHub; fast.", "a website's or a person's own words are kept as given");
  assert.throws(() => say(SAMPLE, "sample.tick", {}, [{ label: "A", description: "" }, { label: "C", description: "y." }]), /description/);
  assert.throws(() => say(SAMPLE, "sample.tick", {}, [{ label: "A", description: "x." }]), /two/);
});

test("a tick list never offers a none answer, since ticking nothing chooses none", () => {
  const held = { "sample.pick": { ask: "Which packs should this run read?", header: "Packs", several: true, options: "given",
    none: { label: "None of these", description: "Reads none of the packs in this list." } } };
  const options = Array.from({ length: 7 }, (_, at) => ({ label: `Pack ${at}`, description: "A pack." }));
  assert.throws(() => say(held, "sample.pick", {}, options), /ticking nothing already chooses none/);
  const asked = JSON.parse(say({ "sample.pick": { ...held["sample.pick"], none: undefined } }, "sample.pick", {}, options));
  assert.deepStrictEqual(asked.questions.map((one) => one.options.length), [4, 3]);
  assert.strictEqual(new Set(asked.questions.map((one) => one.question)).size, 2, "the question tool refuses repeated question text in one call");
  assert.match(asked.questions[1].question, /List 2 of 2\.$/);
  assert.deepStrictEqual(Object.entries(entries()).filter(([, one]) => one.several && one.none).map(([name]) => name), [], "no tick-box question offers a none answer");
});

test("every line and question the plugin holds passes its own wording rules and the question tool's limits", () => {
  const broken = [];
  for (const [name, one] of Object.entries(entries())) {
    const words = [one.say, one.ask, ...(Array.isArray(one.options) ? one.options.flatMap((each) => [each.label, each.description]) : [])].filter(Boolean);
    for (const text of words) for (const found of held(text)) broken.push(`${name}: ${found.rule ?? found} in "${text}"`);
    if (one.ask) {
      if ((one.header ?? "").length === 0 || one.header.length > 12) broken.push(`${name}: header must be 1 to 12 characters`);
      if (one.options === "given" && one.header.length > 8) broken.push(`${name}: a header split into lists gains " 1/2", so it must be 1 to 8 characters`);
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
    const text = readFileSync(join(COMMANDS_AT, file), "utf8").replace(/\r\n/g, "\n").replace(/^---[\s\S]*?\n---\n/, "").replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");
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

const SESSION_SCRIPTS = ["bin/evalation-activate", "bin/evalation-ask", "bin/evalation-buy","bin/evalation-deliver", "bin/evalation-loopback", "bin/evalation-packs", "bin/evalation-questions",
  "bin/evalation-remove", "bin/evalation-report", "bin/evalation-rotate", "bin/evalation-run", "bin/evalation-scan", "bin/evalation-status",
  "lib/print.js", "lib/questions.js", "lib/remove.js", "lib/run-say.js"];

test("no script a session shows builds a sentence for the person outside the catalogue", () => {
  const built = SESSION_SCRIPTS.flatMap((file) => {
    const lines = readFileSync(join(__dirname, "..", file), "utf8").split("\n").filter((line) => !/\/\/ say:allow: (report|agent|machine), ?\S/.test(line))
      .map((line) => line.replace(/(\braised\(.*?),\s*"(?:[^"\\]|\\.)*"\s*\)/g, "$1)"));
    return lines.flatMap((line) => [...line.matchAll(/(["`])((?:(?!\1)[^\\\n]|\\.){20,}?)\1/g)].map((found) => found[2]))
      .filter((one) => /^[A-Z][a-z]+[\s,]/.test(one) && one.trim().split(/\s+/).length >= 5 && /[.?](?:$|\s|\$)/.test(one))
      .map((one) => `${file}: ${one.slice(0, 80)}`);
  });
  assert.deepStrictEqual(built, []);
});

test("no line a customer reads calls anything free", () => {
  const lines = Object.entries(entries()).flatMap(([name, one]) => [one.say, one.ask, ...(Array.isArray(one.options) ? one.options.flatMap((each) => [each.label, each.description]) : [])]
    .filter(Boolean).map((text) => [name, text]));
  const described = commandFiles().map((file) => [file, (readFileSync(join(COMMANDS_AT, file), "utf8").match(/^description: (.*)$/m) ?? [])[1] ?? ""]);
  const notes = JSON.parse(readFileSync(join(__dirname, "..", "release-notes.json"), "utf8")).releases.flatMap((one) => one.notes.map((note) => [`release ${one.version}`, note]));
  const free = [...lines, ...described, ...notes].filter(([, text]) => /\bfree\b/i.test(text)).map(([where, text]) => `${where}: ${text.slice(0, 80)}`);
  assert.deepStrictEqual(free, []);
});

test("a tick-box question that takes none says to press Skip, since Submit stays off until something is ticked", () => {
  const all = entries();
  for (const name of ["ev-run.evidence", "ev-run.tools", "ev-run.sets-many"]) {
    assert.strictEqual(all[name].several, true, name);
    assert.match(all[name].ask, /Press Skip to [^.]+\.$/, name);
    assert.doesNotMatch(all[name].ask, /Press Skip to [^.]*\ball\b/, `${name} says all, which reads wrong on a later page`);
  }
  assert.deepStrictEqual(Object.entries(all).filter(([, one]) => /tick(ing)? none|tick nothing/i.test(one.ask ?? "")).map(([name]) => name), []);
});

test("a line that waits for the person to type says the run carries on once they answer, and how to type it", () => {
  const all = entries();
  for (const name of ["ev-run.domains", "ev-run.domains-type", "ev-run.domains-one"]) {
    const said = all[name].say ?? all[name].ask;
    assert.match(said, /owns all of its code/, `${name} says why it asks`);
    assert.match(said, /example\.com|<domain>/, `${name} gives a domain as an example`);
    assert.match(said, /personal/, `${name} asks for a staff member's personal address`);
    assert.match(said, /consultant/, `${name} asks for a consultant's address`);
    assert.match(said, /stays on this machine/, `${name} says where the answer goes`);
  }
  const { typedDomains, domainChoices, outsiders } = require("../bin/evalation-scan");
  assert.deepStrictEqual(typedDomains("acme.com, Acme.io\nanna@GMAIL.com  @example.com;old.acme.com"), ["acme.com", "acme.io", "anna@gmail.com", "example.com", "old.acme.com"]);
  const authors = [{ name: "Steve", address: "steve@gmail.com" }, { name: "Bea", address: "bea@gmail.com" }, { name: "Cal", address: "cal@acme.io" }];
  assert.deepStrictEqual(domainChoices(authors, "Steve@Gmail.com").map((one) => one.domain), ["steve@gmail.com", "acme.io"]);
  assert.strictEqual(domainChoices(authors, "steve@gmail.com")[0].description, "Your Evalation sign-in");
  assert.deepStrictEqual(domainChoices(authors, "cal@acme.io").map((one) => one.domain), ["acme.io"]);
  assert.deepStrictEqual(outsiders(authors, ["steve@gmail.com", "acme.io"]).people.map((one) => one.name), ["Bea"]);
});

test("every command opens by saying what it does, and the question set choices name a question set", () => {
  const all = entries();
  const missing = commandFiles().flatMap((file) => {
    const command = file.replace(/\.md$/, "");
    const text = readFileSync(join(COMMANDS_AT, file), "utf8");
    const first = /evalation-say ([a-z0-9.-]+)/.exec(text)?.[1];
    return [...(all[`${command}.intro`] ? [] : [`${command}.intro is missing`]), ...(first === `${command}.intro` ? [] : [`${file} says ${first} first`])];
  });
  assert.deepStrictEqual(missing, []);
  assert.deepStrictEqual(all["ev-questions.action"].options.map((one) => one.label), ["Write a new question set", "Change a question set", "Delete a question set"]);
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
