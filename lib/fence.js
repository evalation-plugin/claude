"use strict";

const { randomBytes } = require("node:crypto");

function plain(text) {
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "");
}

function fenced(label, what, body, after) {
  const canary = randomBytes(9).toString("hex");
  return [
    `<<<${label} ${canary}`,
    `what: ${what}`,
    "",
    plain(body).replace(/\n+$/, ""),
    `${label} ${canary}>>>`,
    "",
    ...after,
  ].join("\n");
}

module.exports = { fenced, plain };
