/**
 * Draws a scene plan in the papercraft house style: the sheet, every block in plan order through the one
 * {@link Style}, the labels placed last, and the paper grain over it all. The same plan gives the same bytes.
 */
import { roundRect, type Bounds } from "./geometry.ts";
import { arrow, cells, creature, depthOf, disc, figure, foliage, jongiPlaceholder, object, panel, shape, sheet, tree, TEXT_SIZES } from "./glyphs.ts";
import { placeLabels, TAG_FONT_SIZE, type PlacedLabel, type Rect } from "./labels.ts";
import { HEX } from "./palette.ts";
import { ellipse, limb } from "./geometry.ts";
import { scenePlanFailures, SHEET, type SceneItem, type ScenePlan } from "./scene-plan.ts";
import { rasterize, Style } from "./style.ts";

/** What a render gives back: the SVG the PNG was drawn from, and the PNG. */
export type RenderedScene = { svg: string; png: Uint8Array; labels: PlacedLabel[] };

/** Seeds are spaced so each block's pieces never share a seed with the next block's. */
const SEEDS_PER_ITEM = 200;

/** Where the title sits. */
const TITLE_Y = 72;

/**
 * Draws one block.
 * @param s - The style
 * @param item - The block
 * @param seed - The block's first seed
 */
function drawItem(s: Style, item: SceneItem, seed: number): void {
  switch (item.type) {
    case "shape": shape(s, item, seed); break;
    case "cutout": s.piece(item.points.map((p) => [p.x, p.y]), { fill: HEX[item.colour], seed, ...depthOf(item.depth) }); break;
    case "limb": s.piece(limb(item.knots.map((k) => [k.x, k.y, k.width])), { fill: HEX[item.colour], seed, ...depthOf(item.depth) }); break;
    case "foliage": foliage(s, item.box, item.colour, item.shade, seed); break;
    case "tree": tree(s, item, seed); break;
    case "figure": figure(s, item, seed); break;
    case "creature": creature(s, item, seed); break;
    case "object": object(s, item, seed); break;
    case "cells": cells(s, item, seed); break;
    case "disc": disc(s, item.x, item.y, item.number, item.colour, seed); break;
    case "arrow": arrow(s, [item.from.x, item.from.y], [item.to.x, item.to.y], item.colour, seed); break;
    case "text": s.text(item.x, item.y, item.text, TEXT_SIZES[item.size], HEX[item.colour], item.align); break;
    case "panel": panel(s, item.box, item.colour, item.title, seed); break;
    case "jongi": jongiPlaceholder(s, item, seed); break;
  }
}

/**
 * Whether a block is background the label placer may cover freely: ground, panels and sheets of paper, not things.
 * @param item - The block
 */
function isBackground(item: SceneItem): boolean {
  return item.type === "panel" || (item.type === "shape" && (item.shape === "band" || item.shape === "rect" || item.shape === "rounded"));
}

/**
 * A tag with its pointer: a strip from the tag's edge to the target, a dot on the target, the tag's paper, its text.
 * @param s - The style
 * @param label - Where the placer put it
 * @param seed - The tag's seed
 */
function drawLabel(s: Style, label: PlacedLabel, seed: number): void {
  const { rect, target, anchor } = label;
  if (Math.hypot(target.x - anchor.x, target.y - anchor.y) > 8) {
    s.strip([[anchor.x, anchor.y], [target.x, target.y]], 2.4, { fill: HEX["plum-light"], seed: seed + 1, depth: 1.5 });
    s.piece(ellipse(target.x, target.y, 4, 4, 0, 12), { fill: HEX.cream, seed: seed + 2, depth: 1.2, step: 2.5 });
  }
  const w = rect.x1 - rect.x0;
  const h = rect.y1 - rect.y0;
  s.piece(roundRect(rect.x0, rect.y0, w, h, h * 0.42), { fill: HEX["plum-light"], seed, depth: 3, rim: 0.2 });
  s.text(rect.x0 + w / 2, rect.y0 + h / 2 + 0.5, label.text, TAG_FONT_SIZE, HEX.cream);
}

/**
 * Draws a scene plan as SVG and PNG. An invalid plan is refused before anything is drawn, so a picture is never half
 * a plan.
 * @param plan - A scene plan, as {@link parseScenePlan} returns it or as a fixture holds it
 * @returns The SVG, the PNG and where each label's tag landed
 * @throws Error listing every failure when the plan cannot be drawn, or naming what resvg could not draw
 */
export function renderScenePlan(plan: ScenePlan): RenderedScene {
  const failures = scenePlanFailures(plan);
  if (failures.length > 0) {
    throw new Error(`[render.ts: renderScenePlan] The scene plan cannot be drawn || failures=${failures.length} || ${failures.join(" ")}`);
  }
  const s = new Style();
  sheet(s);
  if (plan.title !== null) s.text(s.width / 2, TITLE_Y, plan.title, 24, HEX.text);
  const obstacles: Rect[] = [];
  plan.items.forEach((item, index) => {
    s.beginFootprint();
    drawItem(s, item, 1000 + index * SEEDS_PER_ITEM);
    const footprint: Bounds | null = s.endFootprint();
    if (footprint && !isBackground(item)) obstacles.push(footprint);
  });
  const labels = placeLabels(plan.labels, obstacles, SHEET);
  labels.forEach((label, index) => drawLabel(s, label, 1000 + (plan.items.length + index) * SEEDS_PER_ITEM));
  const svg = s.svg();
  return { svg, png: rasterize(svg), labels };
}
