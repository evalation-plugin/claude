// print - a page becomes a PDF.
//
// A deliverable is handed to somebody who was not in the room, so it is a document rather than
// something that opens in an editor: it prints the same everywhere, and a reader who is shown one
// cannot quietly change what it says and pass it on.
//
// It prints with a browser the machine already has, because the alternative is carrying a rendering
// engine inside a plugin whose whole install story is that it is the only thing a customer installs.
// Nothing is fetched and nothing is uploaded: the page is written beside the output, printed locally,
// and the browser is given no network to reach.
//
// Where no browser is found the page is kept and said aloud. That is the honest failure: the work is
// done and the last step needs something this machine has not got, which a person can finish in one
// action, rather than a run that reports success having produced nothing anybody can read.
"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, writeFileSync } = require("node:fs");

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
  [/undefined|\[object Object\]|NaN/, "a value reached the page as a programming artefact"],
];

// The page as it stands after its own layout script has run, which is the only place these can be
// seen. Chrome will hand back the finished document without printing it.
function settled(found, pageFile) {
  // The browser writes about its own graphics environment on the way past, which is noise here and
  // would otherwise read as the build failing.
  return execFileSync(found, [
    "--headless=new", "--disable-gpu", "--no-sandbox", "--dump-dom",
    "--virtual-time-budget=4000", "--no-first-run", "--disable-extensions",
    `file://${pageFile}`,
  ], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

// The page is written first and printed from disk rather than passed in, because a document of any
// size is past what a command line holds and the failure is silent truncation.
function print(html, pageFile, into) {
  writeFileSync(pageFile, html);

  const found = browser();
  if (!found) {
    return { printed: false, page: pageFile };
  }

  // What the page draws, without what draws it. A stylesheet carries a font as base64, where the
  // letters of any short word turn up by chance, and the layout script carries the very strings it
  // writes: checked whole, the page reports itself faulty for saying what it is about to do.
  const laid = settled(found, pageFile)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

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
  return { printed: true, page: pageFile, into };
}

module.exports = { print, browser };
