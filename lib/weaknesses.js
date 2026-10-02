"use strict";

const { entries, say } = require("./say.js");

function cwesOf(said) {
  return [...new Set((Array.isArray(said) ? said : [said]).map((one) => String(one ?? "").match(/CWE-\d+/)?.[0]).filter(Boolean))];
}

function cardLines(family, cwes) {
  const held = entries();
  return [...new Set(cwesOf(cwes).map((one) => `${family}${one.toLowerCase()}`).filter((name) => held[name]).map((name) => say(held, name)))];
}

const consequences = (cwes) => cardLines("cards.left-", cwes);
const remedies = (cwes) => cardLines("cards.fix-", cwes);

module.exports = { consequences, cwesOf, remedies };
