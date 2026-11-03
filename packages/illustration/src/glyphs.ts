/**
 * The cut-paper building blocks the renderer knows: each one is a handful of pieces through the one {@link Style},
 * drawn in a local frame and fitted into the box or onto the feet line a plan gives. Nothing here draws hands.
 */
import { blob, curve, ellipse, limb, place, placeKnots, rng, roundRect, type Knot, type Pt } from "./geometry.ts";
import { darken, HEX, lighten, mix, type PaperColour } from "./palette.ts";
import { crownBoxOf, type Box, type CellsItem, type CreatureItem, type Depth, type FigureItem, type JongiItem, type ObjectItem, type ShapeItem, type TreeItem } from "./scene-plan.ts";
import { CARD_INSET, SHEET_MARGIN, Style } from "./style.ts";

/** Shadow depth and edge light for each plan depth. */
const DEPTHS: Record<Depth, { depth: number; rim: number }> = {
  flat: { depth: 0, rim: 0.12 },
  low: { depth: 2, rim: 0.22 },
  raised: { depth: 5, rim: 0.3 },
};

/** Font size for each plan text size. */
export const TEXT_SIZES = { small: 14, medium: 19, large: 24 } as const;

/**
 * The shadow and edge a plan depth means.
 * @param depth - The plan's word
 */
export function depthOf(depth: Depth): { depth: number; rim: number } {
  return DEPTHS[depth];
}

/**
 * Where a local frame of `baseW` by `baseH` lands when fitted inside a box without stretching: centred, scaled by
 * the tighter side.
 * @param box - The box to fill
 * @param baseW - The frame's width
 * @param baseH - The frame's height
 * @returns The canvas point the frame's centre lands on, and the scale
 */
function fit(box: Box, baseW: number, baseH: number): { cx: number; cy: number; scale: number } {
  const scale = Math.min(box.w / baseW, box.h / baseH);
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, scale };
}

/**
 * The ink-navy sheet laid on the desk, with a raised inner sheet, before anything else is cut.
 * @param s - The style
 */
export function sheet(s: Style): void {
  s.piece(roundRect(SHEET_MARGIN, SHEET_MARGIN - 2, s.width - 2 * SHEET_MARGIN, s.height - 2 * SHEET_MARGIN + 2, 10), { fill: HEX.sheet, seed: 1, depth: 8, rim: 0.12, step: 30 });
  s.piece(roundRect(CARD_INSET.x, CARD_INSET.y, s.width - 2 * CARD_INSET.x, s.height - 2 * CARD_INSET.y, 8), { fill: HEX.raised, seed: 2, depth: 4, rim: 0.1, step: 30 });
}

/**
 * A named shape filling a box.
 * @param s - The style
 * @param item - The block
 * @param seed - The piece's seed
 */
export function shape(s: Style, item: ShapeItem, seed: number): void {
  const { x, y, w, h } = item.box;
  const fill = HEX[item.colour];
  const options = { fill, seed, ...depthOf(item.depth) };
  switch (item.shape) {
    case "rect": s.piece(roundRect(x, y, w, h, 2), { ...options, step: Math.max(8, Math.min(24, (w + h) / 40)) }); break;
    case "rounded": s.piece(roundRect(x, y, w, h, Math.min(w, h) * 0.22), { ...options, step: Math.max(8, Math.min(24, (w + h) / 40)) }); break;
    case "ellipse": s.piece(ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 48), options); break;
    case "triangle": s.piece([[x + w / 2, y], [x + w, y + h], [x, y + h]], options); break;
    case "blob": s.piece(blob(x + w / 2, y + h / 2, w / 2, h / 2, seed), options); break;
    case "band": {
      const r = rng(seed);
      const top: Pt[] = [];
      const waves = Math.max(3, Math.round(w / 180));
      for (let i = 0; i <= waves; i++) top.push([x + (w * i) / waves, y + (r() - 0.5) * Math.min(24, h * 0.3)]);
      s.piece([...top, [x + w, y + h], [x, y + h]], { ...options, step: 20 });
      break;
    }
  }
}

/**
 * Clumped leaves filling a box: dark clumps behind, lit clumps in front, small bright leaves on top.
 * @param s - The style
 * @param box - The box to fill
 * @param leaves - The lit leaf colour
 * @param shade - The colour of the clumps behind
 * @param seed - Which clumps
 */
export function foliage(s: Style, box: Box, leaves: PaperColour, shade: PaperColour, seed: number): void {
  const r = rng(seed);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const lit = HEX[leaves];
  const dark = HEX[shade];
  // Clumps sit evenly around a ring, so the mass reads as one round crown rather than scattered patches.
  const ring = (count: number, reach: number, size: number, fill: (i: number) => string, depth: number, lump: number, lobes: number, offset: number) => {
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) / count) * Math.PI * 2 + (r() - 0.5) * 0.4;
      const rx = box.w * size * (0.85 + r() * 0.3);
      const ry = box.h * size * (0.85 + r() * 0.3);
      const x = cx + Math.cos(a) * (box.w / 2 - rx) * reach;
      const y = cy + Math.sin(a) * (box.h / 2 - ry) * reach;
      s.piece(blob(x, y, rx, ry, seed + offset + i, lump, lobes), { fill: fill(i), seed: seed + offset + i, depth });
    }
  };
  ring(7, 1, 0.22, () => dark, 6, 0.18, 7, 10);
  s.piece(blob(cx, cy, box.w * 0.3, box.h * 0.34, seed + 20), { fill: dark, seed: seed + 20, depth: 6 });
  ring(9, 0.85, 0.13, (i) => (i % 2 ? lit : mix(lit, lighten(lit, 0.25), 0.5)), 5, 0.2, 6, 30);
  s.piece(blob(cx, cy + box.h * 0.1, box.w * 0.16, box.h * 0.22, seed + 40), { fill: lit, seed: seed + 40, depth: 5 });
  const highlight = lighten(lit, 0.2);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 0.8;
    const x = cx + Math.cos(a) * d * box.w * 0.4;
    const y = cy + Math.sin(a) * d * box.h * 0.4;
    const w = Math.max(6, box.w * (0.03 + r() * 0.02));
    s.piece(blob(x, y, w, w * 0.6, seed + 60 + i, 0.25, 5), { fill: highlight, seed: seed + 60 + i, depth: 2 });
  }
}

/**
 * A whole tree: crown across the top of its box, trunk down the middle, branches into the crown, and exactly the
 * roots asked for reaching the box's bottom.
 * @param s - The style
 * @param item - The block
 * @param seed - The tree's seed
 */
export function tree(s: Style, item: TreeItem, seed: number): void {
  const { x, y, w, h } = item.box;
  const wood = HEX[item.wood];
  const woodDark = darken(wood, 0.3);
  const cx = x + w / 2;
  const crownBox = crownBoxOf(item);
  const crownW = crownBox.w;
  const crownH = crownBox.h;
  const crownCy = y + crownH / 2;
  const ground = y + h * 0.8;
  const trunkW = Math.max(20, Math.min(w * 0.07, h * 0.12, 80));
  // Back of the crown, so branches and the trunk top sit among the leaves.
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    const bx = crownBox.x + crownW * (0.15 + 0.7 * (i / 5)) + (r() - 0.5) * crownW * 0.1;
    const by = crownCy + (r() - 0.5) * crownH * 0.4;
    s.piece(blob(bx, by, crownW * 0.19, crownH * 0.42, seed + i), { fill: darken(HEX[item.leaves], 0.3), seed: seed + i, depth: 6 });
  }
  // Roots fan out from the trunk base to the bottom of the box.
  const spread = item.roots === 1 ? 0 : Math.min(w * 0.42, h * 0.5);
  for (let i = 0; i < item.roots; i++) {
    const t = item.roots === 1 ? 0 : i / (item.roots - 1) - 0.5;
    const endX = cx + t * 2 * spread;
    const endY = y + h - Math.abs(t) * h * 0.06;
    const knots: Knot[] = [
      [cx + t * trunkW * 0.6, ground - trunkW * 0.3, trunkW * 0.95],
      [cx + (endX - cx) * 0.45, ground + (endY - ground) * 0.5, trunkW * 0.7],
      [cx + (endX - cx) * 0.8, ground + (endY - ground) * 0.85, trunkW * 0.45],
      [endX, endY, trunkW * 0.28],
    ];
    s.piece(limb(knots), { fill: woodDark, seed: seed + 20 + i, depth: 5 });
  }
  // Branches reach from the trunk top into the crown.
  const top = crownCy + crownH * 0.35;
  const branches: Knot[][] = [
    [[cx, top + crownH * 0.2, trunkW * 0.8], [cx - crownW * 0.1, top - crownH * 0.15, trunkW * 0.55], [cx - crownW * 0.3, top - crownH * 0.4, trunkW * 0.32], [cx - crownW * 0.45, top - crownH * 0.5, trunkW * 0.16]],
    [[cx, top + crownH * 0.2, trunkW * 0.8], [cx + crownW * 0.1, top - crownH * 0.15, trunkW * 0.55], [cx + crownW * 0.3, top - crownH * 0.4, trunkW * 0.32], [cx + crownW * 0.45, top - crownH * 0.5, trunkW * 0.16]],
    [[cx, top + crownH * 0.1, trunkW * 0.7], [cx, top - crownH * 0.3, trunkW * 0.4], [cx - trunkW * 0.1, top - crownH * 0.75, trunkW * 0.18]],
    [[cx - trunkW * 0.3, top + crownH * 0.05, trunkW * 0.4], [cx - crownW * 0.2, top - crownH * 0.05, trunkW * 0.25], [cx - crownW * 0.38, top - crownH * 0.1, trunkW * 0.13]],
    [[cx + trunkW * 0.3, top + crownH * 0.05, trunkW * 0.4], [cx + crownW * 0.2, top - crownH * 0.05, trunkW * 0.25], [cx + crownW * 0.38, top - crownH * 0.1, trunkW * 0.13]],
  ];
  branches.forEach((knots, i) => s.piece(limb(knots), { fill: wood, seed: seed + 30 + i, depth: 4 }));
  // The trunk flares at the base and forks at the top.
  const flare = trunkW * 1.5;
  s.piece(curve([cx - trunkW * 1.6, ground], [
    [[cx - trunkW * 0.9, ground - h * 0.06], [cx - trunkW * 0.55, ground - h * 0.12], [cx - trunkW * 0.55, ground - h * 0.18]],
    [[cx - trunkW * 0.55, top + crownH * 0.4], [cx - trunkW * 0.8, top + crownH * 0.25], [cx - flare, top + crownH * 0.12]],
    [[cx - flare * 0.4, top + crownH * 0.2], [cx - trunkW * 0.1, top + crownH * 0.16], [cx, top + crownH * 0.1]],
    [[cx + trunkW * 0.1, top + crownH * 0.16], [cx + flare * 0.4, top + crownH * 0.2], [cx + flare, top + crownH * 0.12]],
    [[cx + trunkW * 0.8, top + crownH * 0.25], [cx + trunkW * 0.55, top + crownH * 0.4], [cx + trunkW * 0.55, ground - h * 0.18]],
    [[cx + trunkW * 0.55, ground - h * 0.12], [cx + trunkW * 0.9, ground - h * 0.06], [cx + trunkW * 1.6, ground]],
    [[cx + trunkW * 0.8, ground + 2], [cx - trunkW * 0.8, ground + 2], [cx - trunkW * 1.6, ground]],
  ]), { fill: wood, seed: seed + 40, depth: 6 });
  // Bark strips give the trunk its grain.
  for (let i = -1; i <= 1; i++) {
    const bx = cx + i * trunkW * 0.3;
    s.strip([[bx, ground - h * 0.04], [bx + i * 3, (ground + top) / 2], [bx - i * 2, top + crownH * 0.3]], Math.max(2, trunkW * 0.045), { fill: woodDark, seed: seed + 50 + i });
  }
  // Front of the crown.
  foliage(s, crownBox, item.leaves, item.leaves === "leaf" ? "leaf-dark" : item.leaves, seed + 100);
}

/**
 * A simple standing person, feet at (x, y): a long robe, a head with hair, arms that end in sleeves, a belt.
 * No hands.
 * @param s - The style
 * @param item - The block
 * @param seed - The figure's seed
 */
export function figure(s: Style, item: FigureItem, seed: number): void {
  const { x, y, height } = item;
  const k = height / 120;
  const top = y - height;
  const dress = HEX[item.clothes];
  const hair = HEX[item.hair];
  const sleeve = darken(dress, 0.15);
  s.piece([[x - 30 * k, y], [x - 14 * k, top + 40 * k], [x + 14 * k, top + 40 * k], [x + 30 * k, y]], { fill: dress, seed, depth: 4 });
  s.piece(limb(placeKnots([[-12, 44, 12], [-20, 80, 10], [-14, 98, 9]], x, top, k)), { fill: sleeve, seed: seed + 1, depth: 2 });
  s.piece(limb(placeKnots([[12, 44, 12], [20, 80, 10], [14, 98, 9]], x, top, k)), { fill: sleeve, seed: seed + 2, depth: 2 });
  s.piece(ellipse(x, top + 22 * k, 26 * k, 30 * k, 0, 30), { fill: hair, seed: seed + 3, depth: 3 });
  s.piece(limb(placeKnots([[-16, 30, 18], [-20, 70, 14]], x, top, k)), { fill: hair, seed: seed + 6, depth: 2 });
  s.piece(limb(placeKnots([[16, 30, 18], [20, 70, 14]], x, top, k)), { fill: hair, seed: seed + 7, depth: 2 });
  s.piece(ellipse(x, top + 24 * k, 15 * k, 18 * k, 0, 28), { fill: HEX[item.skin], seed: seed + 4, depth: 2 });
  s.piece(ellipse(x, top + 9 * k, 18 * k, 9 * k, 0, 24), { fill: hair, seed: seed + 5, depth: 1.5 });
  s.strip([[x - 22 * k, top + 62 * k], [x + 22 * k, top + 62 * k]], 3 * k, { fill: HEX.gold, seed: seed + 8 });
}

/**
 * A bird with spread wings, drawn in a 330 by 120 frame around its body, beak towards +x.
 * @param s - The style
 * @param item - The block
 * @param seed - The bird's seed
 */
function bird(s: Style, item: CreatureItem, seed: number): void {
  const { cx, cy, scale } = fit(item.box, 330, 120);
  const mirror = item.facing === "left";
  const at = (pts: Pt[]) => place(pts, cx, cy + 12 * scale, scale, 0, mirror);
  const body = HEX[item.colour];
  const dark = darken(body, 0.28);
  const accent = HEX[item.accent];
  const wing = (dir: 1 | -1, n: number) => {
    const outline: Pt[] = [[0, -4], [40, -38], [95, -62], [150, -70], [140, -56], [160, -50], [142, -38], [156, -28], [132, -20], [140, -8], [110, -4], [70, 10], [20, 14]];
    s.piece(at(outline.map(([x, y]) => [dir * x, y])), { fill: body, seed: seed + n, depth: 5 });
    const inner: Pt[] = [[10, -6], [45, -34], [90, -50], [70, -26], [30, 6]];
    s.piece(at(inner.map(([x, y]) => [dir * x, y])), { fill: dark, seed: seed + n + 1, depth: 2 });
  };
  wing(-1, 1);
  wing(1, 3);
  s.piece(at([[-14, 30], [-8, 46], [0, 40], [8, 46], [14, 30]]), { fill: dark, seed: seed + 7, depth: 2 });
  s.piece(at(ellipse(0, 8, 22, 32, 0, 30)), { fill: body, seed: seed + 5, depth: 4 });
  s.piece(at(ellipse(0, -30, 16, 16, 0, 24)), { fill: HEX.cream, seed: seed + 9, depth: 3 });
  s.piece(at([[10, -36], [30, -30], [26, -20], [10, -24]]), { fill: accent, seed: seed + 11, depth: 2 });
  s.piece(at(ellipse(5, -33, 2.6, 2.6, 0, 10)), { fill: HEX.desk, seed: seed + 13, depth: 0, rim: 0 });
  for (const dx of [-9, 9]) s.strip(at([[dx, 34], [dx * 1.3, 46]]), 4 * scale, { fill: accent, seed: seed + 15 + dx });
}

/**
 * A coiling serpent with open jaws, drawn in a 260 by 126 frame with the jaws at the facing end.
 * @param s - The style
 * @param item - The block
 * @param seed - The serpent's seed
 */
function serpent(s: Style, item: CreatureItem, seed: number): void {
  const { cx, cy, scale } = fit(item.box, 260, 126);
  const mirror = item.facing === "right";
  // The frame's origin is the bite point, 60 in from the facing edge and 44 down from the top.
  const ox = cx + (mirror ? 1 : -1) * 70 * scale;
  const oy = cy - 19 * scale;
  const at = (pts: Pt[]) => place(pts, ox, oy, scale, 0, mirror);
  const knots = (k: Knot[]) => placeKnots(k, ox, oy, scale, mirror);
  const body = HEX[item.colour];
  const dark = darken(body, 0.3);
  const accent = HEX[item.accent];
  const coil: Knot[] = [[185, 50, 5], [150, 26, 16], [110, 46, 26], [70, 60, 30], [34, 44, 30], [14, 16, 28]];
  coil.slice(1, 5).forEach(([x, y, w], i) => {
    s.piece(at([[x - 9, y - w / 2 + 4], [x + 2, y - w / 2 - 18], [x + 11, y - w / 2 + 4]]), { fill: accent, seed: seed + 1 + i, depth: 2 });
  });
  s.piece(limb(knots(coil)), { fill: body, seed: seed + 11, depth: 5 });
  s.piece(limb(knots([[125, 54, 8], [80, 70, 12], [46, 58, 12]])), { fill: dark, seed: seed + 13, depth: 1 });
  s.piece(limb(knots([[64, 66, 14], [50, 80, 10], [34, 80, 8]])), { fill: dark, seed: seed + 14, depth: 3 });
  s.piece(at([[20, 2], [-4, -26], [-48, -22], [-70, -8], [-40, -2], [-10, 6]]), { fill: body, seed: seed + 15, depth: 4 });
  s.piece(at([[16, 24], [-10, 40], [-58, 34], [-34, 22], [-6, 14]]), { fill: dark, seed: seed + 17, depth: 4 });
  for (let i = 0; i < 4; i++) {
    const x = -58 + i * 12;
    s.piece(at([[x, -6], [x + 4, 6], [x + 8, -5]]), { fill: HEX.cream, seed: seed + 19 + i, depth: 1, rim: 0 });
  }
  s.piece(at([[-2, -22], [18, -44], [10, -16]]), { fill: accent, seed: seed + 25, depth: 2 });
  s.piece(at(ellipse(-22, -14, 5, 4, 0, 12)), { fill: accent, seed: seed + 27, depth: 1 });
  s.piece(at(ellipse(-21, -14, 2, 3, 0, 8)), { fill: HEX.desk, seed: seed + 28, depth: 0, rim: 0 });
}

/**
 * A squirrel with a raised tail, drawn in a 72 by 82 frame, nose towards -x.
 * @param s - The style
 * @param item - The block
 * @param seed - The squirrel's seed
 */
function squirrel(s: Style, item: CreatureItem, seed: number): void {
  const { cx, cy, scale } = fit(item.box, 72, 82);
  const mirror = item.facing === "right";
  const at = (pts: Pt[]) => place(pts, cx - 18 * scale, cy + 11 * scale, scale, 0, mirror);
  const body = HEX[item.colour];
  const tail = HEX[item.accent];
  s.piece(at(curve([8, 22], [
    [[40, 20], [52, -18], [34, -40]],
    [[22, -52], [8, -40], [18, -28]],
    [[30, -12], [20, 6], [2, 8]],
    [[4, 14], [6, 20], [8, 22]],
  ])), { fill: tail, seed: seed + 1, depth: 3 });
  s.piece(at(ellipse(0, 8, 12, 20, -0.4, 24)), { fill: body, seed: seed + 3, depth: 3 });
  s.piece(at(ellipse(-8, -12, 9, 8, 0, 18)), { fill: body, seed: seed + 5, depth: 2 });
  s.piece(at([[-6, -18], [-2, -28], [1, -16]]), { fill: body, seed: seed + 7, depth: 1 });
  s.piece(at(ellipse(-11, -13, 1.8, 1.8, 0, 8)), { fill: HEX.desk, seed: seed + 9, depth: 0, rim: 0 });
}

/**
 * A creature fitted into its box.
 * @param s - The style
 * @param item - The block
 * @param seed - The creature's seed
 */
export function creature(s: Style, item: CreatureItem, seed: number): void {
  switch (item.kind) {
    case "bird": bird(s, item, seed); break;
    case "serpent": serpent(s, item, seed); break;
    case "squirrel": squirrel(s, item, seed); break;
  }
}

/**
 * A dropper bottle in an 80 by 154 frame: rubber bulb, collar, glass body with its liquid, and a sticker.
 * @param s - The style
 * @param item - The block
 * @param seed - The bottle's seed
 */
function bottle(s: Style, item: ObjectItem, seed: number): void {
  const { cx, cy, scale } = fit(item.box, 80, 154);
  const top = cy - 77 * scale;
  const at = (pts: Pt[]) => place(pts, cx, top, scale);
  const liquid = HEX[item.colour];
  const clear = item.colour === "clear" || item.colour === "glass";
  s.piece(at(curve([-12, 34], [[[-16, 10], [-10, 0], [0, 0]], [[10, 0], [16, 10], [12, 34]], [[8, 36], [-8, 36], [-12, 34]]])), { fill: HEX.ink, seed, depth: 3 });
  s.piece(at(roundRect(-22, 32, 44, 18, 4)), { fill: HEX["cream-deep"], seed: seed + 1, depth: 3 });
  s.piece(at(roundRect(-40, 50, 80, 104, 14)), { fill: mix(HEX.glass, HEX.raised, 0.55), seed: seed + 2, depth: 5, rim: 0.4 });
  s.piece(at(roundRect(-34, 78, 68, 70, 10)), { fill: liquid, seed: seed + 3, depth: 0, rim: clear ? 0.5 : 0.15, opacity: clear ? 0.75 : 1 });
  if (clear) {
    for (let i = 0; i < 3; i++) {
      s.piece(at(ellipse(-14 + i * 13, 100 + (i % 2) * 18, 3.5, 3.5, 0, 10)), { fill: lighten(HEX.glass, 0.5), seed: seed + 10 + i, depth: 0, rim: 0, opacity: 0.8 });
    }
  }
  if (item.label !== null) {
    s.piece(at(roundRect(-28, 96, 56, 26, 4)), { fill: HEX.cream, seed: seed + 4, depth: 1.5 });
    s.text(cx, top + 109 * scale, item.label, 13 * scale, HEX.plum);
  }
}

/**
 * A falling drop in a 22 by 35 frame.
 * @param s - The style
 * @param item - The block
 * @param seed - The drop's seed
 */
function drop(s: Style, item: ObjectItem, seed: number): void {
  const { cx, cy, scale } = fit(item.box, 22, 35);
  const clear = item.colour === "clear" || item.colour === "glass";
  const outline = curve([0, -18], [
    [[4, -8], [11, -2], [11, 6]],
    [[11, 13], [6, 17], [0, 17]],
    [[-6, 17], [-11, 13], [-11, 6]],
    [[-11, -2], [-4, -8], [0, -18]],
  ]);
  s.piece(place(outline, cx, cy + 0.5 * scale, scale), { fill: HEX[item.colour], seed, depth: 3, rim: clear ? 0.6 : 0.3, opacity: clear ? 0.85 : 1 });
}

/**
 * A glass slide in a 210 by 48 frame: the glass, a frosted end, and a pale smear for cells to sit on.
 * @param s - The style
 * @param item - The block
 * @param seed - The slide's seed
 */
function slide(s: Style, item: ObjectItem, seed: number): void {
  const { cx, cy, scale } = fit(item.box, 210, 48);
  const at = (pts: Pt[]) => place(pts, cx, cy, scale);
  s.piece(at(roundRect(-105, -24, 210, 48, 3)), { fill: mix(HEX[item.colour], HEX.raised, 0.25), seed, depth: 5, rim: 0.45, step: 10 });
  s.piece(at(roundRect(-105, -24, 40, 48, 3)), { fill: HEX["cream-deep"], seed: seed + 1, depth: 0, rim: 0.2 });
  s.piece(at(ellipse(20, 0, 70, 17, 0, 36)), { fill: mix(HEX.glass, HEX.cream, 0.45), seed: seed + 2, depth: 0, rim: 0 });
}

/**
 * A stone well of water in a 140 by 66 frame.
 * @param s - The style
 * @param item - The block
 * @param seed - The well's seed
 */
function well(s: Style, item: ObjectItem, seed: number): void {
  const { cx, cy, scale } = fit(item.box, 140, 66);
  const oy = cy - 11 * scale;
  const at = (pts: Pt[]) => place(pts, cx, oy, scale);
  s.piece(at(ellipse(0, 0, 70, 22, 0, 40)), { fill: darken(HEX.stone, 0.2), seed, depth: 3 });
  s.piece(at(roundRect(-70, 0, 140, 44, 6)), { fill: HEX.stone, seed: seed + 1, depth: 5 });
  s.piece(at(ellipse(0, 0, 70, 22, 0, 40)), { fill: HEX.stone, seed: seed + 2, depth: 1 });
  s.piece(at(ellipse(0, 0, 56, 14, 0, 36)), { fill: HEX[item.colour], seed: seed + 3, depth: 0, rim: 0 });
  s.strip(at([[-35, 0], [-13, -4]]), 2 * scale, { fill: lighten(HEX[item.colour], 0.4), seed: seed + 4, depth: 0 });
  for (let i = 0; i < 4; i++) s.strip(at([[-70 + 35 * i + 10, 22], [-70 + 35 * i + 30, 22]]), 2.5 * scale, { fill: darken(HEX.stone, 0.25), seed: seed + 5 + i, depth: 0 });
}

/**
 * A small object fitted into its box.
 * @param s - The style
 * @param item - The block
 * @param seed - The object's seed
 */
export function object(s: Style, item: ObjectItem, seed: number): void {
  switch (item.kind) {
    case "bottle": bottle(s, item, seed); break;
    case "drop": drop(s, item, seed); break;
    case "slide": slide(s, item, seed); break;
    case "well": well(s, item, seed); break;
  }
}

/**
 * A cluster of cells filling a box: cocci as round pieces that may touch like grapes, rods as short bars at mixed
 * angles. Cell size follows the box and the count, so a few cells in a big box are big.
 * @param s - The style
 * @param item - The block
 * @param seed - The cluster's seed
 */
export function cells(s: Style, item: CellsItem, seed: number): void {
  const { x, y, w, h } = item.box;
  const r = rng(seed);
  const radius = Math.max(2.5, 0.35 * Math.sqrt((w * h) / item.count));
  const fill = HEX[item.colour];
  const deep = darken(fill, 0.15);
  const cols = Math.max(1, Math.ceil(Math.sqrt((item.count * w) / h)));
  const rows = Math.max(1, Math.ceil(item.count / cols));
  const cellW = w / cols;
  const cellH = h / rows;
  const big = radius > 8;
  for (let i = 0; i < item.count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const jitter = item.form === "cocci" ? 0.8 : 0.5;
    const cx = x + cellW * (col + 0.5) + (r() - 0.5) * cellW * jitter;
    const cy = y + cellH * (row + 0.5) + (r() - 0.5) * cellH * jitter;
    const colour = i % 3 ? fill : deep;
    if (item.form === "cocci") {
      s.piece(ellipse(cx, cy, radius, radius, 0, 14), { fill: colour, seed: seed + 20 + i, depth: big ? 3 : 1.2, rim: big ? 0.3 : 0.18 });
    } else {
      const angle = (r() - 0.5) * 1.6;
      const len = radius * 2.8;
      const dx = (Math.cos(angle) * len) / 2;
      const dy = (Math.sin(angle) * len) / 2;
      s.piece(limb([[cx - dx, cy - dy, radius * 1.1], [cx + dx, cy + dy, radius * 1.1]], 6), { fill: colour, seed: seed + 20 + i, depth: big ? 3 : 1.2, rim: big ? 0.3 : 0.18, step: Math.max(2.5, radius / 3) });
    }
  }
}

/**
 * A numbered disc.
 * @param s - The style
 * @param x - Centre x
 * @param y - Centre y
 * @param number - The number on it
 * @param colour - The disc colour
 * @param seed - The disc's seed
 */
export function disc(s: Style, x: number, y: number, number: number, colour: PaperColour, seed: number): void {
  s.piece(ellipse(x, y, 20, 20, 0, 22), { fill: HEX[colour], seed, depth: 3 });
  s.text(x, y, String(number), 20, HEX.cream);
}

/**
 * A cut-paper arrow: a strip and a head.
 * @param s - The style
 * @param from - The tail
 * @param to - The tip
 * @param colour - The arrow colour
 * @param seed - The arrow's seed
 */
export function arrow(s: Style, from: Pt, to: Pt, colour: PaperColour, seed: number): void {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const fill = HEX[colour];
  s.strip([from, [to[0] - ux * 12, to[1] - uy * 12]], 5, { fill, seed, depth: 2 });
  const base: Pt = [to[0] - ux * 16, to[1] - uy * 16];
  s.piece([[base[0] - uy * 11, base[1] + ux * 11], [to[0] + ux * 2, to[1] + uy * 2], [base[0] + uy * 11, base[1] - ux * 11]], { fill, seed: seed + 1, depth: 2 });
}

/**
 * A raised paper panel with an optional title inside its top.
 * @param s - The style
 * @param box - The panel's box
 * @param colour - The panel colour
 * @param title - A title, or null
 * @param seed - The panel's seed
 */
export function panel(s: Style, box: Box, colour: PaperColour, title: string | null, seed: number): void {
  s.piece(roundRect(box.x, box.y, box.w, box.h, 14), { fill: HEX[colour], seed, depth: 7, rim: 0.18, step: 24 });
  if (title !== null) s.text(box.x + box.w / 2, box.y + 26, title, 17, HEX["cream-deep"]);
}

/**
 * Jongi's place in the scene until the Blender poses exist: a clearly marked placeholder card the size Jongi would
 * be, naming the pose and the sign text, so a plan that places Jongi still renders and the gap is visible.
 * @param s - The style
 * @param item - The block
 * @param seed - The card's seed
 */
export function jongiPlaceholder(s: Style, item: JongiItem, seed: number): void {
  const w = item.height * 0.62;
  const top = item.y - item.height;
  s.piece(roundRect(item.x - w / 2, top, w, item.height, 12), { fill: HEX["cream-deep"], seed, depth: 4, rim: 0.2 });
  s.piece(ellipse(item.x, top + item.height * 0.3, w * 0.28, w * 0.28, 0, 24), { fill: HEX.red, seed: seed + 1, depth: 2 });
  s.text(item.x, top + item.height * 0.3, "?", Math.max(14, w * 0.3), HEX.cream);
  s.text(item.x, top + item.height * 0.62, "Jongi", Math.max(12, w * 0.18), HEX.plum);
  s.text(item.x, top + item.height * 0.74, item.pose + (item.facing === "left" ? " ←" : " →"), Math.max(10, w * 0.12), HEX.plum, "middle", 600);
  s.text(item.x, top + item.height * 0.88, "placeholder", Math.max(10, w * 0.12), HEX.red, "middle", 600);
  if (item.pose === "sign" && item.signText !== null) {
    const size = Math.max(11, item.height * 0.09);
    const signW = Style.textWidth(item.signText, size) + size * 1.4;
    const signH = size * 2;
    s.piece(roundRect(item.x - signW / 2, top - signH - 6, signW, signH, 4), { fill: HEX.cream, seed: seed + 2, depth: 3 });
    s.text(item.x, top - signH / 2 - 6, item.signText, size, HEX.plum);
  }
}
