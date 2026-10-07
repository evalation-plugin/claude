"use strict";

const { execFileSync, spawn } = require("node:child_process");
const { join } = require("node:path");

const BIN = join(__dirname, "..", "bin");

function runScript(name, args, options) {
  try {
    return execFileSync(process.execPath, [join(BIN, name), ...args], { maxBuffer: 256 * 1024 * 1024, ...options });
  } catch (thrown) {
    if (thrown?.status) require("./errors.js").quiet();
    throw thrown;
  }
}

function spawnScript(name, args, options) {
  return spawn(process.execPath, [join(BIN, name), ...args], options);
}

module.exports = { runScript, spawnScript };
