import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/cheer.ts";

/**
 * Counts from 0 to a value with an ease-out. Reduced motion shows the value at once.
 * @param to - Final value
 * @param durationMs - How long the count takes
 * @param delayMs - Wait before starting
 */
export function useCountUp(to: number, durationMs = 1000, delayMs = 250) {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? to : 0));

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    let frame = 0;
    let start = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / durationMs);
      setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    const timer = window.setTimeout(() => {
      frame = requestAnimationFrame(step);
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [to, durationMs, delayMs]);

  return value;
}

/**
 * A number that counts up. Screen readers get the final value only.
 * @param to - Final value
 * @param format - Turns the running value into text (e.g. minutes, a suffix)
 */
export function CountUp({ to, format = String, durationMs, delayMs }: { to: number; format?: (value: number) => string; durationMs?: number; delayMs?: number }) {
  const value = useCountUp(to, durationMs, delayMs);
  return (
    <>
      <span aria-hidden="true">{format(value)}</span>
      <span className="sr-only">{format(to)}</span>
    </>
  );
}
