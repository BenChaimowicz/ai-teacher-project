import type { ReactNode } from "react";
import { Tip } from "@/components/Tip";
import { CardEmpty } from "@/components/States";
import { ACCENT } from "@/lib/palette";
import { cn } from "@/lib/cn";

/** One row of a BarList. */
export type BarListRow = {
  key: string;
  /** Left label (may include an icon or badge). */
  label: ReactNode;
  /** Drives bar length. */
  value: number;
  /** Text at the bar's end. */
  valueLabel: ReactNode;
  /** Muted text after the value (e.g. calls, failure rate). */
  extra?: ReactNode;
  /** Bar color; defaults to the ice-blue accent. */
  color?: string;
  /** Rich tooltip for the row. */
  tip?: ReactNode;
};

/**
 * Horizontal bars as HTML rows: the label, a thin bar scaled to the max, and the value. Every row is a link
 * when `onSelect` is given. Used for spend by step/role and outcome breakdowns.
 * @param props.rows - Rows, already sorted
 * @param props.onSelect - Row click (navigate to filtered Calls)
 */
export function BarList({ rows, onSelect }: { rows: BarListRow[]; onSelect?: (key: string) => void }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (rows.length === 0) return <CardEmpty />;
  return (
    <ul className="space-y-0.5 p-2">
      {rows.map((row, i) => {
        const pct = max > 0 ? Math.max(1.5, (row.value / max) * 100) : 0;
        const content = (
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(row.key)}
            className={cn(
              "group grid w-full grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
              onSelect && "hover:bg-ice/[0.06]",
            )}
          >
            <span className="truncate">{row.label}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-muted/60">
              <span
                className="animate-grow-x absolute inset-y-0 left-0 rounded-full transition-[filter] group-hover:brightness-125"
                style={{ width: `${pct}%`, backgroundColor: row.color ?? ACCENT, animationDelay: `${i * 30}ms` }}
              />
            </span>
            <span className="flex items-baseline justify-end gap-2 whitespace-nowrap tabular-nums">
              {row.valueLabel}
              {row.extra && <span className="text-[11px] text-muted-foreground">{row.extra}</span>}
            </span>
          </button>
        );
        return (
          <li key={row.key}>
            {row.tip ? (
              <Tip content={row.tip} className="block w-full">
                {content}
              </Tip>
            ) : (
              content
            )}
          </li>
        );
      })}
    </ul>
  );
}
