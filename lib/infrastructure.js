"use strict";

const { openSync, readSync, closeSync } = require("node:fs");
const { basename } = require("node:path");
const { filesOf, inRepository } = require("./tree.js");

const NAMED = new Set([
  "pulumi.yaml", "pulumi.yml", "cdk.json", "serverless.yml", "serverless.yaml", "kustomization.yaml",
  "kustomization.yml", "chart.yaml", "ansible.cfg", "terragrunt.hcl",
]);
const ENDINGS = [".tf", ".tf.json", ".tfvars", ".bicep"];
const READ = [".yaml", ".yml", ".json", ".template"];

function head(path) {
  let fd;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.alloc(8192);
    const size = readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, size);
  } catch {
    return "";
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function defines(full, path) {
  const name = basename(path).toLowerCase();
  if (NAMED.has(name) || ENDINGS.some((one) => name.endsWith(one))) return true;
  if (/^pulumi\..+\.ya?ml$/.test(name)) return true;
  if (path.split("/").includes(".github") && name === "settings.yml") return true;
  if (!READ.some((one) => name.endsWith(one))) return false;
  const text = head(full);
  if (/AWSTemplateFormatVersion|AWS::Serverless|deploymentTemplate\.json/.test(text)) return true;
  return /^apiVersion:\s*\S+/m.test(text) && /^kind:\s*\S+/m.test(text);
}

function infrastructureIn(root) {
  return filesOf(root).map((full) => [full, inRepository(root, full)])
    .filter(([full, path]) => defines(full, path)).map(([, path]) => path).sort();
}

module.exports = { infrastructureIn };
