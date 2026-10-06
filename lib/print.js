"use strict";

const { execFileSync } = require("node:child_process");
const { existsSync, rmSync, writeFileSync } = require("node:fs");
const { basename, win32 } = require("node:path");
const { pathToFileURL } = require("node:url");
const { runScript } = require("./script.js");
const { signPdf } = require("./sign.js");
const { offences, own } = require("./prose.js");
const { raised } = require("./errors.js");

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

const FAULTS = [
  [/\(cont\.\)[\s\S]{0,40}?\(cont\.\)/, "a heading says (cont.) more than once"],
  [/\{\{[^}]*\}\}/, "an unfilled slot reached the page"],
  [/Page \d+ of 0/, "a page is numbered against no pages"],
  [/\bdata-cut="[^"]*"/, "a page cuts off what runs past its foot"],
  [/(?<=\bdata-wrapped=")[^"]+/, "a label runs onto a second line"],
  [/\[object Object\]|>\s*(?:undefined|NaN|null)\s*<|[:=(/]\s*(?:undefined|NaN)\b|(?:undefined|NaN)(?:%|px|\/\d)/,
    "a value reached the page as a programming artefact"],
];

const QUIET = ["--use-mock-keychain", "--password-store=basic"];

function chrome(found, args, out) {
  try {
    return execFileSync(found, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 120_000, stdio: ["ignore", out, "pipe"] });
  } catch (thrown) {
    if (thrown?.code !== "ETIMEDOUT") {
      const said = String(thrown?.stderr ?? "").split("\n").filter((one) => one.trim()).slice(-5);
      thrown.message = [`the browser stopped with exit status ${thrown?.status ?? "none"} and signal ${thrown?.signal ?? "none"}`, ...said].join("\n");
    }
    throw thrown;
  }
}

function settled(found, pageFile) {
  return chrome(found, [
    "--headless=new", ...QUIET, "--disable-gpu", "--no-sandbox", "--dump-dom",
    "--virtual-time-budget=4000", "--no-first-run", "--disable-extensions",
    pathToFileURL(pageFile).href,
  ], "pipe");
}

const UNSIGNED = (() => { const { entries, say } = require("./say.js"); return say(entries(), "report.unsigned"); })();

function marked(html) {
  const band = `<div style="position:fixed;top:0;left:0;right:0;z-index:2147483647;padding:4px 0;` +
    `background:#E5484D;color:#FFFFFF;font:600 8pt/1.2 sans-serif;text-align:center;` +
    `letter-spacing:0.02em">${UNSIGNED}</div>`;
  return /<body[^>]*>/i.test(html) ? html.replace(/<body[^>]*>/i, (tag) => `${tag}${band}`) : `${band}${html}`;
}

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
  if (typeof signature !== "string") throw raised("the server answered with no signature", "The payload server's /sign answer held no signature. Change the /sign route to answer with the signature as a base64 string.");
  return Buffer.from(signature, "base64");
}

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

function printed(html, pageFile, into, theirs) {
  writeFileSync(pageFile, html);

  const found = browser();
  if (!found) {
    return { printed: false, page: pageFile };
  }

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

  const written = theirs.map((one) => own(one).replace(/\s+/g, " ")).join(" ");
  const shown = laid
    .replace(/<code[\s\S]*?<\/code>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&[a-z]+;/g, " ")
    .replace(/[^\s"']*(?:\/|\w\.[A-Za-z0-9]{1,6}(?=[:\s"',)]|$))[^\s"']*/g, " ");
  for (const sentence of shown.replace(/\s+/g, " ").split(/(?<=[.?!])\s+/)) {
    for (const hit of offences(sentence)) {
      if (hit.rule === "a US spelling" || written.includes(hit.near) || (hit.match && hit.match.trim().length >= 8 && written.includes(hit.match.trim()))) continue;
      faults.push(`${hit.rule} in ${JSON.stringify(sentence.trim().slice(0, 90))}`);
    }
  }

  if (faults.length) {
    throw unfit(into, faults);
  }

  chrome(found, [
    "--headless=new",
    ...QUIET,
    "--disable-gpu",
    "--no-sandbox",
    "--no-pdf-header-footer",
    `--print-to-pdf=${into}`,
    "--disable-remote-fonts=false",
    "--no-first-run",
    "--disable-extensions",
    pathToFileURL(pageFile).href,
  ], "ignore");

  if (!existsSync(into)) throw Object.assign(raised("the browser printed nothing", null), { file: into });
  rmSync(pageFile, { force: true });
  return { printed: true, page: null, into };
}

function unwritten(stopped, written = []) {
  const every = Array.isArray(stopped) ? stopped : [stopped];
  const leads = every.map((thrown) => {
    const file = thrown?.file ? basename(thrown.file) : null;
    return !file ? line("ev-run.unwritten-all")
      : line(thrown.unfit ? "ev-run.unwritten-unfit" : thrown.code === "ETIMEDOUT" ? "ev-run.unwritten-slow" : "ev-run.unwritten-stopped", { file });
  });
  const names = written.map((one) => basename(one));
  const others = names.length === 0 ? [] : [names.length === 1 ? line("ev-run.unwritten-others-one", { files: names[0] })
    : line("ev-run.unwritten-others", { files: `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` })];
  return fault([...leads, ...others, line("ev-run.unwritten-kept")],
    every.map((thrown) => [thrown?.file, thrown?.message ?? String(thrown ?? "")].filter(Boolean).join("\n")).join("\n\n"));
}

function unprintedSaid(pages, into) {
  return line("ev-run.unprinted", { pages: pages.map((one) => basename(one)).join(" and "), folder: into });
}

function unsignedSaid(file, why) {
  return line("ev-run.unsigned", { file: basename(file), why, then: unsignedThen(why) });
}

module.exports = { print, browser, settled, unprintedSaid, unsignedSaid, unsignedThen, unsignedWhy, unwritten };
