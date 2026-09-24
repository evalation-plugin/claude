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

/** A version as numbers and a pre-release tag, so 3.4.11 sorts after 3.4.9 and 5.0.0-beta after 4. */
function versionOf(text) {
  const [main, ...pre] = String(text ?? "").trim().replace(/^v/, "").split("-");
  return { parts: main.split(".").map((one) => Number.parseInt(one, 10) || 0), pre: pre.join("-") };
}

function compared(a, b) {
  const x = versionOf(a);
  const y = versionOf(b);
  for (let at = 0; at < Math.max(x.parts.length, y.parts.length); at += 1) {
    const d = (x.parts[at] ?? 0) - (y.parts[at] ?? 0);
    if (d !== 0) return d;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre.localeCompare(y.pre, undefined, { numeric: true });
}

/**
 * The one version that clears every advisory against an installed package, and how many advisories
 * no published version fixes. Each advisory may name a fix on several release lines, "3.3.2, 2.5.9",
 * so the fix on the installed line is taken where there is one, since it is the smallest step, and
 * the lowest later version otherwise. The upgrade is the highest of those.
 */
function upgradeTo(installed, fixes) {
  let target = null;
  let unfixed = 0;
  for (const fixed of fixes) {
    const later = String(fixed ?? "").split(",").map((one) => one.trim()).filter((one) => one && compared(one, installed) > 0);
    if (later.length === 0) {
      unfixed += 1;
      continue;
    }
    const line = later.filter((one) => versionOf(one).parts[0] === versionOf(installed).parts[0]);
    const pick = (line.length > 0 ? line : later).sort(compared)[0];
    if (!target || compared(pick, target) > 0) target = pick;
  }
  return { target, unfixed };
}

/**
 * Whether moving from one version to another stays on the same compatible line under semantic
 * versioning: the same major, or below 1.0 the same minor, since a 0.x package breaks on a minor step.
 * A step off the line can break whatever package asked for the old one.
 */
function compatible(from, to) {
  const [a, b] = [versionOf(from).parts, versionOf(to).parts];
  if ((a[0] ?? 0) !== (b[0] ?? 0)) return false;
  if ((a[0] ?? 0) === 0 && (a[1] ?? 0) !== (b[1] ?? 0)) return false;
  return true;
}

module.exports = { PHASES, SCANS, compared, compatible, named, newestFor, phasesRead, said, upgradeTo, whereOf };
