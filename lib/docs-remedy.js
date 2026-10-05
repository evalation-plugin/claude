"use strict";

const { line } = require("./run-say.js");

function docsLine(answer, list) {
  if (!Array.isArray(list) || !Array.isArray(answer?.looked_for)) return "";
  const missing = list.some((want, at) => want?.proof === "written" && answer.looked_for[at]?.result === "missing");
  return missing ? line("report.docs-folder") : "";
}

module.exports = { docsLine };
