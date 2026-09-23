"use strict";
// Where a run's reports go when nobody names a place, and what each file is called. The findings file
// stays under ~/.evalation with the installation's other data, and that folder is hidden. A report is
// something a person opens and hands on, so it goes in their Documents folder, or their home folder
// where there is none. The repository names the folder, and each file is named for the review it
// holds, so a folder of several reviews says which file is which.

const { copyFileSync, existsSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

/** One folder per run, under the repository's own folder, so runs of one repository sit together. */
function reportsFolder(document) {
  const documents = join(homedir(), "Documents");
  const base = existsSync(documents) ? documents : homedir();
  const repository = String(document.target?.repository ?? "review").replace(/[^A-Za-z0-9._-]+/g, "-");
  const day = String(document.at ?? new Date().toISOString()).slice(0, 10);
  return join(base, "Evalation", repository, `${day} ${document.run ?? "run"}`);
}

/**
 * A pack's title as a file name, led by Evalation once: "Evalation Hardening Review", "Evalation SOC 2
 * Trust Services Criteria". A slash, as in ISO/IEC, cannot sit in a file name and becomes a hyphen.
 */
function reviewName(document, pack) {
  const held = (document.packs ?? []).find((one) => one.pack === pack);
  let title = String(held?.title ?? pack ?? "Review").replace(/[/\\:*?"<>|]+/g, "-").trim();
  // A concern set's deliverables are a review, and a run served before 1.72 carries the bare title.
  if (held?.kind === "concern-set" && !/\bReview$/i.test(title)) title = `${title} Review`;
  return /^Evalation\b/i.test(title) ? title : `Evalation ${title}`;
}

/**
 * The findings file beside the reports, since it is what the engine ingests to work the findings, and
 * a person handing the reports on hands that on with them. Copied, never moved: the one under
 * ~/.evalation stays the record.
 */
function keepFindings(source, folder) {
  copyFileSync(source, join(folder, "Evalation Findings.json"));
}

module.exports = { keepFindings, reportsFolder, reviewName };
