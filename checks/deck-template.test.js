"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const { existsSync, statSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");
const DESIGN = join(ROOT, "reporting", "assets", "review-deck-template");
const tracked = () => execFileSync("git", ["-C", ROOT, "ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);

test("the review deck's design ships as text and image files, and no PowerPoint file ships", () => {
  assert.deepStrictEqual(tracked().filter((one) => /\.(pptx|potx|ppt|bin)$/i.test(one)), []);
  for (const part of ["[Content_Types].xml", "ppt/presentation.xml", "ppt/_rels/presentation.xml.rels", "ppt/slides/slide1.xml", "ppt/media/image1.png"]) {
    assert.ok(existsSync(join(DESIGN, part)), `${part} ships with the design`);
  }
  const inside = tracked().filter((one) => one.startsWith("reporting/assets/review-deck-template/"));
  assert.ok(inside.every((one) => /\.(xml|rels|png)$/.test(one)), inside.filter((one) => !/\.(xml|rels|png)$/.test(one)).join(", "));
  assert.ok(inside.filter((one) => !one.endsWith(".png")).every((one) => statSync(join(ROOT, one)).size < 256 * 1024));
});

test("the deck opens its design from the folder, slide by slide in order", () => {
  const pptx = require("../lib/pptx.js");
  const file = pptx.openFolder(DESIGN);
  assert.deepStrictEqual(file.slides.map((one) => one.number), Array.from({ length: file.slides.length }, (_, at) => at + 1));
  assert.ok(file.slides.length >= 11);
  assert.match(file.slides[0].xml, /<p:sld\b/);
});
