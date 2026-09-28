"use strict";

process.stdout.write(JSON.stringify([{
  key: "secret:generic-api-key:config.js:3", phase: "secret", severity: "high", title: "generic-api-key in config.js",
  at: { path: "config.js", from: 3, to: 3 }, body: "A generic API key.", cwe: ["CWE-798"],
}]));
