// pptx - filling the deck template, and nothing more.
//
// The board pack's design lives in reporting/assets/review-deck-template.pptx: its slides, its
// colours, its fonts, its geometry. None of that is here and none of it should be. What is here
// replaces {{tokens}} with a run's real numbers, repeats a row where a run has more rows than the
// template drew, and repeats the findings slide once per category.
//
// So a rebrand is a template edit rather than a change to this file, and this file only changes when
// the data changes shape. That split is what stops a deliverable being redesigned by whoever last
// touched the code.
//
// The template writes each token inside a single text run, which is what makes replacing one a string
// operation rather than a parse. A token split across runs by an editor would not be found, so the
// fill reports what it replaced and the caller refuses a deck still holding a raw token.
"use strict";

const { read, write } = require("./zip.js");

const SLIDE = /^ppt\/slides\/slide(\d+)\.xml$/;

function open(buffer) {
  const entries = read(buffer);
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

// Every shape on a slide, in document order, each with where it sits. Position is what turns a
// template's example row into a row: the rows the template drew are the shapes sharing a top edge,
// and the columns are their left edges.
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

// XML text is escaped, so a finding carrying an ampersand or a bracket has to be written the way the
// format reads it. Everything a run produces is somebody's prose and none of it is trusted to be
// markup-safe.
function escaped(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Replaces tokens inside one shape's runs. Returns the shape with what was put in it, so a fill that
// found nothing is visible to the caller rather than silently producing a slide with a hole in it.
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

// Replaces across a whole slide, wherever a token appears.
function fill(xml, mapping) {
  return filled(xml, mapping).body;
}

// A row the template drew once, repeated down the slide. The clone keeps every attribute of the
// original, which is what makes the copy look like the template rather than like this code's idea of
// the template, and only its vertical position and its identifier move.
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

  // After the last shape of the row it was cloned from, so document order still reads down the slide.
  const after = Math.max(...row.map((shape) => shape.to));
  return { xml: xml.slice(0, after) + copies + xml.slice(after), id: next };
}

// The highest shape identifier in use, so a clone never collides with one the template already drew.
function highest(xml) {
  return [...xml.matchAll(/<p:cNvPr id="(\d+)"/g)]
    .reduce((most, m) => Math.max(most, Number(m[1])), 0);
}

// Repeating the findings slide per category means adding a part, telling the package what kind of
// part it is, relating it to the presentation, and putting it in the slide order. Miss any one and
// the file opens with the slide missing rather than failing loudly, so all four move together.
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

  // Placed after the slide it follows, so the deck reads in the order a person expects rather than
  // gathering every repeated slide at the end.
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

// A slot the run had no data for is emptied rather than left saying {{ }}, because a token reaching a
// customer is the one failure a reader cannot explain away.
function blank(xml) {
  return xml.replace(/<a:t>([^<]*)<\/a:t>/g, (whole, text) =>
    (text.includes("{{") ? "<a:t></a:t>" : whole));
}

// The template explains itself to whoever fills it, in a note on each slide. A note is instructions
// for the author and never part of the pack, so it is taken out rather than left to be noticed.
function stripNotes(xml) {
  const all = shapes(xml);
  const measured = (shape) => {
    const found = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(shape.body);
    return found ? { width: Number(found[1]), height: Number(found[2]) } : { width: 0, height: 0 };
  };

  // A note is drawn as a panel with an accent bar and the words on top of them. Taking only the words
  // leaves an empty panel on the slide, which reads as a section the run had nothing to say about.
  const going = new Set();
  // A note, or the ellipsis a template draws to say "and so on" in an example table. Both are the
  // template talking to whoever fills it, and neither is part of what a run produced.
  const scaffolding = (one) => /^TEMPLATE\s/.test(one.text.trim()) || /^[.…]{1,3}$/.test(one.text.trim());

  for (const note of all.filter(scaffolding)) {
    going.add(note.from);
    for (const one of all) {
      if (one.text.trim() || going.has(one.from)) continue;
      const level = one.top < note.top + measured(note).height
        && one.top + measured(one).height > note.top;
      if (level && one.left <= note.left + measured(note).width
        && measured(one).height <= measured(note).height) going.add(one.from);
    }
  }

  let out = xml;
  for (const shape of all.filter((one) => going.has(one.from)).sort((a, b) => b.from - a.from)) {
    out = out.slice(0, shape.from) + out.slice(shape.to);
  }
  return out;
}

// Moves one shape to a new height, keeping everything else about it.
function moveTo(xml, shape, top) {
  const body = shape.body.replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (whole, x) =>
    `<a:off x="${x}" y="${Math.round(top)}"/>`);
  return xml.slice(0, shape.from) + body + xml.slice(shape.to);
}

// Applies a set of changes to a slide in one pass, from the end of the file backwards.
//
// **Use this rather than writing shapes one at a time.** Every shape's position is an offset into the
// slide's text, and writing one changes the length of what is there, so every offset after it moves.
// Written in any order but this, the second change lands a little off, the third lands further off,
// and a page of rows steps away from the boxes it belongs to. That defect has been introduced three
// separate times, each time by code that looked obviously correct, which is why the safe way is a
// function rather than a rule to remember.
//
// An edit is `{shape, body}`, and an empty body removes the shape.
function rewrite(xml, edits) {
  let out = xml;
  const seen = new Set();
  for (const one of [...edits].sort((a, b) => b.shape.from - a.shape.from)) {
    // One change per shape. Two would write the second against the first's offsets, which is the
    // same defect one shape further in.
    if (seen.has(one.shape.from)) {
      throw new Error(`two changes to one shape at ${one.shape.from}, which cannot both be written`);
    }
    seen.add(one.shape.from);
    out = out.slice(0, one.shape.from) + (one.body ?? "") + out.slice(one.shape.to);
  }
  return out;
}

function remaining(xml) {
  return [...xml.matchAll(/<a:t>([^<]*\{\{[^<]*)<\/a:t>/g)].map((m) => m[1]);
}

function save(deck) {
  return write(deck.entries);
}

module.exports = {
  open, shapes, fill, filled, cloneRow, highest, duplicateSlide,
  blank, remaining, stripNotes, moveTo, rewrite, save, escaped,
};
