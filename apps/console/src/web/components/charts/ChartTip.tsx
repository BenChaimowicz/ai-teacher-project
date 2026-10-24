import type { ReactNode } from "react";

/**
 * The shared look of chart hover tooltips (recharts `content`), so they match the rich `Tip` tooltips.
 * @param props.title - First line (bucket time, model id…)
 * @param props.rows - Lines: optional swatch color, label, value
 * @param props.footer - Muted hint, e.g. "Click to see these calls"
 */
export function ChartTip({
  title,
  rows,
  footer,
}: {
  title: ReactNode;
  rows: { color?: string; label: ReactNode; value: ReactNode; strong?: boolean }[];
  footer?: ReactNode;
}) {
  return (
    <div className="animate-pop-in min-w-[12rem] max-w-[22rem] rounded-lg border bg-popover px-3 py-2 text-xs shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md">
      <div className="mb-1.5 font-semibold">{title}</div>
      <div className="space-y-0.5">
        {rows.map((row, i) => (
          <div key={i} className={row.strong ? "flex items-center gap-2 border-t pt-1 font-medium" : "flex items-center gap-2"}>
            {row.color ? (
              <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
            ) : (
              <span className="size-2.5 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{row.label}</span>
            <span className="tabular-nums">{row.value}</span>
          </div>
        ))}
      </div>
      {footer && <div className="mt-1.5 text-[11px] text-ice/80">{footer}</div>}
    </div>
  );
}
