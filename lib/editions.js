"use strict";

const { spelling } = require("./spelling.js");

const tagsOf = (entry) => [entry.editions, ...(Array.isArray(entry.earlier) ? entry.earlier.map((one) => one?.editions) : [])]
  .filter(Array.isArray);

function editionsOf(body) {
  const named = new Set((body?.entries ?? []).flatMap((entry) => tagsOf(entry).flat()));
  return [...named].sort().reverse();
}

const monthOf = (edition) => new Date(`${edition}-01T00:00:00Z`)
  .toLocaleDateString(spelling() === "us" ? "en-US" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function wordingAt(entry, edition) {
  const { editions, earlier, ...own } = entry;
  const used = (Array.isArray(earlier) ? earlier : []).find((one) => one?.editions?.includes(edition));
  if (used) {
    const differs = { ...used };
    delete differs.editions;
    return { ...own, ...differs };
  }
  return !Array.isArray(editions) || editions.includes(edition) ? own : null;
}

function atEdition(body, edition) {
  return {
    ...body,
    version: monthOf(edition),
    entries: (body.entries ?? []).map((entry) => wordingAt(entry, edition)).filter(Boolean),
  };
}

module.exports = { atEdition, editionsOf, monthOf };
