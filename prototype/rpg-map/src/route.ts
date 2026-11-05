import type { Placement, PlacementMode, Stop } from "./types";

/** In clustered mode: the gap between two neighbouring stops of one region, as a fraction of the route length. */
export const CLUSTER_GAP = 0.022;

/** In clustered mode: the in-region gap is never smaller than this many map pixels (design.md: Readings must not hide each other). */
export const MIN_REGION_GAP_PX = 46;

/** In clustered mode: the travel gap between regions is never smaller than this many in-region gaps. */
export const MIN_TRAVEL_IN_GAPS = 2;

/** Something that can measure a path: its total length and the point and direction at a given length. */
export type PathSampler = {
  length: number;
  pointAt: (len: number) => { x: number; y: number };
};

/** A group of stop indexes that sit close together on the map. */
export type Region = { first: number; last: number };

/**
 * Splits stops into regions: each region is the Readings up to and including the next Quiz. The trailing
 * Readings before the Goal Check form the last region together with the Goal Check.
 * @param stops - The Course stops, Goal Check last
 * @returns The regions, in order, covering every stop exactly once
 */
export function splitRegions(stops: Stop[]): Region[] {
  const regions: Region[] = [];
  let first = 0;
  stops.forEach((stop, i) => {
    if (stop.kind === "quiz" || i === stops.length - 1) {
      regions.push({ first, last: i });
      first = i + 1;
    }
  });
  if (first < stops.length) regions.push({ first, last: stops.length - 1 });
  return regions;
}

/**
 * Works out where each stop sits along the route as a 0–1 arc-length fraction. Pure: no DOM needed.
 * Even mode spaces every stop equally, first at the start and last (the Goal Check) at the end.
 * Clustered mode keeps stops of a region a small fixed gap apart, gives the rest of the route to equal travel
 * gaps between regions, puts the Quiz at the end of its region and the Goal Check at the end of the route.
 * @param stops - The Course stops, Goal Check last
 * @param mode - "even" or "clustered"
 * @param routeLength - Route length in map pixels; when given, the in-region gap is at least MIN_REGION_GAP_PX
 * @returns One fraction per stop, ascending, the first 0 and the last 1
 */
export function placeFractions(stops: Stop[], mode: PlacementMode, routeLength?: number): number[] {
  const n = stops.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  const even = stops.map((_, i) => i / (n - 1));
  if (mode === "even") return even;

  const regions = splitRegions(stops);
  const r = regions.length;
  // One region means no travel gaps to share out, so the whole route is the region: same as even.
  if (r < 2) return even;

  const inRegionGaps = n - r;
  // Shrink the in-region gap if needed so a travel gap is never under MIN_TRAVEL_IN_GAPS in-region gaps.
  const wanted = routeLength ? Math.max(CLUSTER_GAP, MIN_REGION_GAP_PX / routeLength) : CLUSTER_GAP;
  const gap =
    inRegionGaps === 0
      ? 0
      : Math.min(wanted, 1 / (inRegionGaps + MIN_TRAVEL_IN_GAPS * (r - 1)));
  const travel = (1 - inRegionGaps * gap) / (r - 1);

  const out: number[] = new Array(n);
  let cursor = 0;
  regions.forEach((region, ri) => {
    for (let i = region.first; i <= region.last; i++) {
      out[i] = cursor + (i - region.first) * gap;
    }
    cursor += (region.last - region.first) * gap + (ri < r - 1 ? travel : 0);
  });
  out[n - 1] = 1; // absorb floating point drift: the Goal Check is exactly at the end
  return out;
}

/**
 * The arc length (in map units) that a 0–1 fraction of the route sits at.
 * @param sampler - The measured route
 * @param t - Fraction of the route, 0–1
 * @returns The length along the route
 */
export function lengthAt(sampler: PathSampler, t: number): number {
  return Math.min(1, Math.max(0, t)) * sampler.length;
}

/**
 * The direction of the route at a length, in degrees, from two nearby samples.
 * @param sampler - The measured route
 * @param len - Length along the route
 * @returns The angle in degrees (0 = pointing right)
 */
export function angleAt(sampler: PathSampler, len: number): number {
  const a = sampler.pointAt(Math.max(0, len - 2));
  const b = sampler.pointAt(Math.min(sampler.length, len + 2));
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

/**
 * Places every stop on a measured route.
 * @param sampler - The measured route (its length sets the minimum in-region gap in clustered mode)
 * @param stops - The Course stops, Goal Check last
 * @param mode - "even" or "clustered"
 * @returns One placement per stop: map x/y, route angle and arc-length fraction t
 */
export function placeOnSampler(sampler: PathSampler, stops: Stop[], mode: PlacementMode): Placement[] {
  return placeFractions(stops, mode, sampler.length).map((t) => {
    const len = lengthAt(sampler, t);
    const p = sampler.pointAt(len);
    return { x: p.x, y: p.y, angle: angleAt(sampler, len), t };
  });
}

const samplerCache = new Map<string, PathSampler>();

/**
 * Measures an SVG path with an offscreen path element (browser only). Results are cached per path.
 * @param d - The SVG path data
 * @returns A sampler for that path
 */
export function createDomSampler(d: string): PathSampler {
  const cached = samplerCache.get(d);
  if (cached) return cached;
  try {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.cssText = "position:absolute;visibility:hidden;pointer-events:none";
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
    document.body.appendChild(svg);
    const sampler: PathSampler = {
      length: path.getTotalLength(),
      pointAt: (len) => {
        const p = path.getPointAtLength(len);
        return { x: p.x, y: p.y };
      },
    };
    samplerCache.set(d, sampler);
    return sampler;
  } catch (error) {
    throw new Error(
      `[route: createDomSampler] Failed to measure the route path || d=${d.slice(0, 40)} || ${(error as Error).message}`,
    );
  }
}

/**
 * Places stops along an SVG path (browser only).
 * @param d - The SVG path data of the route
 * @param stops - The Course stops, Goal Check last
 * @param mode - "even" or "clustered"
 * @returns One placement per stop
 */
export function placeStops(d: string, stops: Stop[], mode: PlacementMode): Placement[] {
  return placeOnSampler(createDomSampler(d), stops, mode);
}
