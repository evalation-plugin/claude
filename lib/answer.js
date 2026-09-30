"use strict";

const { existsSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { pluginHome } = require("./home.js");
const { entries, say } = require("./say.js");

const NONE = /^\s*\[?\s*no preference\s*\]?\s*$/i;
const plain = (session) => String(session ?? "").replace(/[^A-Za-z0-9-]/g, "");
const waitingAt = (session) => (plain(session) ? join(pluginHome(), `unanswered-${plain(session)}`) : null);

function unanswered(value) {
  return value === undefined || value === null || String(value).trim() === "" || NONE.test(String(value));
}

function stopped() {
  return say(entries(), "shared.unanswered");
}

function answered(values) {
  const marker = waitingAt(process.env.CLAUDE_CODE_SESSION_ID);
  if (!values.some(unanswered) && !(marker && existsSync(marker))) return;
  process.stdout.write(`${JSON.stringify({ kind: "unanswered", said: stopped() })}\n`);
  process.exit(3);
}

function waiting(session, on) {
  const marker = waitingAt(session);
  if (!marker) return;
  if (!on) return rmSync(marker, { force: true });
  mkdirSync(pluginHome(), { recursive: true });
  writeFileSync(marker, "");
}

module.exports = { answered, stopped, unanswered, waiting };
