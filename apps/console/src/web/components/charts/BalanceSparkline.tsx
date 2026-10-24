import type { OpsBalanceSnapshot } from "@senoy/db/usage";
import { useId, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { ChartTip } from "@/components/charts/ChartTip";
import { prefersReducedMotion } from "@/lib/motion";
import { formatDateTime, formatUsd } from "@/lib/format";

/** One point of the sparkline. */
type Point = { t: number; balance: number; pending: number | null };

/**
 * A small balance-over-time line from a vendor's readings, with a rich hover tooltip. Readings without a balance
 * (failed reads) are skipped.
 * @param props.series - Readings, oldest first
 * @param props.color - Line color (the vendor's color)
 */
export function BalanceSparkline({ series, color }: { series: OpsBalanceSnapshot[]; color: string }) {
  const id = useId().replace(/:/g, "");
  const animate = !prefersReducedMotion();
  const data = useMemo<Point[]>(
    () =>
      series
        .filter((s) => s.balanceUsd !== null)
        .map((s) => ({ t: new Date(s.takenAt).getTime(), balance: s.balanceUsd as number, pending: s.pendingUsd })),
    [series],
  );

  if (data.length < 2) {
    return (
      <div className="flex h-14 items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground">
        {data.length === 0 ? "No balance readings in this range yet." : "One reading so far. The line starts with the next one."}
      </div>
    );
  }

  return (
    <div className="h-14">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.3} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Tooltip
            cursor={{ stroke: "rgba(140,203,245,0.35)", strokeDasharray: "3 4" }}
            isAnimationActive={animate}
            animationDuration={180}
            content={({ active, payload }) => {
              const p = active ? (payload?.[0]?.payload as Point | undefined) : undefined;
              if (!p) return null;
              const rows = [{ color, label: "Balance", value: formatUsd(p.balance) }];
              if (p.pending) rows.push({ color: "", label: "Pending", value: formatUsd(p.pending) });
              return <ChartTip title={formatDateTime(new Date(p.t).toISOString())} rows={rows} />;
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${id})`}
            dot={false}
            activeDot={{ r: 3.5, fill: color, stroke: "#0e1522", strokeWidth: 2 }}
            isAnimationActive={animate}
            animationDuration={700}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
