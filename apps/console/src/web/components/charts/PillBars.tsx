import type { OpsBreakdownRow } from "@senoy/db/usage";
import type { ReactNode } from "react";
import { Tip } from "@/components/Tip";
import { CardEmpty } from "@/components/States";
import { formatInt, formatPct, formatUsd, ratio } from "@/lib/format";

/**
 * Abbreviates a model id or provider name for a pill: `anthropic/claude-sonnet-4.5` → `CS4`, `Alibaba` → `ALI`.
 * @param key - Model id, adapter, or provider
 * @returns 2–3 uppercase characters
 */
export function abbreviate(key: string): string {
  const name = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
  const parts = name.split(/[-:._\s]+/).filter(Boolean);
  if (parts.length <= 1) return (parts[0] ?? key).slice(0, 3).toUpperCase();
  return parts
    .slice(0, 3)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

/**
 * Rows of "pill badge · proportional bar with `calls · success%` inside · $ right-aligned in monospace", for a
 * quick scan of spend by model or provider. Rows open Calls filtered by that key.
 * @param props.rows - Breakdown rows
 * @param props.color - Pill/bar color per key
 * @param props.onSelect - Row click
 * @param props.tipFor - Rich tooltip per row
 */
export function PillBars({
  rows,
  color,
  onSelect,
  tipFor,
}: {
  rows: OpsBreakdownRow[];
  color: (key: string) => string;
  onSelect: (key: string) => void;
  tipFor?: (row: OpsBreakdownRow) => ReactNode;
}) {
  const sorted = [...rows].sort((a, b) => b.totalUsd - a.totalUsd || b.calls - a.calls);
  const max = Math.max(0, ...sorted.map((r) => r.totalUsd));
  if (sorted.length === 0) return <CardEmpty />;
  return (
    <ul className="space-y-1.5 p-3">
      {sorted.map((r, i) => {
        const c = color(r.key);
        const success = ratio(r.calls - r.failedCalls, r.calls);
        return (
          <li key={r.key}>
            <Tip content={tipFor?.(r) ?? null} className="block w-full">
              <button
                type="button"
                onClick={() => onSelect(r.key)}
                className="group grid w-full grid-cols-[3rem_1fr_auto] items-center gap-3 rounded-xl px-1.5 py-1 text-left transition-colors hover:bg-ice/[0.05]"
              >
                <span
                  className="grid h-7 place-items-center rounded-full font-mono text-[10px] font-bold ring-1"
                  style={{ color: c, backgroundColor: `${c}1f`, ["--tw-ring-color" as string]: `${c}66` }}
                  title={r.key}
                >
                  {abbreviate(r.key || "none")}
                </span>
                <span className="relative h-6 overflow-hidden rounded-lg bg-muted/50">
                  <span
                    className="animate-grow-x absolute inset-y-0 left-0 rounded-lg transition-[filter] group-hover:brightness-125"
                    style={{
                      width: `${max ? Math.max(3, (r.totalUsd / max) * 100) : 0}%`,
                      background: `linear-gradient(90deg, ${c}cc, ${c}88)`,
                      animationDelay: `${i * 40}ms`,
                    }}
                  />
                  <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[10px] text-foreground/90 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)]">
                    {formatInt(r.calls)} · {formatPct(success, 0)}
                  </span>
                </span>
                <span className="w-20 text-right font-mono text-xs tabular-nums">
                  {r.estimatedUsd > 0 && r.actualUsd === 0 ? <span className="italic text-est">~{formatUsd(r.totalUsd)}</span> : formatUsd(r.totalUsd)}
                </span>
              </button>
            </Tip>
          </li>
        );
      })}
    </ul>
  );
}
