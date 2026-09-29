"use strict";

const { existsSync, mkdirSync, renameSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

const OWN = ["evalation.local", "findings", "scans", "packs.json", "questions", "solutions", "keys", "reports"];

function moved(old, fresh) {
  if (existsSync(fresh)) return [];
  const held = OWN.filter((one) => existsSync(join(old, one)));
  if (held.length === 0) return [];
  mkdirSync(fresh, { recursive: true, mode: 0o700 });
  for (const one of held) renameSync(join(old, one), join(fresh, one));
  return held;
}

function pluginHome() {
  if (process.env.EVALATION_PLUGIN_HOME) return process.env.EVALATION_PLUGIN_HOME;
  const fresh = join(homedir(), ".evalation-plugin");
  moved(join(homedir(), ".evalation"), fresh);
  return fresh;
}

module.exports = { moved, pluginHome };
