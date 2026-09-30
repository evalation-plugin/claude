"use strict";

const { existsSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pluginHome } = require("./home.js");
const { entries, say } = require("./say.js");

const NONE = /^\s*\[?\s*no preference\s*\]?\s*$/i;
const waitingAt = () => join(pluginHome(), "unanswered");

function unanswered(value) {
  return value === undefined || value === null || String(value).trim() === "" || NONE.test(String(value));
}

function stopped() {
  return say(entries(), "shared.unanswered");
}

function answered(values) {
  if (!values.some(unanswered) && !existsSync(waitingAt())) return;
  process.stdout.write(`${JSON.stringify({ kind: "unanswered", said: stopped() })}\n`);
  process.exit(3);
}

function waiting(on) {
  if (!on) return rmSync(waitingAt(), { force: true });
  mkdirSync(pluginHome(), { recursive: true });
  writeFileSync(waitingAt(), "");
}

module.exports = { answered, stopped, unanswered, waiting };
