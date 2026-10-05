const fs = require("fs");
const yaml = require("js-yaml");
const [ext, into, tag] = process.argv.slice(2);
const load = (name) => yaml.load(fs.readFileSync(`${ext}/${name}`, "utf8"));

function js(ruby) {
  return portable(String(ruby)
    .replace(/\(\?>/g, "(?:")
    .replace(/([*+?}])\+/g, "$1")
    .replace(/\\A/g, "(?<![\\s\\S])")
    .replace(/\\z/g, "(?![\\s\\S])")
    .replace(/\\Z/g, "(?=\\n?(?![\\s\\S]))")
    .replace(/\\h/g, "[0-9a-fA-F]"));
}

const ESCAPE = /\\(?:[pPk](?:\{[^}]*\}|<[^>]*>)|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|c[A-Za-z]|[\s\S])/y;
const cased = (c) => c.length === 1 && c.toLowerCase() !== c.toUpperCase();

function portable(pattern) {
  let out = "";
  let flags = { i: false, s: false, x: false };
  const outer = [];
  for (let at = 0; at < pattern.length;) {
    const c = pattern[at];
    const rest = pattern.slice(at);
    ESCAPE.lastIndex = at;
    const escape = c === "\\" ? ESCAPE.exec(pattern)[0] : null;
    const set = /^\(\?([imx]*)(?:-([imx]*))?([:)])/.exec(rest);
    if (escape) {
      out += escape;
      at += escape.length;
    } else if (c === "[") {
      const end = classEnd(pattern, at);
      out += flags.i ? folded(pattern.slice(at, end)) : pattern.slice(at, end);
      at = end;
    } else if (flags.x && /\s/.test(c)) {
      at++;
    } else if (flags.x && c === "#") {
      const line = pattern.indexOf("\n", at);
      at = line < 0 ? pattern.length : line + 1;
    } else if (set && set[0] !== "(?:") {
      const next = { ...flags };
      for (const one of set[1]) next[one === "m" ? "s" : one] = true;
      for (const one of set[2] ?? "") next[one === "m" ? "s" : one] = false;
      if (set[3] === ":") {
        outer.push(flags);
        out += "(?:";
      }
      flags = next;
      at += set[0].length;
    } else if (c === "(") {
      const head = /^\((?:\?(?:<[=!]|<[A-Za-z_$][\w$]*>|[:=!]))?/.exec(rest)[0];
      outer.push(flags);
      out += head;
      at += head.length;
    } else {
      if (c === ")") flags = outer.pop() ?? flags;
      out += c === "^" ? "(?<![^\\n])" : c === "$" ? "(?![^\\n])" : c === "." && flags.s ? "[\\s\\S]"
        : flags.i && cased(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c;
      at++;
    }
  }
  return out;
}

function classEnd(pattern, at) {
  let end = at + 1;
  while (end < pattern.length && pattern[end] !== "]") end += pattern[end] === "\\" ? 2 : 1;
  return end + 1;
}

function folded(set) {
  const inner = set.slice(1, -1);
  const lead = inner.startsWith("^-") ? "^-" : inner.startsWith("^") ? "^" : inner.startsWith("-") ? "-" : "";
  const parts = inner.slice(lead.length).match(/\\(?:[pPk](?:\{[^}]*\}|<[^>]*>)|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|c[A-Za-z]|[\s\S])|[\s\S]/g) ?? [];
  let added = "";
  for (let at = 0; at < parts.length; at++) {
    const [one, dash, to] = parts.slice(at, at + 3);
    if (dash === "-" && to !== undefined && cased(one) && cased(to) && (one === one.toLowerCase()) === (to === to.toLowerCase())) {
      added += one === one.toLowerCase() ? `${one.toUpperCase()}-${to.toUpperCase()}` : `${one.toLowerCase()}-${to.toLowerCase()}`;
      at += 2;
    } else if (dash === "-" && to !== undefined) {
      at += 2;
    } else if (cased(one)) {
      added += one === one.toLowerCase() ? one.toUpperCase() : one.toLowerCase();
    }
  }
  return `[${lead}${added}${inner.slice(lead.length)}]`;
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
