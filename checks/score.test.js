// The hardness score, counted from a concern's items: the same items give the same score however the
// reading words or splits its findings.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { hardness } = require("../bin/evalation-score");

const rubric = {
  id: "evalation.rubric.v1", pack: "hardening",
  defect_load: { critical: 25, high: 10, medium: 4, low: 1.5, info: 0 },
  base: { decay: 95 }, credit: { alpha: 0.25, softener: 8 },
  weights: { SEC: 1, ARCH: 3 }, grades: { A: 90, B: 75, C: 60, D: 40, F: 0 },
};

function run(findings) {
  return {
    packs: [{ pack: "hardening", entries_asked: [
      { identifier: "SEC01", looks_for: [{ severity: "critical" }, { severity: "high" }, { severity: "medium" }] },
      { identifier: "ARCH01" },
    ] }],
    accounted: [
      { pack: "hardening", concern: "SEC01", looked_for: [{ result: "found" }, { result: "missing" }, { result: "does-not-apply" }] },
      { pack: "hardening", concern: "ARCH01" },
    ],
    findings: [
      { pack: "hardening", concern: "ARCH01", severity: "medium" },
      ...findings,
    ],
  };
}

const bar = (scored, category) => scored.bars.find((one) => one.category === category).score;

test("a missing item costs its severity, a found one counts for it, one not applying counts for nothing", () => {
  const scored = hardness(run([]), rubric);
  // One high missing and one strength: 100 * e^(-10/95), plus a quarter of what was lost times 1/9.
  assert.strictEqual(bar(scored, "SEC"), Math.round(100 * Math.exp(-10 / 95) + (100 - 100 * Math.exp(-10 / 95)) * 0.25 * (1 / 9)));
});

test("findings on an itemised concern never move the score", () => {
  const plain = hardness(run([]), rubric);
  const split = hardness(run([
    { pack: "hardening", concern: "SEC01", severity: "critical" },
    { pack: "hardening", concern: "SEC01", severity: "critical" },
  ]), rubric);
  assert.deepStrictEqual(split, plain);
});

test("a concern with no list is still counted from its findings", () => {
  const more = hardness(run([{ pack: "hardening", concern: "ARCH01", severity: "high" }]), rubric);
  assert.ok(bar(more, "ARCH") < bar(hardness(run([]), rubric), "ARCH"));
});
