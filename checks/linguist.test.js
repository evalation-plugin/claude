"use strict";

const test = require("node:test");
const assert = require("node:assert");
require("./fixture.js");
const DATA = require("../lib/linguist.json");

const rules = (one) => [one.pattern, one.negative, ...(one.and ?? []).flatMap(rules)].filter(Boolean);
const patterns = [
  ...DATA.documentation.map((one) => ["documentation", one]),
  ...DATA.vendored.map((one) => ["vendored", one]),
  ...DATA.disambiguations.flatMap((one) => one.rules.flatMap(rules).map((pattern) => [one.extensions.join(" "), pattern])),
];

function modifierGroups(pattern) {
  const found = [];
  let inClass = false;
  for (let at = 0; at < pattern.length; at++) {
    const c = pattern[at];
    if (c === "\\") at++;
    else if (inClass) inClass = c !== "]";
    else if (c === "[") inClass = true;
    else if (c === "(") {
      const group = /^\(\?[a-z]*(?:-[a-z]*)?:/.exec(pattern.slice(at));
      if (group && group[0] !== "(?:") found.push(group[0]);
    }
  }
  return found;
}

test("the language data holds patterns to read", () => {
  assert.ok(patterns.length > 100);
});

test("every language pattern compiles the way lib/linguist.js compiles it", () => {
  const broken = patterns.filter(([, pattern]) => {
    try {
      new RegExp(pattern, "m");
      return false;
    } catch {
      return true;
    }
  });
  assert.deepStrictEqual(broken, []);
});

test("no language pattern uses a modifier group, which Node before 23 refuses", () => {
  const held = patterns.filter(([, pattern]) => modifierGroups(pattern).length > 0).map(([where, pattern]) => `${where}: ${pattern.slice(0, 60)}`);
  assert.deepStrictEqual(held, []);
});
