"use strict";

const { createHash, createPrivateKey, sign } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const SIGNED_PATH = "/releases/record";
const ASSET = "release-record.json";

function fail(reason) {
  process.stderr.write(`${reason}\n`);
  process.exit(1);
}

function signed(key, { version, date, notes }) {
  const body = JSON.stringify({ version, date, notes });
  const at = Math.floor(Date.now() / 1000);
  const digest = createHash("sha256").update(body, "utf8").digest("hex");
  const signature = sign(null, Buffer.from(`evalation.ask.v1 ${SIGNED_PATH} ${at} ${digest}`, "utf8"), key).toString("base64");
  return JSON.stringify({ at, signature, body });
}

async function gitHub(token, what, url, { method = "GET", body, type = "application/json", missing = false } = {}) {
  let answer;
  try {
    answer = await fetch(url, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": type, "user-agent": "evalation-release" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (thrown) {
    fail(`GitHub couldn't be reached while ${what}: ${thrown.message}`);
  }
  if (missing && answer.status === 404) return null;
  const text = await answer.text();
  if (!answer.ok) {
    let message = text;
    try {
      message = JSON.parse(text).message ?? text;
    } catch {}
    fail(`GitHub refused ${what} with ${answer.status}: ${message}`);
  }
  return JSON.parse(text);
}

async function main() {
  const pem = process.env.EVALATION_RELEASE_SIGNING_KEY ?? "";
  const token = process.env.GITHUB_TOKEN ?? "";
  const api = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/+$/, "");
  const repository = process.env.GITHUB_REPOSITORY || "evalation-plugin/claude";
  const target = process.env.GITHUB_SHA || "main";
  if (!pem.trim()) fail("EVALATION_RELEASE_SIGNING_KEY is not set, so the release can't be signed. Set the secret on the repository.");
  if (!token.trim()) fail("GITHUB_TOKEN is not set, so the record can't be attached to the release. Set it to a token that can write releases.");
  let key;
  try {
    key = createPrivateKey(pem);
  } catch (thrown) {
    fail(`EVALATION_RELEASE_SIGNING_KEY isn't an ed25519 private key in PEM form: ${thrown.message}`);
  }

  const { version } = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8"));
  const entry = JSON.parse(readFileSync(join(ROOT, "release-notes.json"), "utf8")).releases.find((one) => one.version === version);
  if (!entry) fail(`release-notes.json has no entry for ${version}`);
  const tag = `v${version}`;

  let release = await gitHub(token, `reading release ${tag}`, `${api}/repos/${repository}/releases/tags/${tag}`, { missing: true });
  if (release?.assets?.some((one) => one.name === ASSET)) {
    process.stdout.write(`${tag} already carries its signed record\n`);
    return;
  }
  if (!release) {
    const body = JSON.stringify({ tag_name: tag, target_commitish: target, name: version, body: entry.notes.map((note) => `- ${note}`).join("\n") });
    release = await gitHub(token, `creating release ${tag}`, `${api}/repos/${repository}/releases`, { method: "POST", body });
  }
  const upload = `${release.upload_url.replace(/\{.*\}$/, "")}?name=${ASSET}`;
  await gitHub(token, `attaching the record to ${tag}`, upload, { method: "POST", body: signed(key, entry) });
  process.stdout.write(`attached the signed record to ${tag}\n`);
}

main();
