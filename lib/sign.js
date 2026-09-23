"use strict";
// sign - a printed report becomes a signed one, so an edit made after it left shows as one.
//
// The signature is added the way the PDF standard adds one to an existing file: an incremental update
// appended after the printed bytes, holding a signature field, the form that lists it, and new
// versions of the catalog and the first page that point at them. Nothing already printed is rewritten.
//
// The signature certifies the document with no changes allowed, so a reader that checks signatures
// reports any later edit as invalidating it. What is sent to the server is the SHA-256 digest of the
// signed byte ranges and the run's name, and nothing of the document.
//
// It reads the classic cross-reference table the printing browser writes. A file holding a
// cross-reference stream is refused rather than guessed at.

const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");

// Room for the signature: one P-256 signature and one certificate come to under two kilobytes, and a
// certificate chain from a certificate authority to under six.
const ROOM = 8192;

function refuse(reason) {
  throw new Error(reason);
}

/** The last trailer and where the table it closes begins. */
function lastTrailer(text) {
  const at = text.lastIndexOf("startxref");
  if (at < 0) refuse("the file has no cross-reference table to add to");
  const offset = Number(text.slice(at + 9).trim().split(/\s+/)[0]);
  if (!text.startsWith("xref", offset)) refuse("the file keeps its cross-references in a stream, which this does not add to");
  const trailerAt = text.indexOf("trailer", offset);
  const trailer = text.slice(trailerAt, at);
  const read = (name) => trailer.match(new RegExp(`/${name}\\s+(\\d+)\\s+0\\s+R`))?.[1];
  return { offset, size: Number(trailer.match(/\/Size\s+(\d+)/)?.[1]), root: read("Root"), info: read("Info") };
}

/** Every object's offset, from every table in the file, the newest winning. */
function offsets(text) {
  const held = new Map();
  let at = lastTrailer(text).offset;
  const seen = new Set();
  while (at && !seen.has(at)) {
    seen.add(at);
    let cursor = at + 4;
    const tail = text.indexOf("trailer", at);
    const rows = text.slice(cursor, tail).split(/\r?\n/).map((one) => one.trim()).filter(Boolean);
    let number = 0;
    for (const row of rows) {
      const parts = row.split(/\s+/);
      if (parts.length === 2) {
        number = Number(parts[0]);
        continue;
      }
      if (parts[2] === "n" && !held.has(number)) held.set(number, Number(parts[0]));
      number += 1;
    }
    const prev = text.slice(tail, text.indexOf("startxref", tail)).match(/\/Prev\s+(\d+)/)?.[1];
    at = prev ? Number(prev) : 0;
  }
  return held;
}

/** An object's dictionary, as text, from its offset. */
function objectAt(text, table, number) {
  const at = table.get(Number(number));
  if (at === undefined) refuse(`object ${number} is not in the cross-reference table`);
  const start = text.indexOf("<<", at);
  const end = text.indexOf("endobj", at);
  const body = text.slice(start, end).replace(/\s*$/, "");
  if (/\bstream\b/.test(body)) refuse(`object ${number} carries a stream, which this does not rewrite`);
  return body;
}

/** The first page, down through the page tree. */
function firstPage(text, table, catalog) {
  let number = catalog.match(/\/Pages\s+(\d+)\s+0\s+R/)?.[1];
  for (let depth = 0; number && depth < 32; depth += 1) {
    const node = objectAt(text, table, number);
    if (/\/Type\s*\/Page\b(?!s)/.test(node)) return { number, body: node };
    number = node.match(/\/Kids\s*\[\s*(\d+)\s+0\s+R/)?.[1];
  }
  refuse("the page tree names no first page");
}

/** A dictionary with entries added before its closing brackets. */
function adding(dictionary, entries) {
  const end = dictionary.lastIndexOf(">>");
  return `${dictionary.slice(0, end)}${entries}\n>>`;
}

function pdfDate(when) {
  const two = (n) => String(n).padStart(2, "0");
  return `D:${when.getUTCFullYear()}${two(when.getUTCMonth() + 1)}${two(when.getUTCDate())}` +
    `${two(when.getUTCHours())}${two(when.getUTCMinutes())}${two(when.getUTCSeconds())}Z`;
}

/**
 * The file with a signature field appended and its contents left empty, and where the byte range and
 * the contents sit in it.
 */
function prepared(original) {
  const text = original.toString("latin1");
  const trailer = lastTrailer(text);
  const table = offsets(text);
  const catalog = objectAt(text, table, trailer.root);
  if (/\/AcroForm\b/.test(catalog) || /\/Perms\b/.test(catalog)) refuse("the file already carries a form or permissions");
  const page = firstPage(text, table, catalog);

  const signature = trailer.size;
  const widget = trailer.size + 1;
  const form = trailer.size + 2;

  let pageBody;
  const annots = page.body.match(/\/Annots\s*\[([^\]]*)\]/);
  if (annots) pageBody = page.body.replace(annots[0], `/Annots [${annots[1]} ${widget} 0 R]`);
  else if (/\/Annots\s+\d+\s+0\s+R/.test(page.body)) refuse("the first page keeps its annotations in an object of their own");
  else pageBody = adding(page.body, `\n/Annots [${widget} 0 R]`);

  const placeholder = "0".repeat(ROOM * 2);
  const range = "/ByteRange [0 ********** ********** **********]";
  const objects = [
    [signature, `<<\n/Type /Sig\n/Filter /Adobe.PPKLite\n/SubFilter /ETSI.CAdES.detached\n${range}\n` +
      `/Contents <${placeholder}>\n/M (${pdfDate(new Date())})\n/Name (Evalation)\n` +
      "/Reason (Issued by Evalation. Any change after signing invalidates this signature.)\n" +
      "/Reference [<< /Type /SigRef /TransformMethod /DocMDP /TransformParams << /Type /TransformParams /P 1 /V /1.2 >> >>]\n>>"],
    [widget, `<<\n/Type /Annot\n/Subtype /Widget\n/FT /Sig\n/T (Evalation signature)\n/V ${signature} 0 R\n` +
      `/F 132\n/Rect [0 0 0 0]\n/P ${page.number} 0 R\n>>`],
    [form, `<<\n/Fields [${widget} 0 R]\n/SigFlags 3\n>>`],
    [Number(trailer.root), adding(catalog, `\n/AcroForm ${form} 0 R\n/Perms << /DocMDP ${signature} 0 R >>`)],
    [Number(page.number), pageBody],
  ];

  let update = original[original.length - 1] === 0x0a ? "" : "\n";
  const start = original.length;
  const written = [];
  for (const [number, body] of objects) {
    written.push([number, start + Buffer.byteLength(update, "latin1")]);
    update += `${number} 0 obj\n${body}\nendobj\n`;
  }
  const xrefAt = start + Buffer.byteLength(update, "latin1");
  update += "xref\n0 1\n0000000000 65535 f\r\n";
  for (const [number, at] of written.sort((a, b) => a[0] - b[0])) {
    update += `${number} 1\n${String(at).padStart(10, "0")} 00000 n\r\n`;
  }
  update += `trailer\n<<\n/Size ${trailer.size + 3}\n/Root ${trailer.root} 0 R\n` +
    `${trailer.info ? `/Info ${trailer.info} 0 R\n` : ""}/Prev ${trailer.offset}\n>>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const whole = Buffer.concat([original, Buffer.from(update, "latin1")]);
  const asText = whole.toString("latin1");
  const contents = asText.indexOf(`/Contents <${placeholder}>`, start) + "/Contents ".length;
  const after = contents + placeholder.length + 2;
  const numbers = [0, contents, after, whole.length - after].map((one) => String(one));
  const filled = `/ByteRange [${numbers.join(" ")}]`.padEnd(range.length, " ");
  if (filled.length !== range.length) refuse("the byte range does not fit its placeholder");
  const rangeAt = asText.indexOf(range, start);
  whole.write(filled, rangeAt, "latin1");
  return { whole, contents, after };
}

/** The digest the signature covers: every byte but the empty contents. */
function digestOf(prepared) {
  return createHash("sha256")
    .update(prepared.whole.subarray(0, prepared.contents))
    .update(prepared.whole.subarray(prepared.after))
    .digest("hex");
}

/**
 * Signs a printed PDF in place. `ask(digest)` returns the DER signature as a Buffer. Throws with the
 * reason where it cannot, leaving the file as it was printed.
 */
function signPdf(file, ask) {
  const original = readFileSync(file);
  const ready = prepared(original);
  const signature = ask(digestOf(ready));
  const hex = Buffer.from(signature).toString("hex");
  if (hex.length > ROOM * 2) refuse(`the signature is ${hex.length / 2} bytes, past the ${ROOM} left for it`);
  ready.whole.write(hex.padEnd(ROOM * 2, "0"), ready.contents + 1, "latin1");
  writeFileSync(file, ready.whole);
}

/**
 * Reads a signed PDF back: the digest of its signed ranges, and whether anything was added after
 * them. Null where the file carries no signature.
 */
function signedRanges(file) {
  const whole = readFileSync(file);
  const text = whole.toString("latin1");
  const found = [...text.matchAll(/\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g)].pop();
  if (!found) return null;
  const [, a, b, c, d] = found.map(Number);
  const digest = createHash("sha256")
    .update(whole.subarray(a, a + b))
    .update(whole.subarray(c, c + d))
    .digest("hex");
  return { digest, appended: whole.length - (c + d) };
}

module.exports = { signPdf, signedRanges, digestOf, prepared };
