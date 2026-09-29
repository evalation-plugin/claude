"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");
const processes = require("node:child_process");
const started = [];
const running = processes.execFileSync;
processes.execFileSync = (command, ...rest) => {
  started.push(String(command));
  return running(command, ...rest);
};
require("./fixture.js");

const write = (at, path, text) => {
  mkdirSync(dirname(join(at, path)), { recursive: true });
  writeFileSync(join(at, path), text);
};
const lockOf = (packages) => `version = 4\n\n${packages.map(([name, version, source, deps = []]) =>
  `[[package]]\nname = "${name}"\nversion = "${version}"\n${source ? `source = "${source}"\n` : ""}${deps.length ? `dependencies = [\n${deps.map((one) => ` "${one}",`).join("\n")}\n]\n` : ""}`).join("\n")}`;
const REGISTRY = "registry+https://github.com/rust-lang/crates.io-index";

function fixture() {
  const repo = mkdtempSync(join(tmpdir(), "evalation-cargo-"));
  const home = mkdtempSync(join(tmpdir(), "evalation-cargo-home-"));
  write(repo, "services/Cargo.toml", "[workspace]\nmembers = [\"app\"]\nresolver = \"2\"\n");
  write(repo, "services/app/Cargo.toml", [
    "[package]", "name = \"app\"", "version = \"0.1.0\"", "",
    "[dependencies]", "serde = { version = \"1\", features = [\"derive\"] }", "gpl-thing = \"1\"",
    "rq = { package = \"reqwest-ish\", version = \"1\" }", "bare = \"1\"", "",
    "[target.'cfg(unix)'.dependencies]", "libc = \"0.2\"", "",
    "[dev-dependencies]", "wiremock = \"0.6\"", "",
    "[build-dependencies]", "cc = \"1\"", "",
  ].join("\n"));
  write(repo, "services/Cargo.lock", lockOf([
    ["app", "0.1.0", null, ["serde", "gpl-thing", "reqwest-ish", "bare", "libc", "wiremock", "cc"]],
    ["serde", "1.0.0", REGISTRY, ["serde_derive"]],
    ["serde_derive", "1.0.0", REGISTRY],
    ["gpl-thing", "1.0.0", REGISTRY, ["bindgen"]],
    ["bindgen", "0.70.0", REGISTRY],
    ["reqwest-ish", "1.0.0", REGISTRY, ["h2"]],
    ["h2", "0.4.0", REGISTRY],
    ["bare", "1.0.0", REGISTRY],
    ["libc", "0.2.0", REGISTRY],
    ["wiremock", "0.6.0", REGISTRY, ["hidden"]],
    ["hidden", "1.0.0", REGISTRY],
    ["cc", "1.0.0", REGISTRY],
  ]));
  const crate = (name, version, license, extra = "") => write(home, `registry/src/index.crates.io-1949cf8c6b5b557f/${name}-${version}/Cargo.toml`,
    `[package]\nname = "${name}"\nversion = "${version}"\n${license ? `license = "${license}"\n` : ""}\n${extra}`);
  crate("serde", "1.0.0", "MIT OR Apache-2.0", "[dependencies.serde_derive]\nversion = \"1\"\noptional = true\n");
  crate("serde_derive", "1.0.0", "MIT OR Apache-2.0");
  crate("gpl-thing", "1.0.0", "GPL-3.0-only", "[build-dependencies.bindgen]\nversion = \"0.70\"\n");
  crate("bindgen", "0.70.0", "AGPL-3.0-only");
  crate("bare", "1.0.0", null);
  crate("libc", "0.2.0", "MIT OR Apache-2.0");
  crate("wiremock", "0.6.0", "MIT", "[dependencies.hidden]\nversion = \"1\"\n");
  crate("hidden", "1.0.0", "SSPL-1.0");
  crate("cc", "1.0.0", "MIT OR Apache-2.0");
  return { repo, home };
}

test("a Cargo.lock is read from the local registry, leaving out dev and build-only crates, and a crate not downloaded is unread by name", () => {
  const { cratesIn } = require("../bin/evalation-scan");
  const { repo, home } = fixture();
  const read = cratesIn(repo, "services/Cargo.lock", { cargoHome: home });
  const names = read.Packages.map((one) => one.Name).sort();
  assert.deepStrictEqual(names, ["bare", "gpl-thing", "h2", "libc", "reqwest-ish", "serde", "serde_derive"]);
  assert.deepStrictEqual(read.Unread.sort(), ["h2 0.4.0", "reqwest-ish 1.0.0"]);
  assert.strictEqual(read.Packages.find((one) => one.Name === "serde").Relationship, "direct");
  assert.strictEqual(read.Packages.find((one) => one.Name === "serde_derive").Relationship, "indirect");

  const { licences } = require("../bin/evalation-scan");
  const said = licences("{}", ["services/Cargo.lock"], [read]);
  const restricted = said.findings.find((one) => one.key === "licence:restricted");
  assert.strictEqual(restricted.severity, "high", "the AGPL build tool and the SSPL test crate are left out");
  assert.match(restricted.body, /gpl-thing 1\.0\.0 \(GPL-3\.0-only\)/);
  assert.match(said.findings.find((one) => one.key === "licence:unknown").body, /bare 1\.0\.0/);
  assert.doesNotMatch(said.findings.find((one) => one.key === "licence:unknown").body, /reqwest-ish|h2/);
  assert.deepStrictEqual(said.unread.sort(), ["h2 0.4.0 in services/Cargo.lock", "reqwest-ish 1.0.0 in services/Cargo.lock"]);
});

test("with nothing downloaded, the whole lockfile is unread", () => {
  const { cratesIn, licences } = require("../bin/evalation-scan");
  const { repo } = fixture();
  const read = cratesIn(repo, "services/Cargo.lock", { cargoHome: mkdtempSync(join(tmpdir(), "evalation-empty-")) });
  assert.deepStrictEqual(licences("{}", ["services/Cargo.lock"], [read]).unread, ["services/Cargo.lock"]);
});

test("the plugin never starts cargo in the repository, reading the registry alone", () => {
  const { adapterFor } = require("../bin/evalation-scan");
  const { repo, home } = fixture();
  const was = process.env.CARGO_HOME;
  process.env.CARGO_HOME = home;
  try {
    started.length = 0;
    adapterFor("licence", "trivy").read("{}", repo);
    assert.deepStrictEqual(started.filter((one) => /cargo/.test(one)), []);
  } finally {
    if (was === undefined) delete process.env.CARGO_HOME;
    else process.env.CARGO_HOME = was;
  }
});

test("where crates are not downloaded, the reason says to fetch them and run again", () => {
  const { adapterFor } = require("../bin/evalation-scan");
  const { settled } = require("../lib/scans.js");
  const { repo, home } = fixture();
  const was = process.env.CARGO_HOME;
  process.env.CARGO_HOME = home;
  let read;
  try {
    read = adapterFor("licence", "trivy").read("{}", repo);
  } finally {
    if (was === undefined) delete process.env.CARGO_HOME;
    else process.env.CARGO_HOME = was;
  }
  assert.deepStrictEqual(read.todo, ["Run cargo fetch in services, then run Evalation again, to read every crate's licence."]);
  const why = settled({ phase: "licence", rule: "licence:restricted" },
    { phases: [{ phase: "licence", ran: true, measures: ["licence:restricted"], unread: read.unread, todo: read.todo }], findings: [] }).why;
  assert.match(why, /covers only part of the repository\. Run cargo fetch in services, then run Evalation again, to read every crate's licence$/);
  const nothing = adapterFor("licence", "trivy");
  process.env.CARGO_HOME = mkdtempSync(join(tmpdir(), "evalation-empty-"));
  try {
    assert.match(nothing.read("{}", repo).why, /Run cargo fetch in services, then run Evalation again/);
  } finally {
    if (was === undefined) delete process.env.CARGO_HOME;
    else process.env.CARGO_HOME = was;
  }
});

test("the reason a partial read gives names at most a handful of what was missed", () => {
  const { settled } = require("../lib/scans.js");
  const unread = Array.from({ length: 40 }, (_, at) => `crate${at} 1.0.0 in services/Cargo.lock`);
  const why = settled({ phase: "licence", rule: "licence:restricted" },
    { phases: [{ phase: "licence", ran: true, measures: ["licence:restricted"], unread }], findings: [] }).why;
  assert.match(why, /crate0 1\.0\.0/);
  assert.match(why, /and 35 more/);
  assert.doesNotMatch(why, /crate39/);
});
