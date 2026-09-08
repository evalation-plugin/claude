// slides - the deck template drawn as a page, so the board pack prints rather than opens in an editor.
//
// The pack is delivered as a PDF: a document a reader can check and hand on, and cannot quietly edit
// into something the run never said. So the template is never what ships. It stays the design file,
// and this reads the geometry out of it.
//
// **Nothing here decides how anything looks.** Every position, size, colour, font and weight is read
// from the template's own drawing and written out at the same measurement. A rebrand is still a
// template edit, and this file changes only when the format gains an element the template starts
// using. That is what makes the transcription mechanical rather than a redesign, which is the whole
// reason it is safe to change the delivery format at all.
//
// Measurements are English Metric Units, 914400 to the inch, and a page is laid out at 96 to the inch
// because that is what a browser calls an inch. Font sizes are hundredths of a point and are written
// as points, so they never pass through that conversion and cannot drift by a rounding.
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const EMU_PER_INCH = 914400;
const PX_PER_INCH = 96;

const FONTS = [
  ["Hanken Grotesk", "HankenGrotesk-Regular.ttf", 400],
  ["Hanken Grotesk", "HankenGrotesk-Bold.ttf", 700],
  ["JetBrains Mono", "JetBrainsMono-Regular.ttf", 400],
  ["JetBrains Mono", "JetBrainsMono-Bold.ttf", 700],
];

const MEDIA = { png: "image/png", jpeg: "image/jpeg", jpg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };

function px(emu) {
  return (Number(emu) / EMU_PER_INCH) * PX_PER_INCH;
}

function attribute(xml, name) {
  return new RegExp(`${name}="([^"]*)"`).exec(xml)?.[1];
}

// The first element of a kind, with its content. Slide XML nests shallowly here, so finding the
// opening tag and its match is enough and a parser would buy nothing.
function element(xml, tag) {
  const open = new RegExp(`<${tag}(\\s[^>]*)?(/)?>`).exec(xml);
  if (!open) return null;
  if (open[2]) return { attributes: open[1] ?? "", body: "" };
  const from = open.index + open[0].length;
  const to = xml.indexOf(`</${tag}>`, from);
  return { attributes: open[1] ?? "", body: to < 0 ? "" : xml.slice(from, to) };
}

function colour(xml) {
  if (!xml) return null;
  const value = element(xml, "a:srgbClr");
  return value ? `#${attribute(value.attributes, "val")}` : null;
}

function escaped(text) {
  return String(text ?? "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const ALIGN = { l: "left", ctr: "center", r: "right", just: "justify" };
const ANCHOR = { t: "flex-start", ctr: "center", b: "flex-end" };

// One text body: its paragraphs, and the runs inside each. A run carries its own size, weight and
// colour in the template, so none of that is defaulted here.
function text(body) {
  const properties = element(body, "a:bodyPr");
  const anchor = ANCHOR[attribute(properties?.attributes ?? "", "anchor")] ?? "flex-start";
  const inset = (name, fallback) => {
    const value = attribute(properties?.attributes ?? "", name);
    return px(value === undefined ? fallback : value);
  };

  const paragraphs = [];
  for (const match of body.matchAll(/<a:p>([\s\S]*?)<\/a:p>/g)) {
    const one = match[1];
    const align = ALIGN[attribute(element(one, "a:pPr")?.attributes ?? "", "algn")] ?? "left";
    const spacing = /<a:lnSpc><a:spcPct val="(\d+)"\/><\/a:lnSpc>/.exec(one);

    // Space a paragraph asks for before and after itself, in hundredths of a point. Ignoring it runs
    // a heading straight into the body under it, which is the template's spacing being dropped rather
    // than a layout decision anybody made.
    const before = /<a:spcBef><a:spcPts val="(\d+)"\/><\/a:spcBef>/.exec(one);
    const after = /<a:spcAft><a:spcPts val="(\d+)"\/><\/a:spcAft>/.exec(one);
    const gaps = [
      before ? `margin-top:${Number(before[1]) / 100}pt` : "",
      after ? `margin-bottom:${Number(after[1]) / 100}pt` : "",
    ].filter(Boolean).join(";");

    const runs = [];
    for (const run of one.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
      const properties = element(run[1], "a:rPr");
      const attributes = properties?.attributes ?? "";
      const size = attribute(attributes, "sz");
      const face = attribute(run[1], "typeface");
      const fill = colour(element(run[1], "a:solidFill")?.body);
      const spaced = attribute(attributes, "spc");
      const style = [
        size ? `font-size:${Number(size) / 100}pt` : "",
        attribute(attributes, "b") === "1" ? "font-weight:700" : "font-weight:400",
        attribute(attributes, "i") === "1" ? "font-style:italic" : "",
        fill ? `color:${fill}` : "",
        face ? `font-family:'${face}'` : "",
        spaced ? `letter-spacing:${Number(spaced) / 100}pt` : "",
      ].filter(Boolean).join(";");
      const value = [...run[1].matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1]).join("");
      runs.push(`<span style="${style}">${escaped(value)}</span>`);
    }

    // A paragraph with no run is the template's own blank line and holds the space it drew.
    // A percentage here is a multiple of single spacing, not of the font size, and single spacing is
    // about 1.2 times the size. Written straight out as a CSS percentage it clamps the line box to the
    // glyphs, so a heading's ascenders climb out of the top of their own box and over the rule above.
    paragraphs.push(
      `<p style="text-align:${align}` +
      `${spacing ? `;line-height:${((Number(spacing[1]) / 100000) * 1.2).toFixed(3)}` : ";line-height:1.2"}` +
      `${gaps ? `;${gaps}` : ""}">` +
      `${runs.join("") || "&#8203;"}</p>`,
    );
  }

  // A body holding no words is not a text box. Treated as one it takes the text insets, and a shape
  // narrower than its own padding is forced open to fit it: a three-pixel accent bar drew as a
  // nineteen-pixel slab, on every slide that has one.
  if (!paragraphs.length || !/<a:t>[^<]/.test(body)) return null;
  return {
    anchor,
    padding: `${inset("tIns", 45720)}px ${inset("rIns", 91440)}px ` +
      `${inset("bIns", 45720)}px ${inset("lIns", 91440)}px`,
    html: paragraphs.join(""),
  };
}

// The media a slide names, resolved through its own relationships, and written into the page rather
// than referenced, so the PDF carries everything it draws.
function pictures(entries, number) {
  const rels = entries.find((one) => one.name === `ppt/slides/_rels/slide${number}.xml.rels`);
  if (!rels) return new Map();
  return new Map([...rels.content.toString("utf8")
    .matchAll(/Id="(rId\d+)"[^>]*Target="\.\.\/(media\/[^"]+)"/g)]
    .map(([, id, target]) => {
      const media = entries.find((one) => one.name === `ppt/${target}`);
      const kind = MEDIA[target.split(".").pop().toLowerCase()] ?? "application/octet-stream";
      return [id, media ? `data:${kind};base64,${media.content.toString("base64")}` : ""];
    }));
}

function shape(xml, media) {
  const frame = element(xml, "a:xfrm");
  if (!frame) return "";
  const off = element(frame.body, "a:off");
  const ext = element(frame.body, "a:ext");
  if (!off || !ext) return "";

  const box = [
    `left:${px(attribute(off.attributes, "x"))}px`,
    `top:${px(attribute(off.attributes, "y"))}px`,
    `width:${px(attribute(ext.attributes, "cx"))}px`,
    `height:${px(attribute(ext.attributes, "cy"))}px`,
  ];

  const embed = /r:embed="(rId\d+)"/.exec(xml);
  if (embed) {
    const source = media.get(embed[1]) ?? "";
    return `<img style="position:absolute;${box.join(";")};object-fit:contain" src="${source}">`;
  }

  // A shape's own fill is what sits before its outline in the drawing properties. Reading the whole
  // block instead finds the outline's colour and paints the shape with it, which turns a table's
  // border into a panel over every row inside it.
  const properties = element(xml, "p:spPr");
  const body = properties?.body ?? "";
  const outlineAt = body.indexOf("<a:ln");
  const own = outlineAt < 0 ? body : body.slice(0, outlineAt);
  const fill = /<a:noFill\/>/.test(own) ? null : colour(element(own, "a:solidFill")?.body);

  const outline = outlineAt < 0 ? null : element(body.slice(outlineAt), "a:ln");
  const stroke = outline && !/<a:noFill\/>/.test(outline.body)
    ? colour(element(outline.body, "a:solidFill")?.body)
    : null;
  const weight = Number(attribute(outline?.attributes ?? "", "w") ?? 12700);
  const round = /prst="ellipse"/.test(xml) ? ";border-radius:50%" : "";

  const written = element(xml, "p:txBody") ? text(element(xml, "p:txBody").body) : null;

  const style = `position:absolute;${box.join(";")}` +
    `${fill ? `;background:${fill}` : ""}` +
    `${stroke ? `;border:${px(weight)}px solid ${stroke}` : ""}${round}` +
    (written
      ? `;display:flex;flex-direction:column;justify-content:${written.anchor};padding:${written.padding}`
      : "");

  return `<div style="${style}">${written ? written.html : ""}</div>`;
}

// One slide, drawn in the order the template holds its shapes, which is what puts the ground behind
// the writing rather than over it.
function slide(xml, entries, number) {
  const media = pictures(entries, number);
  const drawn = [];
  let at = 0;
  for (;;) {
    const found = /<p:(sp|pic)>/.exec(xml.slice(at));
    if (!found) break;
    const from = at + found.index;
    const close = `</p:${found[1]}>`;
    const to = xml.indexOf(close, from);
    if (to < 0) break;
    drawn.push(shape(xml.slice(from, to + close.length), media));
    at = to + close.length;
  }
  return `<section class="slide">${drawn.join("")}</section>`;
}

function faces(assets) {
  return FONTS.map(([family, file, weight]) => {
    const data = readFileSync(join(assets, "fonts", file)).toString("base64");
    return `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;` +
      `src:url(data:font/ttf;base64,${data}) format('truetype')}`;
  }).join("");
}

// The page the slides print onto. Zero margin with the slide at the full page size is what makes the
// ground reach the paper edge, and exact colour adjustment is what keeps it dark when it prints.
function page(slides, size, assets) {
  const width = px(size.width);
  const height = px(size.height);
  return `<!doctype html><meta charset="utf-8"><style>
${faces(assets)}
@page{size:${width / PX_PER_INCH}in ${height / PX_PER_INCH}in;margin:0}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#070C18}
body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{position:relative;width:${width}px;height:${height}px;overflow:hidden;
  background:#070C18;page-break-after:always;break-after:page}
.slide:last-child{page-break-after:auto;break-after:auto}
.slide p{margin:0;font-family:'Hanken Grotesk',system-ui,sans-serif;color:#EAF0FB}
.slide img{display:block}
</style>${slides.join("")}`;
}

function render(file, assets) {
  const presentation = file.entries.find((one) => one.name === "ppt/presentation.xml")
    .content.toString("utf8");
  const measured = /<p:sldSz[^>]*\/>/.exec(presentation)[0];
  const size = {
    width: attribute(measured, "cx"),
    height: attribute(measured, "cy"),
  };

  // The order the presentation holds, never the order the parts happen to sit in the archive, since
  // repeating a slide appends a part and the reading order is the list rather than the archive.
  const rels = file.entries.find((one) => one.name === "ppt/_rels/presentation.xml.rels")
    .content.toString("utf8");
  const target = new Map([...rels.matchAll(/Id="(rId\d+)"[^>]*Target="slides\/slide(\d+)\.xml"/g)]
    .map((m) => [m[1], Number(m[2])]));

  const order = [...(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(presentation)[1]
    .matchAll(/r:id="(rId\d+)"/g))].map((m) => target.get(m[1])).filter(Boolean);

  const drawn = order.map((number) => {
    const part = file.entries.find((one) => one.name === `ppt/slides/slide${number}.xml`);
    return slide(part.content.toString("utf8"), file.entries, number);
  });

  return page(drawn, size, assets);
}

module.exports = { render, px };
