import { useEffect, useRef, useState } from "react";

/**
 * Whether the user asked the OS for reduced motion.
 * @returns True when animations should be skipped
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Animates a number from its previous value to `target` (ease-out), for KPI count-ups.
 * @param target - The value to land on
 * @param durationMs - Animation length
 * @returns The current animated value
 */
export function useCountUp(target: number, durationMs = 550): number {
  const [value, setValue] = useState(prefersReducedMotion() ? target : 0);
  const fromRef = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion() || !Number.isFinite(target)) {
      setValue(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      setValue(next);
      fromRef.current = next;
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}
