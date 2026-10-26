import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

export type SegmentState = "todo" | "done" | "now" | "writing" | "miss";

/**
 * One paper pip per lesson (or step). Pass states in order.
 * @param segments - Segment states
 * @param label - Accessible summary, e.g. "3 of 6 lessons done"
 */
export function SegmentedProgress({ segments, label, className }: { segments: SegmentState[]; label: string; className?: string }) {
  return (
    <div className={cn("k-segs", className)} role="img" aria-label={label}>
      {segments.map((state, index) => (
        <i key={index} className={state === "todo" ? undefined : state} />
      ))}
    </div>
  );
}

/**
 * A ribbon in a cut track, notched at its end.
 * @param value - 0 to 1
 */
export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div
      className={cn("k-bar", className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

type RingProps = {
  /** 0 to 1 */
  value: number;
  size?: number;
  stroke?: number;
  label: string;
  /** Text in the middle; defaults to the percentage. Pass null for none. */
  children?: ReactNode;
  className?: string;
};

/**
 * Circular progress cut into paper segments (daily goal, course done): 5 segments under 48px, 10 above.
 * The cuts are a mask, so the ring sits on any surface.
 */
export function ProgressRing({ value, size = 64, stroke = 5, label, children, className }: RingProps) {
  const uid = useId().replace(/:/g, "");
  const pct = Math.max(0, Math.min(1, value));
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const segments = size < 48 ? 5 : 10;
  const seg = circumference / segments;
  const cut = Math.max(1.5, stroke * 0.36);
  return (
    <div
      className={cn("k-ring", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
    >
      <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <defs>
          <mask id={`${uid}cut`} maskUnits="userSpaceOnUse" x="0" y="0" width={size} height={size}>
            {/* White keeps, the gaps cut. The offset centres a cut on the start (12 o'clock). */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="#fff"
              strokeWidth={stroke + 2}
              strokeDasharray={`${seg - cut} ${cut}`}
              strokeDashoffset={-cut / 2}
            />
          </mask>
        </defs>
        <g mask={`url(#${uid}cut)`}>
          <circle className="track" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
          <circle
            className="val"
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
          />
        </g>
      </svg>
      {children === null ? null : <span className="label">{children ?? `${Math.round(pct * 100)}%`}</span>}
    </div>
  );
}
