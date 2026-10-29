import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

const TINTS = ["cream", "apricot", "plum", "gold"] as const;

/**
 * A strip of washi tape across the middle of a sheet's top edge. Place it inside a positioned parent that
 * doesn't clip (`position: relative`, no `overflow: hidden`). Tint, width and angle come from `seed`, so
 * each tape on a page looks different but stays the same across renders.
 */
export function Tape({ seed }: { seed: string }) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  // murmur3's finaliser, salted per choice, so the choices don't move together
  const pick = (n: number, salt: number) => {
    let x = h ^ Math.imul(salt, 0x9e3779b9);
    x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
    x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
    return ((x ^ (x >>> 16)) >>> 0) % n;
  };

  const style = {
    "--tape-r": `${(pick(6, 2) + 2) * (pick(2, 3) ? 1 : -1)}deg`, // 2–7°, either way
    "--tape-w": `${64 + pick(32, 5)}px`,
  } as CSSProperties;
  return <span className={cn("k-tape", TINTS[pick(4, 6)])} aria-hidden="true" style={style} />;
}
