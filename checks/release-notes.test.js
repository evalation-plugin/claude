"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { held } = require("../lib/prose.js");

const ROOT = join(__dirname, "..");
const read = (file) => JSON.parse(readFileSync(join(ROOT, file), "utf8"));
const parts = (version) => version.split(".").map(Number);
const newer = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let at = 0; at < 3; at += 1) if (x[at] !== y[at]) return x[at] > y[at];
  return false;
};

test("the version the plugin declares has a release note", () => {
  const { version } = read(".claude-plugin/plugin.json");
  const { releases } = read("release-notes.json");
  assert.ok(releases.some((one) => one.version === version), `release-notes.json has no entry for ${version}, the version in .claude-plugin/plugin.json`);
});

test("every release note is dated, newest first, one to four lines, each held to the plugin's wording rules", () => {
  const { releases } = read("release-notes.json");
  const broken = [];
  releases.forEach((one, at) => {
    if (!/^\d+\.\d+\.\d+$/.test(one.version ?? "")) broken.push(`${one.version}: not a version`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(one.date ?? "")) broken.push(`${one.version}: no date`);
    if (!Array.isArray(one.notes) || one.notes.length < 1 || one.notes.length > 4) broken.push(`${one.version}: one to four notes`);
    for (const note of one.notes ?? []) {
      if (typeof note !== "string" || !/^[A-Z].*\.$/.test(note)) broken.push(`${one.version}: a note is a sentence: ${note}`);
      for (const found of held(String(note))) broken.push(`${one.version}: ${found.rule ?? found} in "${note}"`);
    }
    if (at > 0 && !newer(releases[at - 1].version, one.version)) broken.push(`${one.version}: not older than the entry above it`);
  });
  assert.deepStrictEqual(broken, []);
});

test("every version from 0.63.0 on has a note", () => {
  const { releases } = read("release-notes.json");
  const listed = releases.map((one) => one.version);
  for (const version of ["0.63.0", "0.63.1", "0.64.0", "0.65.0"]) assert.ok(listed.includes(version), version);
});
