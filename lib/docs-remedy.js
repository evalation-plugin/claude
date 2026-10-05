"use strict";

const { line } = require("./run-say.js");

function remedyOf(answer, list) {
  const written = String(answer?.remedy ?? "").trim();
  if (!Array.isArray(list) || !Array.isArray(answer?.looked_for)) return written;
  const missing = list.some((want, at) => want?.proof === "written" && answer.looked_for[at]?.result === "missing");
  if (!missing) return written;
  return [written, line("report.docs-folder")].filter(Boolean).join(" ");
}

module.exports = { remedyOf };
