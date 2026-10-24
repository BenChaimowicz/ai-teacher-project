import type { OpsSummary } from "@senoy/db/usage";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip } from "@/components/charts/ChartTip";
import { CardEmpty } from "@/components/States";
import { Tip, TipBody } from "@/components/Tip";
import { BUCKET_MS } from "@/lib/range";
import { CHART_INK, OTHER_COLOR } from "@/lib/palette";
import { prefersReducedMotion } from "@/lib/motion";
import { compact, formatInt, formatUsd } from "@/lib/format";
import { cn } from "@/lib/cn";

/** What the stacked bars measure. */
export type SeriesMetric = "cost" | "calls" | "failed";

/** Key used for series folded past the palette. */
export const OTHER_KEY = "Other";

/** One stacked column: the bucket start plus one value per series key. */
type Row = { t: number } & Record<string, number>;

/**
 * Truncates an instant to the start of its UTC hour or day (assumed to match the API's bucketing).
 * @param ms - Epoch ms
 * @param unit - Bucket unit
 * @returns Epoch ms of the bucket start
 */
export function bucketStart(ms: number, unit: "hour" | "day"): number {
  return Math.floor(ms / BUCKET_MS[unit]) * BUCKET_MS[unit];
}

/**
 * Pivots the summary timeseries into stacked rows, filling empty buckets so gaps read as zero, and folding series
 * past the palette into "Other".
 * @param summary - The Overview summary
 * @param shownKeys - Series that keep their own color, in color order
 * @param metric - What to stack
 * @returns Rows ordered by time
 */
function pivot(summary: OpsSummary, shownKeys: string[], metric: SeriesMetric): Row[] {
  const unit = summary.range.bucket;
  const shown = new Set(shownKeys);
  const rows = new Map<number, Row>();
  const blank = (t: number): Row => {
    const row = { t } as Row;
    for (const k of shownKeys) row[k] = 0;
    row[OTHER_KEY] = 0;
    return row;
  };
  const from = bucketStart(new Date(summary.range.from).getTime(), unit);
  const to = new Date(summary.range.to).getTime();
  for (let t = from; t <= to && rows.size < 2000; t += BUCKET_MS[unit]) rows.set(t, blank(t));

  for (const point of summary.timeseries) {
    const t = bucketStart(new Date(point.bucket).getTime(), unit);
    const row = rows.get(t) ?? blank(t);
    rows.set(t, row);
    const key = shown.has(point.key) ? point.key : OTHER_KEY;
    const v = metric === "cost" ? point.costUsd : metric === "calls" ? point.calls : point.failedCalls;
    row[key] = (row[key] ?? 0) + v;
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}

/**
 * Formats a bucket start for the axis / tooltip.
 * @param t - Epoch ms
 * @param unit - Bucket unit
 * @param long - Tooltip form
 */
export function bucketLabel(t: number, unit: "hour" | "day", long = false): string {
  const d = new Date(t);
  if (unit === "day") return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(long ? { weekday: "short" } : {}) });
  return long
    ? d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * Spend (or calls / failed calls) over time, stacked by model. Clicking a column opens Calls for that bucket;
 * clicking a legend item opens Calls for that model; hovering a legend item highlights its series.
 * @param props.summary - Overview summary
 * @param props.keys - Models in color order (biggest spend first), already capped to the palette
 * @param props.color - key → color
 * @param props.onBucket - Column click with the bucket's [from, to)
 * @param props.onKey - Legend click
 */
export function SpendOverTime({
  summary,
  keys,
  color,
  onBucket,
  onKey,
}: {
  summary: OpsSummary;
  keys: string[];
  color: (key: string) => string;
  onBucket: (fromIso: string, toIso: string) => void;
  onKey: (key: string) => void;
}) {
  const [metric, setMetric] = useState<SeriesMetric>("cost");
  const [hovered, setHovered] = useState<string | null>(null);
  const unit = summary.range.bucket;
  const rows = useMemo(() => pivot(summary, keys, metric), [summary, keys, metric]);
  const hasOther = rows.some((r) => r[OTHER_KEY] > 0);
  const series = hasOther ? [...keys, OTHER_KEY] : keys;
  const fmt = (n: number) => (metric === "cost" ? formatUsd(n) : formatInt(n));
  const colorOf = (k: string) => (k === OTHER_KEY ? OTHER_COLOR : color(k));
  const animate = !prefersReducedMotion();
  if (summary.timeseries.length === 0) return <CardEmpty />;

  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="inline-flex rounded-md border bg-secondary p-0.5 text-[11px]">
          {(["cost", "calls", "failed"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                "rounded px-2 py-0.5 transition-colors",
                metric === m ? "bg-ice/15 text-ice" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "cost" ? "Spend" : m === "calls" ? "Calls" : "Failed calls"}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">per {unit} · click a column to open its calls</span>
      </div>
      <div className="h-64 px-2 pt-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={rows}
            margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
            barCategoryGap="18%"
            onClick={(state) => {
              const row = rows[Number(state?.activeIndex)];
              if (row) onBucket(new Date(row.t).toISOString(), new Date(row.t + BUCKET_MS[unit]).toISOString());
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
            <XAxis
              dataKey="t"
              tickFormatter={(t: number) => bucketLabel(t, unit)}
              stroke={CHART_INK.baseline}
              tick={{ fill: CHART_INK.axis, fontSize: 11 }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(n: number) => (metric === "cost" ? `$${compact(n)}` : compact(n))}
              tick={{ fill: CHART_INK.axis, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={52}
            />
            <Tooltip
              cursor={{ fill: "rgba(140,203,245,0.06)" }}
              isAnimationActive={animate}
              animationDuration={180}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const row = payload[0]?.payload as Row | undefined;
                if (!row) return null;
                const items = series.filter((k) => row[k] > 0).sort((a, b) => row[b] - row[a]);
                const total = items.reduce((s, k) => s + row[k], 0);
                return (
                  <ChartTip
                    title={bucketLabel(Number(label), unit, true)}
                    rows={[
                      ...items.map((k) => ({ color: colorOf(k), label: k, value: fmt(row[k]) })),
                      { label: "Total", value: fmt(total), strong: true },
                    ]}
                    footer={items.length ? "Click to see these calls" : "Nothing in this bucket"}
                  />
                );
              }}
            />
            {series.map((k, i) => (
              <Bar
                key={k}
                dataKey={k}
                stackId="s"
                fill={colorOf(k)}
                stroke="#0e1522"
                strokeWidth={1}
                maxBarSize={24}
                radius={i === series.length - 1 ? [3, 3, 0, 0] : 0}
                fillOpacity={hovered && hovered !== k ? 0.25 : 1}
                isAnimationActive={animate}
                animationDuration={500}
                animationEasing="ease-out"
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 px-4 pb-3 pt-1 text-[11px]">
        {series.map((k) => {
          const total = rows.reduce((s, r) => s + (r[k] ?? 0), 0);
          return (
            <li key={k}>
              <Tip
                content={
                  <TipBody title={k} rows={[[metric === "cost" ? "Spend in range" : metric === "calls" ? "Calls" : "Failed calls", fmt(total)]]}>
                    {k === OTHER_KEY ? "Models past the 7th by spend, folded together." : "Click to open Calls for this model."}
                  </TipBody>
                }
              >
                <button
                  type="button"
                  disabled={k === OTHER_KEY}
                  onClick={() => onKey(k)}
                  onMouseEnter={() => setHovered(k)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-1.5 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-ice/[0.06] hover:text-foreground"
                >
                  <span className="size-2.5 rounded-sm" style={{ backgroundColor: colorOf(k) }} />
                  <span className="max-w-[14rem] truncate font-mono">{k}</span>
                </button>
              </Tip>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
