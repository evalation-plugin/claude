"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");

const COMMANDS = join(__dirname, "..", "commands");
const register = () => JSON.parse(readFileSync(join(__dirname, "..", "lib", "asked.json"), "utf8"));
const paragraphsOf = (file) => readFileSync(join(COMMANDS, file), "utf8").split(/\n\s*\n/).map((one) => one.replace(/\s+/g, " "));
const commands = () => readdirSync(COMMANDS).filter((one) => one.endsWith(".md"));

test("every question the register holds is asked, word for word, by its command", () => {
  const missing = register().filter((one) => !paragraphsOf(`${one.command}.md`).some((para) => para.includes(`"${one.asks}"`)));
  assert.deepStrictEqual(missing.map((one) => `${one.command}: ${one.asks}`), []);
});

test("every quoted question a command asks is in the register", () => {
  const held = new Set(register().map((one) => `${one.command}|${one.asks}`));
  const unheld = commands().flatMap((file) => paragraphsOf(file).flatMap((para) =>
    [...para.matchAll(/"([^"]{8,240}?\?)"/g)].map((found) => `${file.slice(0, -3)}|${found[1]}`)))
    .filter((one) => !held.has(one));
  assert.deepStrictEqual(unheld, []);
});

test("a question asked through the question interface never shares its paragraph with plain text, and a plain one says so", () => {
  const wrong = register().filter((one) => {
    const para = paragraphsOf(`${one.command}.md`).find((each) => each.includes(`"${one.asks}"`)) ?? "";
    return one.through === "plain" ? !/plain text/.test(para) : /plain text/.test(para);
  });
  assert.deepStrictEqual(wrong.map((one) => `${one.command}: ${one.asks} (${one.through})`), []);
  assert.ok(register().every((one) => ["interface", "plain"].includes(one.through)));
});
