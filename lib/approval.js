"use strict";

const { entries, say } = require("./say.js");

const LINES = { "awaiting-approval": "awaiting", declined: "declined", removed: "removed",
  "machine-awaiting-approval": "machine-awaiting", "machine-declined": "machine-declined" };
const ACCOUNT = { "awaiting-approval": "ev-account.awaiting", declined: "ev-account.declined", removed: "ev-account.removed",
  "machine-awaiting-approval": "ev-account.machine-awaiting", "machine-declined": "ev-account.machine-declined" };
const RUN = { "awaiting-approval": "ev-run.awaiting", declined: "ev-run.declined", removed: "ev-run.removed",
  "machine-awaiting-approval": "ev-run.machine-awaiting", "machine-declined": "ev-run.machine-declined" };
const ADDRESS =/^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;
const LONGEST_NAME = 120;

function nameOf(said) {
  if (typeof said !== "string" || /[\u0000-\u001f\u007f<>]/.test(said)) return null;
  const name = said.trim();
  return name && [...name].length <= LONGEST_NAME ? name : null;
}

function approvalOf(said) {
  const found = String(said ?? "").match(/refused 403: (\{[\s\S]*\})\s*$/);
  if (!found) return null;
  let first;
  try {
    first = JSON.parse(found[1])?.refusals?.[0];
  } catch {
    return null;
  }
  const kind = first?.failure;
  const owner = first?.owner;
  if (!Object.hasOwn(LINES, kind) || typeof owner !== "string" || !ADDRESS.test(owner)) return null;
  return { kind, owner, organisation: nameOf(first.organisation), line: LINES[kind] };
}

function lineFor(name, { owner, organisation }) {
  const held = entries();
  const yours = say(held, "ev-account.your-organisation");
  const opens = held[name]?.say?.startsWith("<organisation>") && !organisation;
  return say(held, name, {
    owner,
    organisation: organisation ?? (opens ? yours.charAt(0).toUpperCase() + yours.slice(1) : yours),
    whose: organisation ? `${organisation}'s` : say(held, "ev-account.your-organisations"),
  });
}

module.exports = { approvalOf, lineFor, nameOf, LINES, ACCOUNT, RUN, ADDRESS };
