/** Numbers from `.teamwork/design.md` that the map uses: marker sizes, art anchors, halo padding. */

/** The six marker pieces of art, by file name without ".svg". */
export type ArtName = "hero" | "location" | "location-visited" | "location-locked" | "boss" | "final-boss";

/** viewBox size of each art file and the vertical anchor (fraction of height) that sits on the stop. */
export const ART_BOX: Record<ArtName, { w: number; h: number; anchorY: number }> = {
  hero: { w: 64, h: 80, anchorY: 0.925 },
  location: { w: 64, h: 64, anchorY: 0.906 },
  "location-visited": { w: 64, h: 64, anchorY: 0.906 },
  "location-locked": { w: 64, h: 64, anchorY: 0.906 },
  boss: { w: 64, h: 80, anchorY: 0.925 },
  "final-boss": { w: 64, h: 80, anchorY: 0.925 },
};

/** Marker widths in screen pixels. */
export type MarkerPx = { reading: number; boss: number; finalBoss: number; hero: number; flag: number };

const PHONE_PX: MarkerPx = { reading: 20, boss: 30, finalBoss: 40, hero: 26, flag: 14 };
const DESKTOP_PX: MarkerPx = { reading: 40, boss: 60, finalBoss: 84, hero: 46, flag: 28 };

/**
 * Marker widths in screen pixels for a map that is `mapWidth` CSS pixels wide: phone sizes at 390 or less, desktop
 * sizes at 820 or more, linear in between (design.md, "Marker sizes").
 * @param mapWidth - Rendered width of the map in CSS pixels
 * @returns Widths in screen pixels
 */
export function markerPx(mapWidth: number): MarkerPx {
  const k = Math.min(1, Math.max(0, (mapWidth - 390) / 430));
  const mix = (a: number, b: number) => a + (b - a) * k;
  return {
    reading: mix(PHONE_PX.reading, DESKTOP_PX.reading),
    boss: mix(PHONE_PX.boss, DESKTOP_PX.boss),
    finalBoss: mix(PHONE_PX.finalBoss, DESKTOP_PX.finalBoss),
    hero: mix(PHONE_PX.hero, DESKTOP_PX.hero),
    flag: mix(PHONE_PX.flag, DESKTOP_PX.flag),
  };
}

/** An ellipse in map pixels, rotated by `angle` degrees about its centre. */
export type HaloEllipse = { cx: number; cy: number; rx: number; ry: number; angle: number };

/**
 * The paper patch behind a clustered region: an ellipse around the stop anchors, padded 42 map px left and right and
 * 38 map px top and bottom, centred 14 map px above the anchors' midpoint and turned to the first-to-last direction.
 * @param anchors - Anchor points of the region's stops, in route order (at least two)
 * @returns The ellipse
 */
export function haloEllipse(anchors: { x: number; y: number }[]): HaloEllipse {
  const a = anchors[0];
  const b = anchors[anchors.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  // Anchors that wander off the straight line get room too.
  const wander = anchors.reduce((m, p) => Math.max(m, dist === 0 ? 0 : Math.abs(((p.x - a.x) * dy - (p.y - a.y) * dx) / dist)), 0);
  return {
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2 - 14,
    rx: dist / 2 + 42,
    ry: 38 + wander,
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
  };
}
