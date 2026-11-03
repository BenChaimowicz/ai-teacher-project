/**
 * Label placement: each tag is tried on several sides of its target at several distances, and the cheapest spot
 * wins. A spot off the sheet, over the tag's own target or over an earlier tag is never used; a spot over another
 * label's target, across another tag's pointer, over a drawn block, far from the target or away from the preferred
 * side costs more. Tags are placed in plan order, so the first label gets the best spot.
 */
import type { Point, SceneLabel } from "./scene-plan.ts";
import { Style } from "./style.ts";

/** An axis-aligned rectangle by its corners. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Where a tag ended up. */
export type PlacedLabel = {
  text: string;
  target: Point;
  /** The tag's paper. */
  rect: Rect;
  /** Where its pointer leaves the tag, on the edge nearest the target. */
  anchor: Point;
  /** True when no spot obeyed every hard rule and the least bad one was taken. */
  crowded: boolean;
};

/** The font size tags are set in. */
export const TAG_FONT_SIZE = 15;

/** The eight directions a tag may sit in, as unit vectors. */
const DIRECTIONS: Record<string, [number, number]> = {
  right: [1, 0], left: [-1, 0], above: [0, -1], below: [0, 1],
  "above-right": [0.7071, -0.7071], "above-left": [-0.7071, -0.7071], "below-right": [0.7071, 0.7071], "below-left": [-0.7071, 0.7071],
};

/** The directions next to each cardinal one, for the preference cost. */
const NEIGHBOURS: Record<string, string[]> = {
  right: ["above-right", "below-right"], left: ["above-left", "below-left"], above: ["above-left", "above-right"], below: ["below-left", "below-right"],
};

/** Gaps between a tag's near edge and its target, tried nearest first. */
const DISTANCES = [30, 50, 76, 110, 150, 200, 260, 330];

/** Clearance kept around a tag, the sheet edge and a target. */
const PAD = 6;

/**
 * The paper size of a tag around its text.
 * @param text - The tag's text
 */
export function tagSize(text: string): { w: number; h: number } {
  return { w: Style.textWidth(text, TAG_FONT_SIZE) + TAG_FONT_SIZE * 1.4, h: TAG_FONT_SIZE * 1.75 };
}

/**
 * How much two rectangles overlap, in area.
 * @param a - One rectangle
 * @param b - The other
 */
function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * A rectangle grown by a margin on every side.
 * @param r - The rectangle
 * @param by - The margin
 */
function grow(r: Rect, by: number): Rect {
  return { x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by };
}

/**
 * Whether a point lies inside a rectangle.
 * @param p - The point
 * @param r - The rectangle
 */
function inside(p: Point, r: Rect): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

/**
 * Whether the segment from `a` to `b` crosses a rectangle, by stepping along it.
 * @param a - One end
 * @param b - The other
 * @param r - The rectangle
 */
function crosses(a: Point, b: Point, r: Rect): boolean {
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, r)) return true;
  }
  return false;
}

/**
 * Where a pointer leaves a tag: the point on the tag's edge where the line from its centre to the target exits.
 * @param rect - The tag
 * @param target - The target
 */
function exitPoint(rect: Rect, target: Point): Point {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const hw = (rect.x1 - rect.x0) / 2;
  const hh = (rect.y1 - rect.y0) / 2;
  const t = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return { x: cx + dx * t, y: cy + dy * t };
}

/**
 * Places every label's tag so none overlaps another, covers its target or leaves the sheet, steering around the
 * drawn blocks where it can.
 * @param labels - The plan's labels, in order
 * @param obstacles - Boxes of the blocks already drawn, which a tag would rather not cover
 * @param sheet - The area tags must stay inside
 * @returns A placement per label, in the same order
 */
export function placeLabels(labels: readonly SceneLabel[], obstacles: readonly Rect[], sheet: Rect): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const targets = labels.map((label) => label.target);
  const room = grow(sheet, -PAD);
  for (const label of labels) {
    const { w, h } = tagSize(label.text);
    let best: { rect: Rect; cost: number; hard: boolean } | null = null;
    for (const [name, [ux, uy]] of Object.entries(DIRECTIONS)) {
      const preference = label.side === null ? (ux !== 0 && uy !== 0 ? 10 : 0)
        : name === label.side ? 0 : NEIGHBOURS[label.side].includes(name) ? 25 : 60;
      const reach = Math.abs(ux) * (w / 2) + Math.abs(uy) * (h / 2);
      for (const distance of DISTANCES) {
        const cx = label.target.x + ux * (distance + reach);
        const cy = label.target.y + uy * (distance + reach);
        const rect: Rect = { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 };
        if (rect.x0 < room.x0 || rect.y0 < room.y0 || rect.x1 > room.x1 || rect.y1 > room.y1) continue;
        const padded = grow(rect, PAD);
        let hard = inside(label.target, padded);
        for (const other of placed) {
          if (overlap(padded, other.rect) > 0) hard = true;
        }
        const anchor = exitPoint(rect, label.target);
        let cost = preference + distance * 0.6;
        for (const other of placed) {
          if (crosses(anchor, label.target, grow(other.rect, 2))) cost += 300;
          if (crosses(other.anchor, other.target, padded)) cost += 300;
        }
        for (const target of targets) {
          if (target !== label.target && inside(target, padded)) cost += 400;
        }
        for (const obstacle of obstacles) {
          // Hiding most of a small block (a caption, a drop) costs far more than clipping the corner of a big one.
          const covered = overlap(rect, obstacle);
          if (covered > 0) cost += (covered / ((obstacle.x1 - obstacle.x0) * (obstacle.y1 - obstacle.y0))) * 300 + (covered / (w * h)) * 20;
        }
        if (!best || (best.hard && !hard) || (best.hard === hard && cost < best.cost)) best = { rect, cost, hard };
      }
    }
    if (!best) {
      // The sheet is too small for the tag anywhere near its target: pin it at the target, inside the sheet.
      const x0 = Math.min(Math.max(label.target.x - w / 2, room.x0), room.x1 - w);
      const y0 = Math.min(Math.max(label.target.y - h / 2, room.y0), room.y1 - h);
      best = { rect: { x0, y0, x1: x0 + w, y1: y0 + h }, cost: Infinity, hard: true };
    }
    placed.push({ text: label.text, target: label.target, rect: best.rect, anchor: exitPoint(best.rect, label.target), crowded: best.hard });
  }
  return placed;
}
