import { describe, expect, it } from "vitest";
import { MAX_RETRACT_MS, MAX_SEGMENT_MS, MIN_SEGMENT_MS, SEGMENT_EASE, cubicBezier, planSegments } from "./motion";
import { haloEllipse, markerPx } from "./design";

describe("path easing", () => {
  it("starts at 0, ends at 1 and never goes backwards", () => {
    expect(SEGMENT_EASE(0)).toBe(0);
    expect(SEGMENT_EASE(1)).toBe(1);
    let last = 0;
    for (let i = 1; i <= 100; i++) {
      const v = SEGMENT_EASE(i / 100);
      expect(v).toBeGreaterThanOrEqual(last - 1e-9);
      last = v;
    }
  });

  it("matches the identity curve for a straight cubic-bezier", () => {
    const linear = cubicBezier(0.25, 0.25, 0.75, 0.75);
    expect(linear(0.3)).toBeCloseTo(0.3, 4);
  });
});

describe("planSegments", () => {
  const stops = [0, 100, 600, 700];

  it("draws one segment per stop passed, with the speed-based time clamped to 280–900 ms", () => {
    const segs = planSegments(stops, 0, 700);
    expect(segs.map((s) => [s.from, s.to])).toEqual([[0, 100], [100, 600], [600, 700]]);
    for (const s of segs) {
      expect(s.ms).toBeGreaterThanOrEqual(MIN_SEGMENT_MS);
      expect(s.ms).toBeLessThanOrEqual(MAX_SEGMENT_MS);
    }
    expect(segs[0].ms).toBe(MIN_SEGMENT_MS); // 100 px is under the minimum
    expect(segs[1].ms).toBe(MAX_SEGMENT_MS); // 500 px would take 961 ms, capped
  });

  it("draws only the new segment when stepping forward one stop", () => {
    expect(planSegments(stops, 100, 600)).toEqual([{ from: 100, to: 600, ms: expect.any(Number) }]);
  });

  it("retracts in one segment at double speed", () => {
    const [seg] = planSegments(stops, 600, 100);
    expect(seg).toMatchObject({ from: 600, to: 100 });
    expect(seg.ms).toBe(MAX_RETRACT_MS); // 481 ms at double speed, capped
    expect(planSegments(stops, 200, 100)[0].ms).toBeCloseTo(Math.max(140, (100 / 520 / 2) * 1000), 3); // 96 ms, raised to the 140 ms floor
  });

  it("does nothing when the path is already there", () => {
    expect(planSegments(stops, 600, 600)).toEqual([]);
  });
});

describe("marker sizes", () => {
  it("is the phone set at 390 px, the desktop set at 820 px and linear between", () => {
    expect(markerPx(390)).toEqual({ reading: 20, boss: 30, finalBoss: 40, hero: 26, flag: 14 });
    expect(markerPx(820)).toEqual({ reading: 40, boss: 60, finalBoss: 84, hero: 46, flag: 28 });
    expect(markerPx(605).reading).toBeCloseTo(30, 6);
    expect(markerPx(200).reading).toBe(20);
    expect(markerPx(2000).finalBoss).toBe(84);
  });
});

describe("region halo", () => {
  it("pads 42 px along the region and 38 px across, centred 14 px above the midpoint", () => {
    const h = haloEllipse([{ x: 100, y: 200 }, { x: 150, y: 200 }, { x: 200, y: 200 }]);
    expect(h).toEqual({ cx: 150, cy: 186, rx: 92, ry: 38, angle: 0 });
  });
});
