"use strict";

const pptx = require("./pptx.js");
const { raised } = require("./errors.js");

const SLACK = 20_000;

function box(shape) {
  const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(shape.body);
  return {
    left: shape.left,
    top: shape.top,
    right: shape.left + (ext ? Number(ext[1]) : 0),
    bottom: shape.top + (ext ? Number(ext[2]) : 0),
  };
}

function over(a, b) {
  return a.left < b.right - SLACK && a.right > b.left + SLACK
    && a.top < b.bottom - SLACK && a.bottom > b.top + SLACK;
}

function slidesOf(file) {
  const presentation = file.entries.find((one) => one.name === "ppt/presentation.xml")
    .content.toString("utf8");
  const rels = file.entries.find((one) => one.name === "ppt/_rels/presentation.xml.rels")
    .content.toString("utf8");
  const target = new Map([...rels.matchAll(/Id="(rId\d+)"[^>]*Target="slides\/slide(\d+)\.xml"/g)]
    .map((m) => [m[1], Number(m[2])]));

  return [...(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/.exec(presentation)[1]
    .matchAll(/r:id="(rId\d+)"/g))]
    .map((m) => target.get(m[1]))
    .filter(Boolean)
    .map((number, at) => ({
      page: at + 1,
      xml: file.entries.find((one) => one.name === `ppt/slides/slide${number}.xml`)
        .content.toString("utf8"),
    }));
}

function faults(file, expected) {
  const found = [];

  for (const slide of slidesOf(file)) {
    const shapes = pptx.shapes(slide.xml);
    const written = shapes.filter((one) => one.text.trim());

    for (const one of pptx.remaining(slide.xml)) {
      found.push(`page ${slide.page}: an unfilled slot reads ${JSON.stringify(one.trim())}`);
    }

    for (let a = 0; a < written.length; a += 1) {
      for (let b = a + 1; b < written.length; b += 1) {
        if (!over(box(written[a]), box(written[b]))) continue;
        found.push(`page ${slide.page}: ${JSON.stringify(written[a].text.trim().slice(0, 40))} ` +
          `sits on ${JSON.stringify(written[b].text.trim().slice(0, 40))}`);
      }
    }

    for (const one of written) {
      const held = box(one);
      const size = Number(/<a:rPr[^>]*sz="(\d+)"/.exec(one.body)?.[1] ?? 1800) / 100;
      if (!size) continue;

      const lines = Math.max(1, Math.floor((held.bottom - held.top) / (size * 12700 * 1.25)));
      const across = Math.max(1, Math.floor((held.right - held.left) / (size * 12700 * 0.52)));
      const room = lines * across;
      if (one.text.trim().length > room * 1.35) {
        found.push(`page ${slide.page}: ${JSON.stringify(one.text.trim().slice(0, 40))} ` +
          `is ${one.text.trim().length} characters in a box that holds about ${room}`);
      }
    }

    for (const one of written) {
      if (box(one).bottom > 6_858_000) {
        found.push(`page ${slide.page}: ${JSON.stringify(one.text.trim().slice(0, 40))} ` +
          "runs off the bottom of the slide");
      }
    }
  }

  const scores = (expected.bars ?? []).map((one) => Number(one.score ?? 0));
  if (new Set(scores).size > 1) {
    const widths = new Set();
    for (const slide of slidesOf(file)) {
      for (const one of pptx.shapes(slide.xml)) {
        if (one.text.trim()) continue;
        const own = one.body.split("<a:ln")[0];
        if (!/<a:solidFill>/.test(own)) continue;
        const ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(one.body);
        if (!ext) continue;
        const width = Number(ext[1]);
        const height = Number(ext[2]);
        if (width > height * 3 && width < 4_500_000 && width > 200_000) widths.add(width);
      }
    }
    if (widths.size <= 1) {
      found.push("the score bars are all one length while the scores differ, so they say nothing");
    }
  }

  return found;
}

function assure(file, expected) {
  const found = faults(file, expected);
  if (found.length) {
    throw raised(`the pack is not fit to send:\n  ${found.join("\n  ")}`, null);
  }
}

module.exports = { assure, faults };
