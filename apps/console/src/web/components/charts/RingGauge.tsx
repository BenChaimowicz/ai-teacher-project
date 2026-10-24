import { useId, type ReactNode } from "react";

/**
 * A ring gauge: a cyan→blue gradient arc over a faint track, drawn in on mount.
 * @param props.value - 0..1, or null when undefined
 * @param props.size - Diameter in px
 * @param props.center - Text in the middle (defaults to the percentage)
 * @param props.trackColor - Color of the unfilled part (e.g. faint coral for "failed")
 */
export function RingGauge({
  value,
  size = 84,
  center,
  trackColor = "rgba(148,178,214,0.12)",
}: {
  value: number | null;
  size?: number;
  center?: ReactNode;
  trackColor?: string;
}) {
  const id = useId().replace(/:/g, "");
  const stroke = 8;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="100%" stopColor="#4a9ade" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
        {v > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={`url(#ring-${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - v)}
            className="ring-in"
            style={{ ["--ring-len" as string]: `${len}`, filter: "drop-shadow(0 0 5px rgba(103,232,249,0.45))" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center font-mono text-sm font-semibold tabular-nums">
        {center ?? (value === null ? "—" : `${Math.round(v * 100)}%`)}
      </div>
    </div>
  );
}
