"use strict";

const { readFileSync, readdirSync } = require("node:fs");
const { join, relative, sep } = require("node:path");
const { raised } = require("./errors.js");

const SLIDE = /^ppt\/slides\/slide(\d+)\.xml$/;

function partsUnder(root, at = root) {
  return readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((one) => {
    const path = join(at, one.name);
    if (one.isDirectory()) return partsUnder(root, path);
    return [{ name: relative(root, path).split(sep).join("/"), content: readFileSync(path) }];
  });
}

function openFolder(root) {
  const entries = partsUnder(root);
  const numbered = entries
    .map((entry, at) => ({ entry, at, match: SLIDE.exec(entry.name) }))
    .filter((one) => one.match)
    .sort((a, b) => Number(a.match[1]) - Number(b.match[1]));

  return {
    entries,
    slides: numbered.map((one) => ({
      at: one.at,
      number: Number(one.match[1]),
      get xml() {
        return entries[one.at].content.toString("utf8");
      },
      set xml(value) {
        entries[one.at].content = Buffer.from(value, "utf8");
      },
    })),
  };
}

function shapes(xml) {
  const found = [];
  let at = 0;
  for (;;) {
    const from = xml.indexOf("<p:sp>", at);
    if (from < 0) break;
    const to = xml.indexOf("</p:sp>", from);
    if (to < 0) break;
    const body = xml.slice(from, to + 7);
    const offset = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(body);
    found.push({
      from,
      to: to + 7,
      body,
      text: [...body.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(""),
      left: offset ? Number(offset[1]) : 0,
      top: offset ? Number(offset[2]) : 0,
    });
    at = to + 7;
  }
  return found;
}

function escaped(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function filled(body, mapping) {
  let count = 0;
  const done = body.replace(/<a:t>([^<]*)<\/a:t>/g, (whole, text) => {
    let value = text;
    for (const [token, replacement] of Object.entries(mapping)) {
      if (!value.includes(token)) continue;
      value = value.split(token).join(escaped(replacement));
      count += 1;
    }
    return `<a:t>${value}</a:t>`;
  });
  return { body: done, count };
}

function fill(xml, mapping) {
  return filled(xml, mapping).body;
}

function cloneRow(xml, row, down, id) {
  let next = id;
  const copies = row
    .map((shape) => {
      next += 1;
      return shape.body
        .replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (whole, x, y) =>
          `<a:off x="${x}" y="${Number(y) + down}"/>`)
        .replace(/<p:cNvPr id="\d+"/, `<p:cNvPr id="${next}"`);
    })
    .join("");

  const after = Math.max(...row.map((shape) => shape.to));
  return { xml: xml.slice(0, after) + copies + xml.slice(after), id: next };
}

function highest(xml) {
  return [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)]
    .reduce((most, m) => Math.max(most, Number(m[1])), 0);
}

function duplicateSlide(deck, source, after) {
  const entries = deck.entries;
  const used = entries
    .map((entry) => SLIDE.exec(entry.name))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const number = Math.max(...used) + 1;
  const name = `ppt/slides/slide${number}.xml`;

  entries.push({ name, content: Buffer.from(source.xml, "utf8") });

  const relsName = `ppt/slides/_rels/slide${source.number}.xml.rels`;
  const rels = entries.find((entry) => entry.name === relsName);
  if (rels) {
    entries.push({
      name: `ppt/slides/_rels/slide${number}.xml.rels`,
      content: Buffer.from(rels.content),
    });
  }

  const types = entries.find((entry) => entry.name === "[Content_Types].xml");
  types.content = Buffer.from(
    types.content.toString("utf8").replace(
      "</Types>",
      `<Override PartName="/${name}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`,
    ),
    "utf8",
  );

  const presentationRels = entries.find((entry) => entry.name === "ppt/_rels/presentation.xml.rels");
  let relsXml = presentationRels.content.toString("utf8");
  const nextRel = [...relsXml.matchAll(/Id="rId(\d+)"/g)]
    .reduce((most, m) => Math.max(most, Number(m[1])), 0) + 1;
  relsXml = relsXml.replace(
    "</Relationships>",
    `<Relationship Id="rId${nextRel}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${number}.xml"/></Relationships>`,
  );
  presentationRels.content = Buffer.from(relsXml, "utf8");

  const presentation = entries.find((entry) => entry.name === "ppt/presentation.xml");
  let xml = presentation.content.toString("utf8");
  const ids = [...xml.matchAll(/<p:sldId id="(\d+)"/g)].map((m) => Number(m[1]));
  const entry = `<p:sldId id="${Math.max(...ids) + 1}" r:id="rId${nextRel}"/>`;

  const list = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(xml)[1];
  const items = list.match(/<p:sldId [^>]*\/>/g) ?? [];
  items.splice(after + 1, 0, entry);
  xml = xml.replace(/<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/, `<p:sldIdLst>${items.join("")}</p:sldIdLst>`);
  presentation.content = Buffer.from(xml, "utf8");

  const at = entries.length - (rels ? 2 : 1);
  return {
    at,
    number,
    get xml() {
      return entries[at].content.toString("utf8");
    },
    set xml(value) {
      entries[at].content = Buffer.from(value, "utf8");
    },
  };
}

function blank(xml) {
  return xml.replace(/<a:t>([^<]*)<\/a:t>/g, (whole, text) =>
    (text.includes("{{") ? "<a:t></a:t>" : whole));
}

function stripNotes(xml) {
  const all = shapes(xml);
  const measured = (shape) => {
    const found = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(shape.body);
    return found ? { width: Number(found[1]), height: Number(found[2]) } : { width: 0, height: 0 };
  };

  const going = new Set();
  const scaffolding = (one) => /^TEMPLATE\s/.test(one.text.trim()) || /^[.…]{1,3}$/.test(one.text.trim());

  for (const note of all.filter(scaffolding)) {
    going.add(note.from);
    for (const one of all) {
      if (one.text.trim() || going.has(one.from)) continue;
      const within = one.top >= note.top && one.top + measured(one).height <= note.top + measured(note).height;
      if (within && one.left <= note.left + measured(note).width) going.add(one.from);
    }
  }

  let out = xml;
  for (const shape of all.filter((one) => going.has(one.from)).sort((a, b) => b.from - a.from)) {
    out = out.slice(0, shape.from) + out.slice(shape.to);
  }
  return out;
}

function moveTo(xml, shape, top) {
  const body = shape.body.replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (whole, x) =>
    `<a:off x="${x}" y="${Math.round(top)}"/>`);
  return xml.slice(0, shape.from) + body + xml.slice(shape.to);
}

function rewrite(xml, edits) {
  let out = xml;
  const seen = new Set();
  for (const one of [...edits].sort((a, b) => b.shape.from - a.shape.from)) {
    if (seen.has(one.shape.from)) {
      throw raised(`two changes to one shape at ${one.shape.from}, which cannot both be written`, "The plugin's deck builder made two changes to one shape of the template. Change the code calling rewrite in lib/pptx.js to merge changes to the same shape into one edit.");
    }
    seen.add(one.shape.from);
    out = out.slice(0, one.shape.from) + (one.body ?? "") + out.slice(one.shape.to);
  }
  return out;
}

function remaining(xml) {
  return [...xml.matchAll(/<a:t>([^<]*\{\{[^<]*)<\/a:t>/g)].map((m) => m[1]);
}

module.exports = {
  openFolder, shapes, fill, filled, cloneRow, highest, duplicateSlide,
  blank, remaining, stripNotes, moveTo, rewrite, escaped,
};
