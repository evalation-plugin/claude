"use strict";

const { readFileSync, writeFileSync } = require("node:fs");

const list = JSON.parse(readFileSync(0, "utf8"));
writeFileSync(process.argv[2], JSON.stringify(list));
process.stdout.write(JSON.stringify(list.map((one) => ({ ...one, licences: ["MIT"] }))));
