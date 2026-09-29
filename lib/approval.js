"use strict";

const LINES = { "awaiting-approval": "awaiting", declined: "declined", removed: "removed" };
const ADDRESS = /^[^\s@<>"'`]+@[^\s@<>"'`]+\.[^\s@<>"'`]+$/;

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
  return { kind, owner, line: LINES[kind] };
}

module.exports = { approvalOf, LINES, ADDRESS };
