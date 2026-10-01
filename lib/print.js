// print - a page becomes a PDF.
//
// A deliverable is handed to somebody who was not in the room, so it is a document rather than
// something that opens in an editor: it prints the same everywhere, and a reader who is shown one
// cannot quietly change what it says and pass it on.
//
// It prints with a browser the machine already has, because the alternative is carrying a rendering
// engine inside a plugin whose whole install story is that it is the only thing a customer installs.
// Nothing is fetched and nothing is uploaded: the page is written beside the output, printed locally,
// removed once printed, and the browser is given no network to reach.
//
// Where no browser is found the page is kept and said aloud. That is the honest failure: the work is
// done and the last step needs something this machine has not got, which a person can finish in one
// action, rather than a run that reports success having produced nothing anybody can read.
"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, rmSync, writeFileSync } = require("node:fs");
const { basename, win32 } = require("node:path");
const { pathToFileURL } = require("node:url");
const { runScript } = require("./script.js");
const { signPdf } = require("./sign.js");
const { offences, own } = require("./prose.js");
const { raised } = require("./errors.js");

// Where a browser actually is, in the order a machine is likely to hold one. A list rather than a
// search, because a search across a filesystem is slow and finds things nobody meant.
const BROWSERS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/microsoft-edge",
  ...[process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA]
    .filter(Boolean)
    .flatMap((root) => [
      win32.join(root, "Google", "Chrome", "Application", "chrome.exe"),
      win32.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]),
];

function plain(html) {
  return html.replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function browser() {
  return BROWSERS.find((one) => existsSync(one)) ?? null;
}

// What a printed page must not carry. Each was a real defect that reached a reader, and none of them
// is visible in the page before it is printed: these documents lay themselves out in the browser, so
// what has to be checked is the page after that has run, not the page that was handed over.
//
// The heading one is the reason this exists. A section running over eight pages appended "(cont.)"
// to a heading that already said it, so the last page was headed "(cont.) (cont.) (cont.) (cont.)"
// with the section's own name pushed off the edge, and nothing anywhere would have said so.
const FAULTS = [
  [/\(cont\.\)[\s\S]{0,40}?\(cont\.\)/, "a heading says (cont.) more than once"],
  [/\{\{[^}]*\}\}/, "an unfilled slot reached the page"],
  [/Page \d+ of 0/, "a page is numbered against no pages"],
  [/\bdata-cut="[^"]*"/, "a page cuts off what runs past its foot"],
  // A missing value shows as a whole text on its own, after a label or a slash, or glued to a unit.
  // The bare word is not the test: a finding about somebody's code may say it produces undefined
  // values, and refusing that sentence had the reading rewording true findings to get them printed.
  [/\[object Object\]|>\s*(?:undefined|NaN|null)\s*<|[:=(/]\s*(?:undefined|NaN)\b|(?:undefined|NaN)(?:%|px|\/\d)/,
    "a value reached the page as a programming artefact"],
];

// A headless browser still asks the macOS keychain for somewhere to keep its passwords, and a person
// printing a report is shown a keychain prompt for it. A printer keeps no passwords, so the browser is
// given a stand-in keychain and never asks.
const QUIET = ["--use-mock-keychain", "--password-store=basic"];

// The page as it stands after its own layout script has run, which is the only place these can be
// seen. Chrome will hand back the finished document without printing it.
function settled(found, pageFile) {
  // The browser writes about its own graphics environment on the way past, which is noise here and
  // would otherwise read as the build failing.
  return execFileSync(found, [
    "--headless=new", ...QUIET, "--disable-gpu", "--no-sandbox", "--dump-dom",
    "--virtual-time-budget=4000", "--no-first-run", "--disable-extensions",
    pathToFileURL(pageFile).href,
  ], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

// What a report says across the top of every page where it could not be signed. A fixed element
// repeats on every printed page, so no page of an unsigned report can be passed on as signed.
const UNSIGNED = "Signature missing, document cannot be verified";

function marked(html) {
  const band = `<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:4px 0;` +
    `background:#E5484D;color:#FFFFFF;font:600 8pt/1.2 sans-serif;text-align:center;` +
    `letter-spacing:0.02em">${UNSIGNED}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (tag) => `${tag}${band}`) : `${band}${html}`;
}

/** The signature for a digest, from our server, as DER. Throws with the server's reason. */
function signatureFor(run, digest) {
  let said;
  try {
    said = runScript("evalation-ask", ["/sign", JSON.stringify({ run, digest })], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (thrown) {
    throw raised(String(thrown.stderr || thrown.message).trim(), null);
  }
  const signature = JSON.parse(said).signature;
  if (typeof signature !== "string") throw raised("the server answered with no signature", "answer /sign with the signature as a base64 string");
  return Buffer.from(signature, "base64");
}

/**
 * Prints the page, and where `seal` names the run, signs the PDF. Where it cannot be signed, the page
 * is printed again marked as unsigned on every page, and the reason is returned. `theirs` is what
 * the reading wrote, which the page check leaves to the findings check.
 */
function print(html, pageFile, into, seal, theirs = []) {
  try {
    return signed(html, pageFile, into, seal, theirs);
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : raised(String(thrown), null);
    if (!error.file) error.file = into;
    throw error;
  }
}

function signed(html, pageFile, into, seal, theirs) {
  const done = printed(html, pageFile, into, theirs);
  if (!seal || !done.printed) return done;
  try {
    signPdf(into, (digest) => signatureFor(seal.run, digest));
    return { ...done, signed: true };
  } catch (thrown) {
    const again = printed(marked(html), pageFile, into, theirs);
    return { ...again, signed: false, unsigned: unsignedWhy(thrown.message) };
  }
}

const { fault, line } = require("./run-say.js");

const UNSIGNED_BECAUSE = [
  [/^unreachable:/, "ev-run.unsigned-unreachable", "ev-run.unsigned-online"],
  [/^(no-settings|no-key|no-installation|unreadable-key-reference|key-wrong-size|settings-unreadable):/, "ev-run.unsigned-signed-out", "ev-run.unsigned-sign-in"],
  [/^refused 402:/, "ev-run.unsigned-ended", "ev-run.unsigned-renew"],
  [/^refused 40[13]:/, "ev-run.unsigned-not-accepted", "ev-run.unsigned-account"],
  [/(?:)/, "ev-run.unsigned-server", "ev-run.unsigned-support"],
];

const unsignedWhy = (message) => line(UNSIGNED_BECAUSE.find(([pattern]) => pattern.test(String(message ?? "")))[1]);

const unsignedThen = (why) => line((UNSIGNED_BECAUSE.find(([, name]) => line(name) === why) ?? UNSIGNED_BECAUSE.at(-1))[2]);

function unfit(into, faults) {
  return Object.assign(raised(`the page is not fit to send:\n  ${faults.join("\n  ")}`, null), { unfit: true, faults, file: into });
}

// The page is written first and printed from disk rather than passed in, because a document of any
// size is past what a command line holds and the failure is silent truncation.
function printed(html, pageFile, into, theirs) {
  writeFileSync(pageFile, html);

  const found = browser();
  if (!found) {
    return { printed: false, page: pageFile };
  }

  // What the page draws, without what draws it and without what it quotes. A stylesheet carries a
  // font as base64, where the letters of any short word turn up by chance, and the layout script
  // carries the very strings it writes: checked whole, the page reports itself faulty for saying
  // what it is about to do.
  //
  // A quoted block is the customer's own code, and an element marked data-quoted is somebody else's
  // words, such as an advisory's description. A line of theirs holding {{ or the word undefined is
  // theirs, and refusing to print a page because what it quotes contains ordinary programming would
  // refuse the packs that quote their evidence most exactly. An advisory about template injection
  // quoted {{...}} and stopped a report.
  const laid = settled(found, pageFile)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<pre[\s\S]*?<\/pre>/gi, "")
    .replace(/<(\w+)[^>]*\bdata-quoted\b[^>]*>[\s\S]*?<\/\1>/gi, "");

  const reading = theirs.map((one) => String(one ?? "").replace(/\s+/g, " "));
  const theirsHolds = (match, index) => {
    const end = laid.indexOf("<", index + match.length - 1);
    const node = plain(laid.slice(laid.lastIndexOf(">", index) + 1, end < 0 ? laid.length : end));
    return node.length > plain(match).length && reading.some((one) => one.includes(node));
  };
  const faults = FAULTS.flatMap(([pattern, said]) => {
    const at = [...laid.matchAll(new RegExp(pattern.source, "g"))].find((one) => !theirsHolds(one[0], one.index));
    return at ? [`${said}: ${JSON.stringify(at[0].slice(0, 70))}`] : [];
  });
  if (/id="out"/.test(laid) && !/class="sheet"/.test(laid)) faults.push("the page's layout script did not run, so nothing is laid out on pages");

  // Every word the page shows that the reading did not write, held to the writing rules a machine
  // can decide: the framing, the key and the summaries around what was found. The reading's words
  // are held to the rules in force when the findings were written, and a run a customer paid for is
  // not refused later for a rule added since.
  const written = theirs.map((one) => own(one).replace(/\s+/g, " ")).join(" ");
  const shown = laid
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ");
  for (const sentence of shown.replace(/\s+/g, " ").split(/(?<=[.?!])\s+/)) {
    for (const hit of offences(sentence)) {
      if (written.includes(hit.near)) continue;
      faults.push(`${hit.rule} in ${JSON.stringify(sentence.trim().slice(0, 90))}`);
    }
  }

  if (faults.length) {
    throw unfit(into, faults);
  }

  execFileSync(found, [
    "--headless=new",
    ...QUIET,
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    // The page carries its own size and margins, so nothing here may add any.
    `--print-to-pdf=${into}`,
    // A deliverable is built from what is already in the page, so nothing it draws is fetched.
    "--disable-remote-fonts=false",
    "--no-first-run",
    "--disable-extensions",
    pathToFileURL(pageFile).href,
  ], { stdio: ["ignore", "ignore", "ignore"], timeout: 120_000 });

  if (!existsSync(into)) throw Object.assign(raised("the browser printed nothing", null), { file: into });
  // Printed, the page has done its work. It sits in a folder a person opens, laid out for paper and
  // not for a screen, so only the PDF stays.
  rmSync(pageFile, { force: true });
  return { printed: true, page: null, into };
}

function unwritten(thrown, written = []) {
  const file = thrown?.file ? basename(thrown.file) : null;
  const lead = !file ? line("ev-run.unwritten-all")
    : line(thrown.unfit ? "ev-run.unwritten-unfit" : thrown.code === "ETIMEDOUT" ? "ev-run.unwritten-slow" : "ev-run.unwritten-stopped", { file });
  const names = written.map((one) => basename(one));
  const before = names.length === 0 ? [] : [names.length === 1 ? line("ev-run.unwritten-before-one", { files: names[0] })
    : line("ev-run.unwritten-before", { files: `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` })];
  return fault([lead, ...before, line("ev-run.unwritten-kept")], [thrown?.file, thrown?.message ?? String(thrown ?? "")].filter(Boolean).join("\n"));
}

function unprintedSaid(pages, into) {
  return line("ev-run.unprinted", { pages: pages.map((one) => basename(one)).join(" and "), folder: into });
}

function unsignedSaid(file, why) {
  return line("ev-run.unsigned", { file: basename(file), why, then: unsignedThen(why) });
}

module.exports = { print, browser, settled, unprintedSaid, unsignedSaid, unsignedThen, unsignedWhy, unwritten };
