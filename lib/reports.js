"use strict";

const { copyFileSync, existsSync, readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

function reportsFolder(document, home = homedir()) {
  const documents = join(home, "Documents");
  const base = existsSync(documents) ? documents : home;
  const repository = String(document.target?.repository ?? "review").replace(/[^A-Za-z0-9._-]+/g, "-");
  const when = new Date(document.at ?? Date.now());
  const two = (n) => String(n).padStart(2, "0");
  const named = `${when.getFullYear()}-${two(when.getMonth() + 1)}-${two(when.getDate())} ${two(when.getHours())}.${two(when.getMinutes())}`;
  for (let copy = 1; ; copy += 1) {
    const folder = join(base, "Evalation", repository, copy === 1 ? named : `${named} (${copy})`);
    const findings = join(folder, "Evalation Findings.json");
    if (!existsSync(findings)) return folder;
    if (JSON.parse(readFileSync(findings, "utf8")).run === document.run) return folder;
  }
}

function reviewName(document, pack) {
  const held = (document.packs ?? []).find((one) => one.pack === pack);
  let title = String(held?.title ?? pack ?? "Review").replace(/[/\\:*?"<>|]+/g, "-").trim();
  if (held?.kind === "concern-set" && !/\bReview$/i.test(title)) title = `${title} Review`;
  return /^Evalation\b/i.test(title) ? title : `Evalation ${title}`;
}

function keepFindings(source, folder) {
  copyFileSync(source, join(folder, "Evalation Findings.json"));
}

module.exports = { keepFindings, reportsFolder, reviewName };
