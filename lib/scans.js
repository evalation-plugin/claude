// scans - where a scan is kept and how it reads.
//
// The scanner writes here and the reader reads here, and neither has to know anything about the
// other. Nothing in this file starts a process, so the command a reading is granted can show a scan
// without importing the command that runs one.
"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");

const HOME = process.env.EVALATION_HOME || join(homedir(), ".evalation");
const SCANS = join(HOME, "scans");

// What each phase is called where a person reads it. The keys are the trade's abbreviations and
// mean nothing to the person a report is written for, so they stay inside the code and these come
// out of it.
const PHASES = {
  sca: "dependency advisories",
  sbom: "bill of materials",
  sast: "static analysis",
  secret: "secret scan",
};

function named(phase) {
  return PHASES[phase] ?? phase;
}

/** The newest scan of this target, or null where none was run. */
function newestFor(target) {
  const root = resolve(target);
  let held = [];
  try {
    held = readdirSync(SCANS).filter((one) => one.endsWith(".json")).sort().reverse();
  } catch {
    return null;
  }
  for (const one of held) {
    try {
      const document = JSON.parse(readFileSync(join(SCANS, one), "utf8"));
      if (document.target?.path === root) return { path: join(SCANS, one), document };
    } catch {
      // A scan file something wrote over is passed by rather than fatal, since an older one is still
      // a true answer about an older tree and the newest readable one is what is wanted.
    }
  }
  return null;
}

/**
 * A scan as a reading meets it: which phases ran, which did not and why, then each finding with its
 * key, where it sits and what the tool said. Set as lines rather than handed over as the tool's own
 * JSON, because a reading that has to parse four scanners' shapes is paying to do what this already
 * did.
 */
function said(document) {
  const lines = [];

  lines.push("Phases:");
  for (const one of document.phases ?? []) {
    if (!one.ran) {
      lines.push(`  The ${named(one.phase)} did not run: ${one.why}.`);
      continue;
    }
    // A phase that answers with an inventory says what it counted. Said as "found 0" it would read
    // as a bill of materials that turned up nothing wrong, which is not a claim it ever makes.
    if (one.inventory) {
      const held = one.inventory;
      const ecosystems = Object.entries(held.ecosystems ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${count} ${name}`)
        .join(", ");
      lines.push(`  The ${named(one.phase)} ran ${one.tool} and counted ${held.components} components` +
        `${ecosystems ? ` (${ecosystems})` : ""}, ` +
        `${held.declaring_no_licence} of them declaring no licence` +
        `${(held.some_of_them ?? []).length ? `, among them ${held.some_of_them.join(", ")}` : ""}.`);
      continue;
    }
    lines.push(`  The ${named(one.phase)} ran ${one.tool} and found ${one.found}.`);
  }
  lines.push(`Findings at or above the ${document.floor} floor: ${(document.findings ?? []).length}.` +
    ((document.below_floor ?? 0) > 0 ? ` Below it: ${document.below_floor}.` : ""));

  for (const one of document.findings ?? []) {
    const at = one.at?.path
      ? `${one.at.path}${one.at.from ? `:${one.at.from}${one.at.to && one.at.to !== one.at.from ? `-${one.at.to}` : ""}` : ""}`
      : "no file named";
    lines.push("");
    lines.push(`${String(one.severity).toUpperCase()}  ${one.key}`);
    lines.push(`  at ${at}`);
    if (one.fixed) lines.push(`  fixed in ${one.fixed}`);
    if (one.transitive) lines.push("  a dependency of a dependency, not one this repository chose");
    if (one.body) lines.push(`  ${one.body}`);
  }

  return lines.join("\n");
}

/**
 * The scan phases a set of packs reads, in the scanner's own order. A concern set reads every phase,
 * since its findings name whatever a scanner found. A standard reads the phases its scan items name
 * and no other, so a SOC 2 run never builds a bill of materials nothing in it prints. Each pack is
 * its kind and its entries.
 */
function phasesRead(packs) {
  const read = new Set();
  for (const pack of packs) {
    if (pack.kind === "concern-set") Object.keys(PHASES).forEach((one) => read.add(one));
    for (const entry of pack.entries ?? []) {
      for (const item of entry.looks_for ?? []) if (item.proof === "scan" && item.phase) read.add(item.phase);
    }
  }
  return Object.keys(PHASES).filter((one) => read.has(one));
}

/** Where a scanner finding sits, as one short string: the package and version, or the file and line. */
function whereOf(one) {
  if (one.package) return `${one.package}${one.version ? ` ${one.version}` : ""}`;
  if (one.at?.path) return `${one.at.path}${one.at.from ? `:${one.at.from}` : ""}`;
  return "";
}

module.exports = { PHASES, SCANS, named, newestFor, phasesRead, said, whereOf };
