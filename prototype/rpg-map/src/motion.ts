import { useEffect, useRef, useState } from "react";

/** Map pixels per second that the path draws at. */
export const DRAW_SPEED = 520;
/** Shortest and longest time one stop-to-stop segment may take, in milliseconds. */
export const MIN_SEGMENT_MS = 280;
export const MAX_SEGMENT_MS = 900;
/** Back retracts at double speed, with its own bounds. */
export const MIN_RETRACT_MS = 140;
export const MAX_RETRACT_MS = 450;

/** One leg of a path animation, in route lengths (map px). */
export type Segment = { from: number; to: number; ms: number };

/**
 * Builds a cubic-bezier easing function (same maths as CSS `cubic-bezier()`).
 * @param x1 - First control point x
 * @param y1 - First control point y
 * @param x2 - Second control point x
 * @param y2 - Second control point y
 * @returns A function from time 0–1 to progress 0–1
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-6) return sampleY(s);
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    while (lo < hi) {
      const v = sampleX(s);
      if (Math.abs(v - x) < 1e-6) break;
      if (x > v) lo = s;
      else hi = s;
      s = (hi - lo) / 2 + lo;
      if (hi - lo < 1e-7) break;
    }
    return sampleY(s);
  };
}

/** The path-draw easing from design.md: it sets off, travels and arrives. */
export const SEGMENT_EASE = cubicBezier(0.45, 0.05, 0.35, 1);

/**
 * Splits a move along the route into one segment per stop passed, each with its own duration.
 * Forwards: speed-based, at least 280 ms and at most 900 ms per segment. Backwards: one segment at double speed.
 * @param stopLengths - Route length of every stop, ascending
 * @param from - Length drawn now
 * @param to - Length to draw up to
 * @returns The segments in order (empty when nothing moves)
 */
export function planSegments(stopLengths: number[], from: number, to: number): Segment[] {
  if (Math.abs(to - from) < 0.5) return [];
  if (to < from) {
    const ms = clamp(((from - to) / DRAW_SPEED / 2) * 1000, MIN_RETRACT_MS, MAX_RETRACT_MS);
    return [{ from, to, ms }];
  }
  const marks = [from, ...stopLengths.filter((l) => l > from + 0.5 && l < to - 0.5), to];
  const out: Segment[] = [];
  for (let i = 1; i < marks.length; i++) {
    const len = marks[i] - marks[i - 1];
    out.push({ from: marks[i - 1], to: marks[i], ms: clamp((len / DRAW_SPEED) * 1000, MIN_SEGMENT_MS, MAX_SEGMENT_MS) });
  }
  return out;
}

/** Keeps `n` between `lo` and `hi`. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Whether the user asked the system for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The length of route drawn right now, animated towards `target` one stop-to-stop segment at a time.
 * When `drawKey` changes the path is cleared to 0 and drawn again up to `target`; otherwise only the new part is
 * drawn (forwards) or retracted (backwards). With reduced motion the path jumps.
 * @param stopLengths - Route length of every stop, ascending
 * @param target - The length to reach
 * @param drawKey - Changing this redraws from zero (Replay, Course, placement or route change)
 * @returns The drawn length and whether the head is still travelling
 */
export function useRouteDraw(stopLengths: number[], target: number, drawKey: string): { drawn: number; moving: boolean } {
  const [state, setState] = useState({ key: drawKey, value: 0 });
  const drawn = useRef(0);
  const lastKey = useRef(drawKey);

  useEffect(() => {
    if (lastKey.current !== drawKey) {
      lastKey.current = drawKey;
      drawn.current = 0;
    }
    const segments = prefersReducedMotion() ? [{ from: drawn.current, to: target, ms: 0 }] : planSegments(stopLengths, drawn.current, target);
    if (segments.length === 0) {
      drawn.current = target;
      setState({ key: drawKey, value: target });
      return;
    }
    const start = performance.now();
    let frame = 0;
    const total = segments.reduce((sum, s) => sum + s.ms, 0);
    const tick = (now: number) => {
      let elapsed = now - start;
      let value = target;
      if (elapsed < total) {
        for (const seg of segments) {
          if (elapsed < seg.ms) {
            value = seg.from + (seg.to - seg.from) * SEGMENT_EASE(elapsed / seg.ms);
            break;
          }
          elapsed -= seg.ms;
        }
        frame = requestAnimationFrame(tick);
      }
      drawn.current = value;
      setState({ key: drawKey, value });
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [stopLengths, target, drawKey]);

  const value = state.key === drawKey ? state.value : 0;
  return { drawn: value, moving: Math.abs(value - target) > 0.5 };
}
