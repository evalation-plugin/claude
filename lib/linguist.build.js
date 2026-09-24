// Converts GitHub Linguist's data files into lib/linguist.json, the one file the plugin reads for its
// language split. Not run by the plugin: rerun it by hand when Linguist's data moves, with js-yaml
// installed and the folder holding languages.yml, heuristics.yml, documentation.yml and vendor.yml.
// Take them from GitHub Linguist's own repository at a release tag, lib/linguist/, since that is what
// GitHub runs, and name the tag.
//   node lib/linguist.build.js <linguist data folder> lib/linguist.json <tag>
const fs = require("fs");
const yaml = require("js-yaml");
const [ext, into, tag] = process.argv.slice(2);
const load = (name) => yaml.load(fs.readFileSync(`${ext}/${name}`, "utf8"));

// Ruby's regular expressions, said the way JavaScript's are. Atomic groups and possessive quantifiers
// only cut backtracking, so dropping them keeps what matches. \A and \z anchor the whole text.
function js(ruby) {
  // A flag set for the whole pattern, (?i) or (?im), becomes a group carrying it, the form JavaScript has.
  const whole = String(ruby).match(/^\(\?([imx]+)\)([\s\S]*)$/);
  const text = whole ? `(?${whole[1].replace("x", "")}:${whole[2]})` : String(ruby);
  return text
    .replace(/\(\?>/g, "(?:")
    .replace(/([*+?}])\+/g, "$1")
    .replace(/\\A/g, "(?<![\\s\\S])")
    .replace(/\\z/g, "(?![\\s\\S])")
    .replace(/\\Z/g, "(?=\\n?(?![\\s\\S]))")
    .replace(/\\h/g, "[0-9a-fA-F]");
}
function checked(list, where, dropped) {
  return list.map(js).filter((one) => {
    try {
      new RegExp(one, "m");
      return true;
    } catch {
      dropped.push(`${where}: ${one}`);
      return false;
    }
  });
}

const dropped = [];
const languages = {};
for (const [name, one] of Object.entries(load("languages.yml"))) {
  languages[name] = {
    type: one.type,
    ...(one.group ? { group: one.group } : {}),
    ...(one.extensions ? { extensions: one.extensions } : {}),
    ...(one.filenames ? { filenames: one.filenames } : {}),
    ...(one.interpreters ? { interpreters: one.interpreters } : {}),
  };
}

const heuristics = load("heuristics.yml");
const named = {};
for (const [name, pattern] of Object.entries(heuristics.named_patterns ?? {})) {
  named[name] = checked([].concat(pattern), `named ${name}`, dropped).join("|");
}
const rule = (one) => {
  const out = {};
  if (one.language) out.language = [].concat(one.language);
  if (one.pattern) {
    // A rule whose every pattern failed to convert never matches, where an empty one would match all.
    const held = checked([].concat(one.pattern), "pattern", dropped);
    out.pattern = held.length > 0 ? held.join("|") : null;
  }
  if (one.negative_pattern) out.negative = checked([].concat(one.negative_pattern), "negative", dropped).join("|");
  if (one.named_pattern) out.pattern = named[one.named_pattern] || null;
  if (one.and) out.and = one.and.map(rule);
  return out;
};
const disambiguations = (heuristics.disambiguations ?? []).map((one) => ({ extensions: one.extensions, rules: one.rules.map(rule) }));

const out = {
  source: `GitHub Linguist ${tag} data files, converted by lib/linguist.build.js. ` +
    "GitHub Linguist is released under the MIT licence, Copyright (c) GitHub, Inc.",
  languages,
  disambiguations,
  documentation: checked(load("documentation.yml"), "documentation", dropped),
  vendored: checked(load("vendor.yml"), "vendored", dropped),
};
fs.writeFileSync(into, JSON.stringify(out) + "\n");
console.log(`${Object.keys(languages).length} languages, ${disambiguations.length} disambiguations, ` +
  `${out.documentation.length} documentation and ${out.vendored.length} vendored patterns, ${dropped.length} dropped`);
for (const one of dropped.slice(0, 10)) console.log("  dropped", one.slice(0, 120));
