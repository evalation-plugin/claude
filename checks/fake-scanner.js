"use strict";

process.stdout.write(JSON.stringify([{
  key: "sca:left-pad@1.0.0:CVE-2026-1", phase: "sca", severity: "high", title: "CVE-2026-1 in left-pad 1.0.0",
  package: "left-pad", version: "1.0.0", fixed: "1.0.1", at: { path: "package.json" }, body: "A crafted input slows the service.",
}]));
