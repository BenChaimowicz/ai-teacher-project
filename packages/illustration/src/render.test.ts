import assert from "node:assert/strict";
import { test } from "node:test";
import { isUnsafeSvg, sha256Of } from "@senoy/media";
import { readFixture as fixture } from "./fixtures.ts";
import { renderScenePlan } from "./render.ts";
import type { ScenePlan } from "./scene-plan.ts";
import { CANVAS, grainTilePng } from "./style.ts";

/**
 * The width and height a PNG's header declares.
 * @param png - The PNG's bytes
 */
function pngSize(png: Uint8Array): { width: number; height: number } {
  assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "It is a PNG.");
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

test("a scene plan renders to the same PNG every time", async () => {
  const plan = await fixture("yggdrasil");
  const first = renderScenePlan(plan);
  const second = renderScenePlan(structuredClone(plan));
  assert.equal(sha256Of(first.png), sha256Of(second.png));
  assert.equal(first.svg, second.svg);
  assert.deepEqual(pngSize(first.png), { width: CANVAS.width, height: CANVAS.height });
});

test("the SVG a scene renders to is safe to host, and its labels all found a spot", async () => {
  for (const name of ["yggdrasil", "gram"]) {
    const { svg, labels } = renderScenePlan(await fixture(name));
    assert.equal(isUnsafeSvg(Buffer.from(svg)), false, name);
    assert.ok(labels.every((label) => !label.crowded), `${name}: no label was crowded out`);
  }
});

test("an invalid plan is refused before anything is drawn", () => {
  const plan = { title: null, items: [{ type: "disc", x: 5000, y: 5, number: 1, colour: "red" }], labels: [] } as unknown as ScenePlan;
  assert.throws(() => renderScenePlan(plan), /\[render\.ts: renderScenePlan\] The scene plan cannot be drawn \|\| failures=1 \|\| plan\.items\[0\] \(disc\) centre must lie on the sheet/);
});

test("every block kind draws, and Jongi is a marked placeholder until the Blender poses exist", () => {
  const plan: ScenePlan = {
    title: "Every block",
    items: [
      { type: "shape", shape: "band", box: { x: 44, y: 600, w: 1112, h: 160 }, colour: "plum", depth: "low" },
      { type: "shape", shape: "rect", box: { x: 60, y: 60, w: 100, h: 60 }, colour: "cream", depth: "flat" },
      { type: "shape", shape: "rounded", box: { x: 180, y: 60, w: 100, h: 60 }, colour: "apricot", depth: "raised" },
      { type: "shape", shape: "ellipse", box: { x: 300, y: 60, w: 100, h: 60 }, colour: "gold", depth: "low" },
      { type: "shape", shape: "triangle", box: { x: 420, y: 60, w: 100, h: 60 }, colour: "red", depth: "low" },
      { type: "shape", shape: "blob", box: { x: 540, y: 60, w: 100, h: 60 }, colour: "leaf", depth: "low" },
      { type: "cutout", points: [{ x: 700, y: 60 }, { x: 760, y: 120 }, { x: 640, y: 120 }], colour: "violet", depth: "raised" },
      { type: "limb", knots: [{ x: 800, y: 60, width: 30 }, { x: 900, y: 100, width: 12 }, { x: 1000, y: 70, width: 4 }], colour: "wood", depth: "low" },
      { type: "foliage", box: { x: 60, y: 160, w: 200, h: 120 }, colour: "leaf", shade: "leaf-dark" },
      { type: "tree", box: { x: 300, y: 150, w: 260, h: 400 }, roots: 1, crown: "narrow", leaves: "leaf-light", wood: "wood-dark" },
      { type: "tree", box: { x: 580, y: 150, w: 260, h: 400 }, roots: 6, crown: "round", leaves: "leaf", wood: "wood" },
      { type: "figure", x: 900, y: 400, height: 140, clothes: "cream", hair: "wood-dark", skin: "skin-deep" },
      { type: "creature", kind: "bird", box: { x: 880, y: 150, w: 200, h: 80 }, colour: "wood", accent: "gold", facing: "left" },
      { type: "creature", kind: "serpent", box: { x: 880, y: 440, w: 260, h: 126 }, colour: "red", accent: "gold", facing: "right" },
      { type: "creature", kind: "squirrel", box: { x: 1000, y: 300, w: 72, h: 82 }, colour: "apricot", accent: "apricot-deep", facing: "right" },
      { type: "object", kind: "bottle", box: { x: 60, y: 300, w: 80, h: 154 }, colour: "clear", label: "EtOH" },
      { type: "object", kind: "bottle", box: { x: 150, y: 300, w: 80, h: 154 }, colour: "safranin", label: null },
      { type: "object", kind: "drop", box: { x: 240, y: 300, w: 22, h: 35 }, colour: "violet", label: null },
      { type: "object", kind: "slide", box: { x: 60, y: 480, w: 210, h: 48 }, colour: "glass", label: null },
      { type: "object", kind: "well", box: { x: 60, y: 640, w: 140, h: 66 }, colour: "water", label: null },
      { type: "cells", form: "cocci", box: { x: 100, y: 490, w: 60, h: 30 }, colour: "violet", count: 9 },
      { type: "cells", form: "rods", box: { x: 180, y: 490, w: 60, h: 30 }, colour: "safranin", count: 5 },
      { type: "disc", x: 300, y: 620, number: 7, colour: "red" },
      { type: "arrow", from: { x: 340, y: 620 }, to: { x: 440, y: 650 }, colour: "gold" },
      { type: "text", x: 600, y: 620, text: "Some text", size: "large", colour: "text", align: "middle" },
      { type: "panel", box: { x: 700, y: 600, w: 300, h: 120 }, colour: "plum", title: "A panel" },
      { type: "jongi", pose: "sign", x: 1100, y: 740, height: 140, facing: "left", signText: "Hi!" },
    ],
    labels: [{ text: "a bird", target: { x: 980, y: 190 }, side: null }],
  };
  const { svg, png } = renderScenePlan(plan);
  assert.equal(isUnsafeSvg(Buffer.from(svg)), false);
  assert.match(svg, />placeholder</, "Jongi is marked as a placeholder");
  assert.match(svg, />Hi!</, "the sign text is drawn");
  assert.deepEqual(pngSize(png), { width: CANVAS.width, height: CANVAS.height });
});

test("text in a plan is escaped, never markup", () => {
  const plan: ScenePlan = {
    title: '<script>alert("x")</script>',
    items: [{ type: "text", x: 600, y: 400, text: "a & b < c", size: "medium", colour: "text", align: "middle" }],
    labels: [{ text: "<image href=\"//evil\"/>", target: { x: 600, y: 500 }, side: null }],
  };
  const { svg } = renderScenePlan(plan);
  assert.equal(isUnsafeSvg(Buffer.from(svg)), false);
  assert.doesNotMatch(svg, /<script/);
  assert.match(svg, /a &amp; b &lt; c/);
});

test("the grain is drawn once and reused, and a warm render stays fast", async () => {
  const plan = await fixture("yggdrasil");
  const first = renderScenePlan(plan);
  assert.equal(grainTilePng(), grainTilePng(), "the tile is one cached string");
  assert.doesNotMatch(first.svg, /feTurbulence/, "no scene draws its own grain");
  assert.equal((first.svg.match(/<image /g) ?? []).length, 1, "the tile is the only image in a scene");
  const start = performance.now();
  renderScenePlan(plan);
  const took = performance.now() - start;
  // About a second on a laptop (`pnpm --filter @senoy/illustration fixtures` prints the real number); the ceiling
  // only catches a render that has stopped reusing the grain or filters every piece twice.
  assert.ok(took < 5000, `A warm render took ${took.toFixed(0)} ms.`);
});
