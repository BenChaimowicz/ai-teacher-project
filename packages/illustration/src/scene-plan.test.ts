import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { FIXTURES_DIR } from "./fixtures.ts";
import { PAPER_COLOURS } from "./palette.ts";
import { MAX_LABELS, parseScenePlan, SCENE_PLAN_SCHEMA, scenePlanFailures } from "./scene-plan.ts";

/** A small valid plan to break in one place at a time. */
const plan = (): Record<string, unknown> => ({
  title: "A well",
  items: [
    { type: "object", kind: "well", box: { x: 500, y: 400, w: 140, h: 66 }, colour: "water", label: null },
    { type: "limb", knots: [{ x: 100, y: 100, width: 20 }, { x: 300, y: 150, width: 8 }], colour: "wood", depth: "low" },
  ],
  labels: [{ text: "the well", target: { x: 570, y: 430 }, side: "below" }],
});

test("the schema is strict: every object requires all its properties, allows no others, and every block is told apart by one type", () => {
  const seen: string[] = [];
  const walk = (node: Record<string, unknown>, path: string) => {
    if (node.oneOf) assert.fail(`${path} uses oneOf, which strict structured outputs reject.`);
    if (node.type === "object") {
      assert.equal(node.additionalProperties, false, `${path} must forbid extra properties.`);
      const keys = Object.keys(node.properties as Record<string, unknown>);
      assert.deepEqual([...(node.required as string[])].sort(), [...keys].sort(), `${path} must require every property.`);
      for (const key of keys) walk((node.properties as Record<string, Record<string, unknown>>)[key], `${path}.${key}`);
    }
    if (node.items) walk(node.items as Record<string, unknown>, `${path}[]`);
    if (node.anyOf) {
      for (const option of node.anyOf as Record<string, unknown>[]) {
        const type = ((option.properties as Record<string, { enum?: string[] }>).type?.enum ?? []);
        assert.equal(type.length, 1, `${path} anyOf branches each name exactly one type.`);
        seen.push(type[0]);
        walk(option, `${path}<${type[0]}>`);
      }
    }
    if (node.enum && path.endsWith("colour") || path.endsWith("shade") || path.endsWith("leaves") || path.endsWith("wood") || path.endsWith("clothes")) {
      assert.deepEqual(node.enum, [...PAPER_COLOURS], `${path} names colours from the palette.`);
    }
  };
  walk(SCENE_PLAN_SCHEMA as unknown as Record<string, unknown>, "plan");
  assert.deepEqual(seen, ["shape", "cutout", "limb", "foliage", "tree", "figure", "creature", "object", "cells", "disc", "arrow", "text", "panel", "jongi"]);
  assert.equal(new Set(seen).size, seen.length, "No block type is listed twice.");
});

test("the committed fixtures are valid plans", async () => {
  for (const name of ["yggdrasil", "gram"]) {
    const raw = JSON.parse(await readFile(resolve(FIXTURES_DIR, `${name}.json`), "utf8"));
    assert.deepEqual(scenePlanFailures(raw), [], name);
  }
});

test("a valid plan has no failures and parses", () => {
  assert.deepEqual(scenePlanFailures(plan()), []);
  assert.equal(parseScenePlan(plan()).items.length, 2);
});

test("a plan that departs from the schema is named field by field", () => {
  const unknownBlock = plan();
  (unknownBlock.items as unknown[]).push({ type: "hand", box: { x: 1, y: 1, w: 1, h: 1 } });
  assert.match(scenePlanFailures(unknownBlock)[0], /plan\.items\[2\] is not a known block: its type is "hand"; known types are shape, cutout/);

  const missing = plan();
  delete ((missing.items as Record<string, unknown>[])[0]).colour;
  assert.deepEqual(scenePlanFailures(missing), ["plan.items[0].colour is missing."]);

  const extra = plan();
  ((extra.items as Record<string, unknown>[])[0]).hex = "#ff0000";
  assert.deepEqual(scenePlanFailures(extra), ["plan.items[0].hex is not a field this block has."]);

  const rawHex = plan();
  ((rawHex.items as Record<string, unknown>[])[0]).colour = "#ff0000";
  assert.match(scenePlanFailures(rawHex)[0], /^plan\.items\[0\]\.colour must be one of "desk", "sheet".*not "#ff0000"\.$/);

  const wrongType = plan();
  (wrongType.items as Record<string, unknown>[])[0].box = "big";
  assert.deepEqual(scenePlanFailures(wrongType), ['plan.items[0].box must be object, not string "big".']);

  const badSide = plan();
  (badSide.labels as Record<string, unknown>[])[0].side = "north";
  assert.match(scenePlanFailures(badSide)[0], /plan\.labels\[0\]\.side must be one of "left", "right", "above", "below" or null, not "north"/);

  assert.deepEqual(scenePlanFailures(null), ["plan must be object, not null."]);
  assert.deepEqual(scenePlanFailures({ title: null, items: [] }), ["plan.labels is missing."]);
});

test("a plan that obeys the schema but cannot be drawn is refused with the rule it breaks", () => {
  const offSheet = plan();
  (offSheet.items as Record<string, unknown>[])[0].box = { x: 1100, y: 400, w: 140, h: 66 };
  assert.deepEqual(scenePlanFailures(offSheet), ["plan.items[0] (object) box must lie on the sheet, x 22..1178 and y 22..778, with a positive size."]);

  const flat = plan();
  (flat.items as Record<string, unknown>[])[0].box = { x: 100, y: 400, w: 0, h: 66 };
  assert.equal(scenePlanFailures(flat).length, 1);

  const oneKnot = plan();
  (oneKnot.items as Record<string, unknown>[])[1].knots = [{ x: 100, y: 100, width: 20 }];
  assert.deepEqual(scenePlanFailures(oneKnot), ["plan.items[1] (limb) needs 2 to 40 knots, not 1."]);

  const thinKnot = plan();
  (thinKnot.items as Record<string, unknown>[])[1].knots = [{ x: 100, y: 100, width: 0 }, { x: 300, y: 150, width: 8 }];
  assert.deepEqual(scenePlanFailures(thinKnot), ["plan.items[1] (limb) every knot width must be positive."]);

  const twoPoints = plan();
  (twoPoints.items as unknown[]).push({ type: "cutout", points: [{ x: 100, y: 100 }, { x: 200, y: 100 }], colour: "gold", depth: "flat" });
  assert.deepEqual(scenePlanFailures(twoPoints), ["plan.items[2] (cutout) needs 3 to 40 points, not 2."]);

  const sevenRoots = plan();
  (sevenRoots.items as unknown[]).push({ type: "tree", box: { x: 100, y: 100, w: 400, h: 400 }, roots: 7, crown: "wide", leaves: "leaf", wood: "wood" });
  assert.deepEqual(scenePlanFailures(sevenRoots), ["plan.items[2] (tree) roots must be 1 to 6, not 7."]);

  const emptyLabel = plan();
  (emptyLabel.labels as Record<string, unknown>[])[0].text = "  ";
  assert.deepEqual(scenePlanFailures(emptyLabel), ["plan.labels[0].text is empty."]);

  const crowded = plan();
  crowded.labels = Array.from({ length: MAX_LABELS + 1 }, (_, i) => ({ text: `label ${i}`, target: { x: 600, y: 400 }, side: null }));
  assert.deepEqual(scenePlanFailures(crowded), [`plan.labels holds ${MAX_LABELS + 1} labels; the most is ${MAX_LABELS}.`]);

  const nothing = plan();
  nothing.items = [];
  nothing.title = "";
  assert.deepEqual(scenePlanFailures(nothing), ["plan.title is empty; use null for no title.", "plan.items is empty; a scene needs at least one block."]);

  const shortArrow = plan();
  (shortArrow.items as unknown[]).push({ type: "arrow", from: { x: 100, y: 100 }, to: { x: 110, y: 100 }, colour: "gold" });
  assert.deepEqual(scenePlanFailures(shortArrow), ["plan.items[2] (arrow) is shorter than 20 units."]);
});

test("parsing an invalid plan throws with every failure listed", () => {
  const broken = plan();
  broken.items = [{ type: "disc", x: 5, y: 5, number: 200, colour: "red" }];
  assert.throws(() => parseScenePlan(broken), /\[scene-plan\.ts: parseScenePlan\] The scene plan cannot be drawn \|\| failures=2 \|\| plan\.items\[0\] \(disc\) centre must lie on the sheet.*number must be 0 to 99, not 200/);
});
