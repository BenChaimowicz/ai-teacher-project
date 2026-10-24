import type { OpsSummary } from "@senoy/db/usage";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTip } from "@/components/charts/ChartTip";
import { CardEmpty } from "@/components/States";
import { ACCENT, CHART_INK } from "@/lib/palette";
import { prefersReducedMotion } from "@/lib/motion";
import { compact, formatDuration, formatInt, formatPct } from "@/lib/format";

/**
 * How long calls took, as a histogram of the API's duration buckets, with the usual and slowest times in the header.
 * @param props.histogram - `latencyHistogram` from the summary
 * @param props.onSelect - Column click (opens Calls sorted by duration)
 */
export function LatencyHistogram({
  histogram,
  onSelect,
}: {
  histogram: OpsSummary["latencyHistogram"];
  onSelect: () => void;
}) {
  const total = histogram.reduce((s, b) => s + b.calls, 0);
  if (total === 0) return <CardEmpty />;
  const data = histogram.map((b, i) => {
    const lower = i === 0 ? 0 : histogram[i - 1].upToMs ?? 0;
    return {
      label: b.upToMs === null ? `>${formatDuration(lower)}` : `≤${formatDuration(b.upToMs)}`,
      range: b.upToMs === null ? `over ${formatDuration(lower)}` : `${formatDuration(lower)} – ${formatDuration(b.upToMs)}`,
      calls: b.calls,
    };
  });
  const animate = !prefersReducedMotion();
  return (
    <div className="h-56 px-2 pt-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} onClick={onSelect} style={{ cursor: "pointer" }}>
          <CartesianGrid vertical={false} stroke={CHART_INK.grid} />
          <XAxis dataKey="label" stroke={CHART_INK.baseline} tick={{ fill: CHART_INK.axis, fontSize: 11 }} tickLine={false} interval={0} />
          <YAxis tickFormatter={(n: number) => compact(n)} tick={{ fill: CHART_INK.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(140,203,245,0.06)" }}
            isAnimationActive={animate}
            animationDuration={180}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as (typeof data)[number] | undefined) : undefined;
              if (!row) return null;
              return (
                <ChartTip
                  title={row.range}
                  rows={[
                    { color: ACCENT, label: "Calls", value: formatInt(row.calls) },
                    { label: "Share of calls", value: formatPct(total ? row.calls / total : null) },
                  ]}
                  footer="Click to see the slowest calls"
                />
              );
            }}
          />
          <Bar dataKey="calls" fill={ACCENT} fillOpacity={0.85} maxBarSize={28} radius={[4, 4, 0, 0]} isAnimationActive={animate} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
