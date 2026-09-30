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

async function main() {
  const key = process.env.EVALATION_RELEASE_SIGNING_KEY ?? "";
  const base = (process.env.EVALATION_RELEASE_URL ?? "").replace(/\/+$/, "");
  if (!key.trim()) fail("EVALATION_RELEASE_SIGNING_KEY is not set, so the release can't be signed. Set the secret on the repository.");
  if (!base) fail("EVALATION_RELEASE_URL is not set, so there's nowhere to record the release. Set the variable on the repository.");

  const { version } = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const entry = JSON.parse(readFileSync(join(ROOT, "release-notes.json"), "utf8")).releases.find((one) => one.version === version);
  if (!entry) fail(`release-notes.json has no entry for ${version}`);

  const body = JSON.stringify({ version, date: entry.date, notes: entry.notes });
  const at = Math.floor(Date.now() / 1000);
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  let signature;
  try {
    signature = sign(null, Buffer.from(`evalation.ask.v1 ${PATH} ${at} ${digest}`, "utf8"), createPrivateKey(key)).toString("base64");
  } catch (thrown) {
    fail(`EVALATION_RELEASE_SIGNING_KEY isn't an ed25519 private key in PEM form: ${thrown.message}`);
  }

  let answer;
  try {
    answer = await fetch(`${base}${PATH}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-evalation-release-at": String(at), "x-evalation-release-signature": signature },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (thrown) {
    fail(`${base}${PATH} couldn't be reached: ${thrown.message}`);
  }
  const text = await answer.text();
  if (!answer.ok) fail(`recording ${version} was refused with ${answer.status}: ${text}`);
  const said = JSON.parse(text);
  process.stdout.write(said.already ? `${version} was already recorded with these notes\n` : `recorded ${version}\n`);
}

main();
