// fence - text somebody else wrote, handed to a reading as data.
//
// The canary is made for each block and appears in both its opening and its closing line, so text
// inside cannot close a block whose terminator it could not have known. The instruction comes after
// the text, because an instruction placed first is read as context for what follows and one placed
// last is the thing still in view when the reading answers.
"use strict";

const { randomBytes } = require("node:crypto");

// Control characters and the invisible ones that reorder or hide text, which is how a file hides an
// instruction inside what looks like a comment.
function plain(text) {
  return String(text)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/[​-‏‪-‮⁠-⁤⁦-⁩﻿]/g, "");
}

/** A block of somebody else's text under a label, then the lines telling the reader what it is. */
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
