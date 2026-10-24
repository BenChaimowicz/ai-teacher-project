import type { OpsSummary } from "@senoy/db/usage";
import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip } from "@/components/charts/ChartTip";
import { CardEmpty } from "@/components/States";
import { bucketLabel, bucketStart } from "@/components/charts/SpendOverTime";
import { BUCKET_MS } from "@/lib/range";
import { CHART_INK } from "@/lib/palette";
import { prefersReducedMotion } from "@/lib/motion";
import { compact, formatInt, formatUsd } from "@/lib/format";

/** One point of the hero chart. */
type Point = { t: number; cost: number; calls: number; failed: number };

/**
 * Sums the per-model timeseries into one spend line per bucket, filling empty buckets with zero.
 * @param summary - The Overview summary
 * @returns Points ordered by time
 */
function totals(summary: OpsSummary): Point[] {
  const unit = summary.range.bucket;
  const map = new Map<number, Point>();
  const from = bucketStart(new Date(summary.range.from).getTime(), unit);
  const to = new Date(summary.range.to).getTime();
  for (let t = from; t <= to && map.size < 2000; t += BUCKET_MS[unit]) map.set(t, { t, cost: 0, calls: 0, failed: 0 });
  for (const p of summary.timeseries) {
    const t = bucketStart(new Date(p.bucket).getTime(), unit);
    const point = map.get(t) ?? { t, cost: 0, calls: 0, failed: 0 };
    point.cost += p.costUsd;
    point.calls += p.calls;
    point.failed += p.failedCalls;
    map.set(t, point);
  }
  return [...map.values()].sort((a, b) => a.t - b.t);
}

/**
 * The hero spend chart: a glowing cyan→blue line over a gradient fill fading to transparent, dashed faint grid.
 * Clicking a point opens Calls for that bucket.
 * @param props.summary - The Overview summary
 * @param props.onBucket - Click with the bucket's [from, to)
 */
export function SpendArea({ summary, onBucket }: { summary: OpsSummary; onBucket: (fromIso: string, toIso: string) => void }) {
  const id = useId().replace(/:/g, "");
  const data = useMemo(() => totals(summary), [summary]);
  const unit = summary.range.bucket;
  const animate = !prefersReducedMotion();
  if (summary.timeseries.length === 0) return <CardEmpty text="No spend yet in this range. The line appears as soon as calls are recorded." />;
  return (
    <div className="glow-line h-56">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data}
          margin={{ top: 10, right: 8, bottom: 0, left: 0 }}
          onClick={(state) => {
            const p = data[Number(state?.activeIndex)];
            if (p) onBucket(new Date(p.t).toISOString(), new Date(p.t + BUCKET_MS[unit]).toISOString());
          }}
          style={{ cursor: "pointer" }}
        >
          <defs>
            <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
            </linearGradient>
            <linearGradient id={`line-${id}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4a9ade" />
              <stop offset="100%" stopColor="#67e8f9" />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} strokeDasharray="3 6" />
          <XAxis
            dataKey="t"
            tickFormatter={(t: number) => bucketLabel(t, unit)}
            tick={{ fill: CHART_INK.axis, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={32}
          />
          <YAxis tickFormatter={(n: number) => `$${compact(n)}`} tick={{ fill: CHART_INK.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
          <Tooltip
            cursor={{ stroke: "rgba(140,203,245,0.35)", strokeDasharray: "3 4" }}
            isAnimationActive={animate}
            animationDuration={180}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!p) return null;
              return (
                <ChartTip
                  title={bucketLabel(p.t, unit, true)}
                  rows={[
                    { color: "#67e8f9", label: "Spend", value: formatUsd(p.cost) },
                    { label: "Calls", value: formatInt(p.calls) },
                    { label: "Failed calls", value: formatInt(p.failed) },
                  ]}
                  footer={p.calls ? "Click to see these calls" : undefined}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="cost"
            stroke={`url(#line-${id})`}
            strokeWidth={2.5}
            fill={`url(#fill-${id})`}
            activeDot={{ r: 5, fill: "#67e8f9", stroke: "#0e1522", strokeWidth: 2 }}
            isAnimationActive={animate}
            animationDuration={900}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
