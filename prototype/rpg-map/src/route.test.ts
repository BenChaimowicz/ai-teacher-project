import { describe, expect, it } from "vitest";
import {
  CLUSTER_GAP,
  MIN_REGION_GAP_PX,
  MIN_TRAVEL_IN_GAPS,
  angleAt,
  lengthAt,
  placeFractions,
  placeOnSampler,
  splitRegions,
  type PathSampler,
} from "./route";
import type { Stop } from "./types";

/** Builds stops from a string like "RRQRRQG": R = Reading, Q = Quiz, G = Goal Check. */
function stopsFrom(pattern: string): Stop[] {
  return [...pattern].map((c, i) =>
    c === "R"
      ? { kind: "reading", title: `Reading ${i}`, locationName: `Place ${i}` }
      : c === "Q"
        ? { kind: "quiz", title: `Quiz ${i}`, bossName: `Boss ${i}` }
        : { kind: "goal_check", title: "Goal Check", bossName: "Final Boss" },
  );
}

/** The real Course shape: 12 Readings and 4 Quizzes, then the Goal Check. */
const NORSE16 = "RRRQRRRQRRRQRRRQG";
/** The long test: a Quiz after every second Reading, then the Goal Check. */
const NORSE30 = "RRQ".repeat(10) + "G";

/** A straight horizontal line of length 1000, enough to test sampling without a DOM. */
const line: PathSampler = { length: 1000, pointAt: (len) => ({ x: len, y: 0 }) };

describe("even placement", () => {
  it("spaces every stop equally, first at the start and the Goal Check at the end", () => {
    for (const pattern of ["RRRG", NORSE16, NORSE30]) {
      const t = placeFractions(stopsFrom(pattern), "even");
      const step = 1 / (pattern.length - 1);
      expect(t[0]).toBe(0);
      expect(t[t.length - 1]).toBe(1);
      for (let i = 1; i < t.length; i++) expect(t[i] - t[i - 1]).toBeCloseTo(step, 10);
    }
  });
});

describe("clustered placement", () => {
  it("splits stops into regions of Readings ending in a Quiz, the last region ending in the Goal Check", () => {
    const regions = splitRegions(stopsFrom(NORSE16));
    expect(regions).toEqual([
      { first: 0, last: 3 },
      { first: 4, last: 7 },
      { first: 8, last: 11 },
      { first: 12, last: 15 },
      { first: 16, last: 16 },
    ]);
  });

  it("puts trailing Readings before the Goal Check in the last region with it", () => {
    const regions = splitRegions(stopsFrom("RRQRRG"));
    expect(regions).toEqual([
      { first: 0, last: 2 },
      { first: 3, last: 5 },
    ]);
  });

  it("keeps stops of a region a small fixed gap apart and the Quiz at the region's end", () => {
    const stops = stopsFrom(NORSE16);
    const t = placeFractions(stops, "clustered");
    for (const region of splitRegions(stops)) {
      for (let i = region.first + 1; i <= region.last; i++) {
        expect(t[i] - t[i - 1]).toBeCloseTo(CLUSTER_GAP, 10);
      }
      if (stops[region.last].kind === "quiz") {
        // The Quiz is the last stop of its region: the next stop is a whole travel gap away.
        const next = t[region.last + 1];
        expect(next - t[region.last]).toBeGreaterThan(CLUSTER_GAP * MIN_TRAVEL_IN_GAPS - 1e-9);
      }
    }
  });

  it("shares the rest of the route equally between regions as travel gaps", () => {
    const stops = stopsFrom(NORSE16);
    const regions = splitRegions(stops);
    const t = placeFractions(stops, "clustered");
    const travels = regions.slice(0, -1).map((r, i) => t[regions[i + 1].first] - t[r.last]);
    for (const g of travels) expect(g).toBeCloseTo(travels[0], 10);
    // A 4-stop region spans three gaps, about 6.6% of the route.
    expect(t[3] - t[0]).toBeCloseTo(3 * CLUSTER_GAP, 10);
    // Most of the route's length goes to travel.
    expect(travels.reduce((a, b) => a + b, 0)).toBeGreaterThan(0.5);
  });

  it("starts at the route start and keeps the Goal Check exactly at the end", () => {
    for (const pattern of ["RRRQG", NORSE16, NORSE30, "QQQQG", "RRRRRRRRRRRRRRRRRQG"]) {
      const t = placeFractions(stopsFrom(pattern), "clustered");
      expect(t[0]).toBe(0);
      expect(t[t.length - 1]).toBe(1);
    }
  });

  it("keeps every stop strictly ahead of the previous one, with a minimum gap, even for crowded Courses", () => {
    const crowded = ["Q".repeat(30) + "G", "R".repeat(5) + "Q" + "R".repeat(24) + "G", NORSE30, NORSE16];
    for (const pattern of crowded) {
      const t = placeFractions(stopsFrom(pattern), "clustered");
      for (let i = 1; i < t.length; i++) {
        expect(t[i] - t[i - 1]).toBeGreaterThan(0.004);
      }
    }
  });

  it("keeps at least 46 map px between Readings of a region when the route length is known", () => {
    for (const [pattern, length] of [[NORSE16, 1885], [NORSE30, 1885], [NORSE30, 2700]] as const) {
      const t = placeFractions(stopsFrom(pattern), "clustered", length);
      const stops = stopsFrom(pattern);
      for (const region of splitRegions(stops)) {
        for (let i = region.first + 1; i <= region.last; i++) {
          expect((t[i] - t[i - 1]) * length).toBeGreaterThanOrEqual(MIN_REGION_GAP_PX - 1e-6);
        }
      }
      expect(t[t.length - 1]).toBe(1);
    }
  });

  it("falls back to even spacing when the Course has a single region (no Quiz)", () => {
    const stops = stopsFrom("RRRG");
    expect(placeFractions(stops, "clustered")).toEqual(placeFractions(stops, "even"));
  });
});

describe("sampling", () => {
  it("maps a fraction to an arc length and clamps outside 0–1", () => {
    expect(lengthAt(line, 0.25)).toBe(250);
    expect(lengthAt(line, 2)).toBe(1000);
    expect(lengthAt(line, -1)).toBe(0);
  });

  it("reads the direction of the route", () => {
    expect(angleAt(line, 500)).toBeCloseTo(0, 5);
  });

  it("places stops on the sampled route at their fractions", () => {
    const placed = placeOnSampler(line, stopsFrom("RRG"), "even");
    expect(placed.map((p) => p.x)).toEqual([0, 500, 1000]);
    expect(placed.map((p) => p.t)).toEqual([0, 0.5, 1]);
  });
});
