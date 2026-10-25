import { useEffect, useId, useRef, type CSSProperties } from "react";
import { prefersReducedMotion } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";

export type NibblesMood = "idle" | "think" | "cheer";

/*
 * One shared animation loop moves the pupils of every tracking Nibbles toward the pointer,
 * with gentle look-arounds after a few idle seconds.
 */
const tracked = new Set<SVGGElement>();
const pointer = { x: 0, y: 0, last: -1e9 };
const idle = { x: 0, y: 0, next: 0 };
let loopRunning = false;
let listening = false;
const offsets = new WeakMap<SVGGElement, { x: number; y: number }>();

/**
 * Records the pointer position for the eye loop.
 * @param event - Pointer move
 */
function onPointerMove(event: PointerEvent) {
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.last = performance.now();
}

/**
 * Eases each tracked eye group toward its target.
 * @param now - Frame timestamp
 */
function lookTick(now: number) {
  if (tracked.size === 0) {
    loopRunning = false;
    return;
  }
  const isIdle = now - pointer.last > 3500;
  if (isIdle && now > idle.next) {
    const roll = Math.random();
    idle.x = roll < 0.35 ? 0 : (Math.random() - 0.5) * 2;
    idle.y = roll < 0.35 ? 0 : (Math.random() - 0.5) * 1.4;
    idle.next = now + 1800 + Math.random() * 2600;
  }
  tracked.forEach((group) => {
    const svg = group.ownerSVGElement;
    if (!svg) return;
    let tx: number;
    let ty: number;
    if (isIdle) {
      tx = idle.x * 3;
      ty = idle.y * 2.4;
    } else {
      const rect = svg.getBoundingClientRect();
      const dx = pointer.x - (rect.left + rect.width / 2);
      const dy = pointer.y - (rect.top + rect.height * 0.55);
      const distance = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, distance / 220);
      tx = (dx / distance) * 3.4 * k;
      ty = (dy / distance) * 2.6 * k;
    }
    const current = offsets.get(group) ?? { x: 0, y: 0 };
    current.x += (tx - current.x) * 0.14;
    current.y += (ty - current.y) * 0.14;
    offsets.set(group, current);
    group.setAttribute("transform", `translate(${current.x.toFixed(2)} ${current.y.toFixed(2)})`);
  });
  requestAnimationFrame(lookTick);
}

/**
 * Registers an eye group with the shared loop while mounted.
 * @param group - The `<g>` wrapping the eyes
 */
function track(group: SVGGElement) {
  if (prefersReducedMotion()) return () => undefined;
  tracked.add(group);
  if (!listening) {
    addEventListener("pointermove", onPointerMove, { passive: true });
    listening = true;
  }
  if (!loopRunning) {
    loopRunning = true;
    requestAnimationFrame(lookTick);
  }
  return () => {
    tracked.delete(group);
  };
}

type NibblesProps = {
  /** Pixel size (square). */
  size?: number;
  mood?: NibblesMood;
  /** Pupils follow the pointer. */
  track?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Accessible label; omit when decorative. */
  label?: string;
};

/**
 * Nibbles, the companion (hamster). Theme-coloured. Moods: idle, think (bob), cheer (hop).
 */
export function Nibbles({ size = 36, mood = "idle", track: follow = false, className, style, label }: NibblesProps) {
  const uid = useId().replace(/:/g, "");
  const look = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!follow || !look.current) return;
    return track(look.current);
  }, [follow]);

  return (
    <span
      className={cn("nib", mood !== "idle" && `mood-${mood}`, className)}
      style={{ width: size, height: size, ...style }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 120 120">
        <defs>
          <radialGradient id={`${uid}g`} cx="45%" cy="35%" r="70%">
            <stop offset="0" className="hi" />
            <stop offset="1" className="lo" />
          </radialGradient>
        </defs>
        <g className="body-g">
          <g className="ear-l">
            <circle cx="30" cy="40" r="11" className="ear" />
            <circle cx="30" cy="41" r="6" fill="#f9a8d4" opacity=".55" />
          </g>
          <g className="ear-r">
            <circle cx="90" cy="40" r="11" className="ear" />
            <circle cx="90" cy="41" r="6" fill="#f9a8d4" opacity=".55" />
          </g>
          <ellipse cx="60" cy="72" rx="42" ry="37" fill={`url(#${uid}g)`} />
          <ellipse cx="34" cy="82" rx="15" ry="13" className="cheek" opacity=".9" />
          <ellipse cx="86" cy="82" rx="15" ry="13" className="cheek" opacity=".9" />
          <ellipse cx="33" cy="82" rx="6.5" ry="3.6" fill="#f9a8d4" opacity=".45" />
          <ellipse cx="87" cy="82" rx="6.5" ry="3.6" fill="#f9a8d4" opacity=".45" />
          <g ref={look}>
            <g className="eyes">
              <ellipse cx="45" cy="67" rx="7.5" ry="8.4" fill="#1a1433" />
              <ellipse cx="75" cy="67" rx="7.5" ry="8.4" fill="#1a1433" />
              <circle cx="47.4" cy="64.2" r="2.7" fill="#fff" />
              <circle cx="77.4" cy="64.2" r="2.7" fill="#fff" />
              <circle cx="42.4" cy="69.2" r="1.2" fill="#fff" />
              <circle cx="72.4" cy="69.2" r="1.2" fill="#fff" />
            </g>
          </g>
          <path d="M57 76 h6 l-3 3z" fill="#e8799f" />
          <path d="M55 80 q2.5 3 5 0 q2.5 3 5 0" stroke="#3b2a3b" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <ellipse cx="60" cy="97" rx="5" ry="7.5" className="seed" />
          <circle cx="53" cy="98" r="4.5" className="paw" />
          <circle cx="67" cy="98" r="4.5" className="paw" />
        </g>
      </svg>
    </span>
  );
}
