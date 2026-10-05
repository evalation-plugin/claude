"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { pluginHome } = require("./home.js");
const { join, resolve } = require("node:path");

const told = (name, values) => { const { entries, say } = require("./say.js"); return say(entries(), name, values); };

const HOME = pluginHome();
const SCANS = join(HOME, "scans");

const PHASES = ["sca", "sbom", "sast", "secret", "history", "licence"];

const ASKED_ONLY = new Set(["history", "licence"]);

function named(phase) {
  return PHASES.includes(phase) ? told(`scan.phase-name-${phase}`) : phase;
}

const SEVERITY = ["critical", "high", "medium", "low", "info"];

const measures = (phase, rule) => (phase.measures ?? []).some((one) => rule === one || String(rule).startsWith(`${one}:`));

function settled(want, scan, since) {
  const phase = (scan?.phases ?? []).find((one) => one.phase === want.phase);
  const fresh = scan && (!since || String(scan.at) >= String(since));
  if (!phase?.ran || !fresh) {
    return { result: "not-checked", over: [], why: !scan || !fresh ? told("scan.why-no-scan")
      : phase?.why ? told("scan.why-off", { phase: named(want.phase), why: phase.why }) : told("scan.why-off-unknown", { phase: named(want.phase) }) };
  }
  if (want.rule && !measures(phase, want.rule)) {
    return { result: "not-checked", over: [], why: told("scan.why-old") };
  }
  if ((phase.unread ?? []).length > 0) {
    const unread = phase.unread.slice(0, 5).join(", ");
    const said = phase.unread.length > 5
      ? told("scan.why-partial-more", { phase: named(want.phase), unread, more: String(phase.unread.length - 5) })
      : told("scan.why-partial", { phase: named(want.phase), unread });
    return { result: "not-checked", over: [], why: `${said}${(phase.todo ?? []).map((one) => `. ${String(one).replace(/\.$/, "")}`).join("")}` };
  }
  const floor = want.at_least ? SEVERITY.indexOf(want.at_least) : SEVERITY.length - 1;
  const seen = new Set();
  const ruled = (one) => !want.rule || one.key === want.rule || String(one.key).startsWith(`${want.rule}:`);
  const over = (scan.findings ?? []).filter((one) => one.phase === want.phase && ruled(one) && SEVERITY.indexOf(one.severity) >= 0 &&
    SEVERITY.indexOf(one.severity) <= floor && !seen.has(one.key) && seen.add(one.key));
  return { result: over.length === 0 ? "found" : "missing", over };
}

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
    }
  }
  return null;
}

function said(document) {
  const lines = [];

  lines.push(told("scan.phases"));
  for (const one of document.phases ?? []) {
    if (!one.ran) {
      lines.push(`  ${told("scan.phase-off", { phase: named(one.phase), why: one.why ?? told("shared.no-reason") })}`);
      continue;
    }
    if (one.inventory) {
      const held = one.inventory;
      const ecosystems = Object.entries(held.ecosystems ?? {})
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => `${count} ${name}`)
        .join(", ");
      const values = { phase: named(one.phase), tool: one.tool, count: String(held.components) };
      lines.push(`  ${ecosystems ? told("scan.phase-counted-kinds", { ...values, kinds: ecosystems }) : told("scan.phase-counted", values)}`);
      continue;
    }
    const values = { phase: named(one.phase), tool: one.tool, count: String(one.found) };
    lines.push(`  ${one.why ? told("scan.phase-found-but", { ...values, why: one.why }) : told("scan.phase-found", values)}`);
  }
  const floor = { floor: String(document.floor), count: String((document.findings ?? []).length) };
  lines.push((document.below_floor ?? 0) > 0 ? told("scan.floor-below", { ...floor, below: String(document.below_floor) }) : told("scan.floor", floor));

  for (const one of document.findings ?? []) {
    const at = one.at?.path
      ? `${one.at.path}${one.at.from ? `:${one.at.from}${one.at.to && one.at.to !== one.at.from ? `-${one.at.to}` : ""}` : ""}`
      : told("scan.no-file");
    lines.push("");
    lines.push(`${String(one.severity).toUpperCase()}  ${one.key}`);
    lines.push(`  ${told("cards.where-one", { place: at })}`);
    if (one.fixed) lines.push(`  ${told("cards.advisory-fixed", { fixed: one.fixed })}`);
    if (one.transitive) lines.push(`  ${told("scan.transitive")}`);
    if (one.body) lines.push(`  ${one.body}`);
  }

  return lines.join("\n");
}

function phasesRead(packs) {
  const read = new Set();
  for (const pack of packs) {
    if (pack.kind === "concern-set") PHASES.filter((one) => !ASKED_ONLY.has(one)).forEach((one) => read.add(one));
    for (const entry of pack.entries ?? []) {
      for (const item of entry.looks_for ?? []) if (item.proof === "scan" && item.phase) read.add(item.phase);
      for (const rule of entry.raised_by ?? []) read.add(String(rule).split(":")[0]);
    }
  }
  return PHASES.filter((one) => read.has(one));
}

function whereOf(one) {
  if (one.package) return `${one.package}${one.version ? ` ${one.version}` : ""}`;
  if (one.at?.path) return `${one.at.path}${one.at.from ? `:${one.at.from}` : ""}`;
  return "";
}

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

function compatible(from, to) {
  const [a, b] = [versionOf(from).parts, versionOf(to).parts];
  if ((a[0] ?? 0) !== (b[0] ?? 0)) return false;
  if ((a[0] ?? 0) === 0 && (a[1] ?? 0) !== (b[1] ?? 0)) return false;
  return true;
}

function cardOf(one) {
  const rule = String(one.title ?? one.key).split(" in ")[0];
  const name = one.phase === "sca" ? one.package : rule;
  return { id: `${one.phase}:${name}`, name, rule };
}

function cardWorst(result, results, order) {
  const card = cardOf(result).id;
  const ranks = results.filter((one) => cardOf(one).id === card)
    .map((one) => order.indexOf(one.severity)).filter((at) => at >= 0);
  return ranks.length > 0 ? order[Math.min(...ranks)] : null;
}

module.exports = { PHASES, SCANS, cardOf, cardWorst, compared, compatible, named, newestFor, phasesRead, said, settled, upgradeTo, whereOf };
