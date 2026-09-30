"use strict";

const { createHash, createPrivateKey, sign } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const PATH = "/releases/record";

function fail(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(1);
}

async function record(base, key, { version, date, notes }) {
  const body = JSON.stringify({ version, date, notes });
  const at = Math.floor(Date.now() / 1000);
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const signature = sign(null, Buffer.from(`evalation.ask.v1 ${PATH} ${at} ${digest}`, "utf8"), key).toString("base64");
  let answer;
  try {
    answer = await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-evalation-release-at": String(at), "x-evalation-release-signature": signature },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (thrown) {
    fail(`${base}${PATH} couldn't be reached while recording ${version}: ${thrown.message}`);
  }
  const text = await answer.text();
  if (answer.headers.get("cf-mitigated") === "challenge" || (/text\/html/.test(answer.headers.get("content-type") ?? "") && /Just a moment/.test(text))) {
    fail("Cloudflare challenged this runner before it reached our server. Allow POST /releases/record in the Cloudflare WAF, or run this job on our own runner.");
  }
  if (!answer.ok) fail(`recording ${version} was refused with ${answer.status}: ${text}`);
  process.stdout.write(JSON.parse(text).already ? `${version} was already recorded with these notes\n` : `recorded ${version}\n`);
}

async function main() {
  const pem = process.env.EVALATION_RELEASE_SIGNING_KEY ?? "";
  const base = (process.env.EVALATION_RELEASE_URL ?? "").replace(/\/+$/, "");
  if (!pem.trim()) fail("EVALATION_RELEASE_SIGNING_KEY is not set, so the release can't be signed. Set the secret on the repository.");
  if (!base) fail("EVALATION_RELEASE_URL is not set, so there's nowhere to record the release. Set the variable on the repository.");
  let key;
  try {
    key = createPrivateKey(pem);
  } catch (thrown) {
    fail(`EVALATION_RELEASE_SIGNING_KEY isn't an ed25519 private key in PEM form: ${thrown.message}`);
  }

  const { version } = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const releases = JSON.parse(readFileSync(join(ROOT, "release-notes.json"), "utf8")).releases;
  if (!releases.some((one) => one.version === version)) fail(`release-notes.json has no entry for ${version}`);
  for (const one of [...releases].reverse()) await record(base, key, one);
}

main();
