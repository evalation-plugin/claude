"use strict";

const { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

const OWN = ["evalation.local", "findings", "scans", "packs.json", "questions", "solutions", "keys", "reports"];
const ENGINE_KEYS = "evalation";
const PLUGIN_KEYS = "evalation-plugin";
const settled = new Set();

function moved(old, fresh) {
  if (existsSync(fresh)) return [];
  const held = OWN.filter((one) => existsSync(join(old, one)));
  if (held.length === 0) return [];
  mkdirSync(fresh, { recursive: true, mode: 0o700 });
  for (const one of held) renameSync(join(old, one), join(fresh, one));
  return held;
}

function keysMoved(settings, store) {
  const held = JSON.parse(readFileSync(settings, "utf8"));
  const named = ["installation_key", "receiving_key"]
    .map((field) => [field, store.referenced(held?.secrets?.[field])])
    .filter(([, where]) => where?.service === ENGINE_KEYS);
  if (named.length === 0) return;
  const tier = store.chosen();
  const read = (service, account) => {
    try {
      return tier.held(service, account);
    } catch {
      return null;
    }
  };
  const accounts = named.flatMap(([field, where]) => (field === "receiving_key" ? [where.account, `${where.account}-previous`] : [where.account]));
  const values = new Map();
  for (const account of accounts) {
    const value = read(ENGINE_KEYS, account);
    if (value) values.set(account, value);
    else if (!account.endsWith("-previous")) return;
  }
  const copied = [];
  try {
    for (const [account, value] of values) {
      const there = read(PLUGIN_KEYS, account);
      if (there && there !== value) throw new Error(`${PLUGIN_KEYS}/${account} already holds another key`);
      if (!there) {
        tier.keep(PLUGIN_KEYS, account, value);
        copied.push(account);
      }
      if (read(PLUGIN_KEYS, account) !== value) throw new Error(`${PLUGIN_KEYS}/${account} did not read back`);
    }
    for (const [field, where] of named) held.secrets[field] = `store:${PLUGIN_KEYS}/${where.account}`;
    writeFileSync(`${settings}.moving`, JSON.stringify(held, null, 2) + "\n");
    renameSync(`${settings}.moving`, settings);
  } catch {
    for (const account of copied) {
      try {
        tier.forget(PLUGIN_KEYS, account);
      } catch {
        continue;
      }
    }
    return;
  }
}

function ownKeys(settings) {
  if (settled.has(settings) || !existsSync(settings)) return;
  const where = require.resolve("../bin/evalation-store");
  if (require.cache[where] && !require.cache[where].loaded) return;
  const store = require(where);
  settled.add(settings);
  try {
    keysMoved(settings, store);
  } catch {
    return;
  }
}

function homeFolder() {
  if (process.env.EVALATION_PLUGIN_HOME) return process.env.EVALATION_PLUGIN_HOME;
  if (process.env.NODE_TEST_CONTEXT) {
    throw new Error("a check reached a person's own folder. Set EVALATION_PLUGIN_HOME to a throwaway folder first, as checks/fixture.js does");
  }
  return join(homedir(), ".evalation-plugin");
}

function pluginHome() {
  const home = homeFolder();
  if (!process.env.EVALATION_PLUGIN_HOME) moved(join(homedir(), ".evalation"), home);
  ownKeys(process.env.EVALATION_LOCAL || join(home, "evalation.local"));
  return home;
}

module.exports = { homeFolder, moved, pluginHome };
