/**
 * Flat geometry for cut-paper shapes: a seeded random source, outlines for the basic cuts (ellipses, lumpy blobs,
 * rounded boxes, tapered limbs, Bézier outlines), and the resampling that turns a smooth outline into scissor facets.
 */

/** A point on the canvas. */
export type Pt = [number, number];

/** A point on a limb's centreline with the limb's width there. */
export type Knot = [number, number, number];

/** The box around some points. */
export type Bounds = { x0: number; y0: number; x1: number; y1: number };

/**
 * A small seeded random source (mulberry32), so the same plan cuts the same paper every time.
 * @param seed - Any integer
 * @returns A function giving the next number in [0, 1)
 */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The point `t` of the way from `a` to `b`.
 * @param a - Start
 * @param b - End
 * @param t - 0 to 1
 */
export function lerp(a: Pt, b: Pt, t: number): Pt {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Distance between two points.
 * @param a - One point
 * @param b - The other
 */
export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/**
 * Resamples a closed outline into roughly equal facets; each facet is one scissor cut once Rough.js jitters it.
 * @param pts - The closed outline
 * @param step - The facet length in canvas units
 */
export function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const k = Math.max(1, Math.round(dist(a, b) / step));
    for (let j = 0; j < k; j++) out.push(lerp(a, b, j / k));
  }
  return out;
}

/**
 * The length of a closed outline.
 * @param pts - The outline
 */
export function perimeter(pts: Pt[]): number {
  let total = 0;
  for (let i = 0; i < pts.length; i++) total += dist(pts[i], pts[(i + 1) % pts.length]);
  return total;
}

/**
 * An ellipse outline.
 * @param cx - Centre x
 * @param cy - Centre y
 * @param rx - Horizontal radius
 * @param ry - Vertical radius
 * @param rotation - Radians
 * @param n - Points on the outline
 */
export function ellipse(cx: number, cy: number, rx: number, ry: number, rotation = 0, n = 48): Pt[] {
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return [cx + x * c - y * s, cy + x * s + y * c] as Pt;
  });
}

/**
 * A lumpy blob outline, the shape of a clump of leaves.
 * @param cx - Centre x
 * @param cy - Centre y
 * @param rx - Horizontal radius
 * @param ry - Vertical radius
 * @param seed - Which lumps
 * @param lump - How far the lumps reach, as a share of the radius
 * @param lobes - How many lumps around the outline
 */
export function blob(cx: number, cy: number, rx: number, ry: number, seed: number, lump = 0.18, lobes = 7): Pt[] {
  const r = rng(seed);
  const phase = [r() * 6.28, r() * 6.28, r() * 6.28];
  return Array.from({ length: 64 }, (_, i) => {
    const a = (i / 64) * Math.PI * 2;
    const k = 1 + lump * (0.6 * Math.sin(lobes * a + phase[0]) + 0.3 * Math.sin((lobes + 3) * a + phase[1]) + 0.1 * Math.sin(2 * a + phase[2]));
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k] as Pt;
  });
}

/**
 * A rounded rectangle outline.
 * @param x - Left
 * @param y - Top
 * @param w - Width
 * @param h - Height
 * @param radius - Corner radius, clamped to half the shorter side
 */
export function roundRect(x: number, y: number, w: number, h: number, radius: number): Pt[] {
  const r = Math.min(radius, w / 2, h / 2);
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * Math.PI / 2;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x + w - r, y + r, -Math.PI / 2);
  corner(x + w - r, y + h - r, 0);
  corner(x + r, y + h - r, Math.PI / 2);
  corner(x + r, y + r, Math.PI);
  return out;
}

/**
 * Points along a cubic Bézier curve, excluding its end point so curves can be chained.
 * @param p0 - Start
 * @param p1 - First control point
 * @param p2 - Second control point
 * @param p3 - End
 * @param n - Points
 */
export function bezier(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 12): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    const x = u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0];
    const y = u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1];
    return [x, y] as Pt;
  });
}

/**
 * A closed outline made of chained cubic curves: each segment runs from the previous end point through two control
 * points to its own end point, and the last segment ends where the first began.
 * @param start - The first point
 * @param segments - Control point pairs and end points
 */
export function curve(start: Pt, segments: [Pt, Pt, Pt][]): Pt[] {
  const out: Pt[] = [];
  let from = start;
  for (const [c1, c2, to] of segments) {
    out.push(...bezier(from, c1, c2, to));
    from = to;
  }
  return out;
}

/**
 * The outline of a tapered limb (a root, a branch, a serpent, an arm): a smoothed centreline of knots, each with its
 * width there, closed with round caps. Two knots make a rounded bar.
 * @param knots - At least two [x, y, width] knots
 * @param capSteps - Points on each end cap
 */
export function limb(knots: Knot[], capSteps = 8): Pt[] {
  const centre: Knot[] = [];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = knots[Math.max(0, i - 1)];
    const p1 = knots[i];
    const p2 = knots[i + 1];
    const p3 = knots[Math.min(knots.length - 1, i + 2)];
    for (let s = 0; s < 8; s++) {
      const t = s / 8;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (k: number) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      centre.push([f(0), f(1), f(2)]);
    }
  }
  centre.push(knots[knots.length - 1]);
  const normal = (i: number): Pt => {
    const a = centre[Math.max(0, i - 1)];
    const b = centre[Math.min(centre.length - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  centre.forEach((c, i) => {
    const n = normal(i);
    const w = c[2] / 2;
    left.push([c[0] + n[0] * w, c[1] + n[1] * w]);
    right.push([c[0] - n[0] * w, c[1] - n[1] * w]);
  });
  const cap = (c: Knot, n: Pt): Pt[] => {
    const out: Pt[] = [];
    const w = c[2] / 2;
    const base = Math.atan2(n[1], n[0]);
    for (let s = 1; s < capSteps; s++) {
      const a = base - (s / capSteps) * Math.PI;
      out.push([c[0] + Math.cos(a) * w, c[1] + Math.sin(a) * w]);
    }
    return out;
  };
  const last = centre.length - 1;
  const first = normal(0);
  return [...left, ...cap(centre[last], normal(last)), ...right.reverse(), ...cap(centre[0], [-first[0], -first[1]])];
}

/**
 * The box around some points.
 * @param pts - At least one point
 */
export function bounds(pts: Pt[]): Bounds {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

/**
 * Points drawn in a local frame moved onto the canvas: scaled, rotated, then translated.
 * @param pts - Local points
 * @param tx - Where the local origin lands
 * @param ty - Where the local origin lands
 * @param scale - Uniform scale
 * @param degrees - Rotation
 * @param mirror - Flips the local x axis, so a creature drawn facing right faces left
 */
export function place(pts: Pt[], tx: number, ty: number, scale = 1, degrees = 0, mirror = false): Pt[] {
  const a = (degrees * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const m = mirror ? -1 : 1;
  return pts.map(([x, y]) => [tx + (x * m * c - y * s) * scale, ty + (x * m * s + y * c) * scale]);
}

/**
 * Knots moved onto the canvas the way {@link place} moves points; widths scale too.
 * @param knots - Local knots
 * @param tx - Where the local origin lands
 * @param ty - Where the local origin lands
 * @param scale - Uniform scale
 * @param mirror - Flips the local x axis
 */
export function placeKnots(knots: Knot[], tx: number, ty: number, scale = 1, mirror = false): Knot[] {
  const m = mirror ? -1 : 1;
  return knots.map(([x, y, w]) => [tx + x * m * scale, ty + y * scale, w * scale]);
}
