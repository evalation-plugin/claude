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
const { join } = require("node:path");
const { signPdf } = require("./sign.js");

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
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
];

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
    `file://${pageFile}`,
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
    said = execFileSync(join(__dirname, "..", "bin", "evalation-ask"), ["/sign", JSON.stringify({ run, digest })], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (thrown) {
    throw new Error(String(thrown.stderr || thrown.message).trim());
  }
  const signature = JSON.parse(said).signature;
  if (typeof signature !== "string") throw new Error("the server answered with no signature");
  return Buffer.from(signature, "base64");
}

/**
 * Prints the page, and where `seal` names the run, signs the PDF. Where it cannot be signed, the page
 * is printed again marked as unsigned on every page, and the reason is returned.
 */
function print(html, pageFile, into, seal) {
  const done = printed(html, pageFile, into);
  if (!seal || !done.printed) return done;
  try {
    signPdf(into, (digest) => signatureFor(seal.run, digest));
    return { ...done, signed: true };
  } catch (thrown) {
    const again = printed(marked(html), pageFile, into);
    return { ...again, signed: false, unsigned: thrown.message };
  }
}

// The page is written first and printed from disk rather than passed in, because a document of any
// size is past what a command line holds and the failure is silent truncation.
function printed(html, pageFile, into) {
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

  const faults = FAULTS
    .filter(([pattern]) => pattern.test(laid))
    .map(([pattern, said]) => {
      const at = pattern.exec(laid);
      return `${said}: ${JSON.stringify(String(at?.[0] ?? "").slice(0, 70))}`;
    });

  if (faults.length) {
    throw new Error(`the page is not fit to send:\n  ${faults.join("\n  ")}`);
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
    `file://${pageFile}`,
  ], { stdio: ["ignore", "ignore", "ignore"], timeout: 120_000 });

  if (!existsSync(into)) throw new Error("the browser printed nothing");
  // Printed, the page has done its work. It sits in a folder a person opens, laid out for paper and
  // not for a screen, so only the PDF stays.
  rmSync(pageFile, { force: true });
  return { printed: true, page: null, into };
}

module.exports = { print, browser };
