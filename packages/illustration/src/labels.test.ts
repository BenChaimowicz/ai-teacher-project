import assert from "node:assert/strict";
import { test } from "node:test";
import { rng } from "./geometry.ts";
import { placeLabels, type PlacedLabel, type Rect } from "./labels.ts";
import { SHEET, type SceneLabel } from "./scene-plan.ts";

/**
 * Whether two rectangles share any area.
 * @param a - One rectangle
 * @param b - The other
 */
function overlaps(a: Rect, b: Rect): boolean {
  return Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);
}

/**
 * Asserts the hard rules on a placement: inside the sheet, not over its own target, not over any other tag.
 * @param placed - What the placer returned
 * @param what - Names the scenario in a failure
 */
function assertWellPlaced(placed: PlacedLabel[], what: string): void {
  placed.forEach((tag, i) => {
    const { rect, target } = tag;
    assert.ok(rect.x0 >= SHEET.x0 && rect.y0 >= SHEET.y0 && rect.x1 <= SHEET.x1 && rect.y1 <= SHEET.y1, `${what}: tag ${i} "${tag.text}" stays on the sheet.`);
    assert.ok(!(target.x >= rect.x0 && target.x <= rect.x1 && target.y >= rect.y0 && target.y <= rect.y1), `${what}: tag ${i} does not cover its target.`);
    for (let j = 0; j < i; j++) assert.ok(!overlaps(rect, placed[j].rect), `${what}: tags ${j} and ${i} do not overlap.`);
    assert.equal(tag.crowded, false, `${what}: tag ${i} found a spot obeying every rule.`);
  });
}

test("tags at random targets never overlap each other, cover their targets or leave the sheet", () => {
  for (let seed = 1; seed <= 25; seed++) {
    const r = rng(seed);
    const sides = ["left", "right", "above", "below", null] as const;
    const labels: SceneLabel[] = Array.from({ length: 14 }, (_, i) => ({
      text: i % 3 === 0 ? "a much longer label than most" : `label ${i}`,
      target: { x: SHEET.x0 + r() * (SHEET.x1 - SHEET.x0), y: SHEET.y0 + r() * (SHEET.y1 - SHEET.y0) },
      side: sides[Math.floor(r() * sides.length)],
    }));
    assertWellPlaced(placeLabels(labels, [], SHEET), `seed ${seed}`);
  }
});

test("sixteen tags on one target still do not overlap", () => {
  const labels: SceneLabel[] = Array.from({ length: 16 }, (_, i) => ({ text: `the thing ${i}`, target: { x: 600, y: 400 }, side: null }));
  assertWellPlaced(placeLabels(labels, [], SHEET), "one target");
});

test("a target in a corner still gets a tag on the sheet", () => {
  const placed = placeLabels([{ text: "corner", target: { x: SHEET.x1 - 2, y: SHEET.y1 - 2 }, side: "below" }], [], SHEET);
  assertWellPlaced(placed, "corner");
  assert.ok(placed[0].rect.x1 < SHEET.x1 - 2 || placed[0].rect.y1 < SHEET.y1 - 2);
});

test("a free preferred side is honoured and the pointer leaves the nearest edge", () => {
  const target = { x: 600, y: 400 };
  const [right] = placeLabels([{ text: "right", target, side: "right" }], [], SHEET);
  assert.ok(right.rect.x0 > target.x, "right of the target");
  assert.ok(Math.abs(right.rect.y0 + (right.rect.y1 - right.rect.y0) / 2 - target.y) < 1, "level with the target");
  assert.ok(Math.abs(right.anchor.x - right.rect.x0) < 0.01, "the pointer leaves the left edge");
  const [above] = placeLabels([{ text: "above", target, side: "above" }], [], SHEET);
  assert.ok(above.rect.y1 < target.y, "above the target");
  assert.ok(Math.abs(above.anchor.y - above.rect.y1) < 0.01, "the pointer leaves the bottom edge");
  const [left] = placeLabels([{ text: "left", target, side: "left" }], [], SHEET);
  assert.ok(left.rect.x1 < target.x);
  const [below] = placeLabels([{ text: "below", target, side: "below" }], [], SHEET);
  assert.ok(below.rect.y0 > target.y);
});

test("a tag steps aside for a small block rather than hide it, and sits closer when nothing is in the way", () => {
  const target = { x: 600, y: 400 };
  const caption: Rect = { x0: 540, y0: 428, x1: 660, y1: 448 };
  const [clear] = placeLabels([{ text: "a tag", target, side: "below" }], [], SHEET);
  const [stepped] = placeLabels([{ text: "a tag", target, side: "below" }], [caption], SHEET);
  assert.ok(overlaps(clear.rect, caption), "with nothing in the way the tag sits where the caption would be");
  assert.ok(!overlaps(stepped.rect, caption), "with the caption there the tag does not cover it");
  assert.equal(stepped.crowded, false);
});

test("a later tag does not sit across an earlier tag's pointer when it can help it", () => {
  const placed = placeLabels([
    { text: "first", target: { x: 600, y: 400 }, side: "right" },
    { text: "second", target: { x: 700, y: 400 }, side: "left" },
  ], [], SHEET);
  assertWellPlaced(placed, "pointers");
  const second = placed[1].rect;
  const first = placed[0];
  const crossesFirstPointer = (() => {
    for (let t = 0; t <= 1; t += 0.05) {
      const x = first.anchor.x + (first.target.x - first.anchor.x) * t;
      const y = first.anchor.y + (first.target.y - first.anchor.y) * t;
      if (x >= second.x0 && x <= second.x1 && y >= second.y0 && y <= second.y1) return true;
    }
    return false;
  })();
  assert.equal(crossesFirstPointer, false);
});
