import type { OpsSummary } from "@senoy/db/usage";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { Tip, TipBody } from "@/components/Tip";
import { Card } from "@/components/ui";
import { Spinner } from "@/components/States";
import { formatInt, formatUsd } from "@/lib/format";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Totals for one local day. */
type Day = { cost: number; calls: number; failed: number };

/** Weekday headers, Sunday first. */
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * A local-date key.
 * @param d - Date
 * @returns `YYYY-M-D`
 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Sums a summary's timeseries into local days.
 * @param summary - Summary for the month
 * @returns day key → totals
 */
function byDay(summary: OpsSummary | undefined): Map<string, Day> {
  const map = new Map<string, Day>();
  for (const p of summary?.timeseries ?? []) {
    const key = dayKey(new Date(p.bucket));
    const day = map.get(key) ?? { cost: 0, calls: 0, failed: 0 };
    day.cost += p.costUsd;
    day.calls += p.calls;
    day.failed += p.failedCalls;
    map.set(key, day);
  }
  return map;
}

/**
 * A month calendar of spend: each day tinted by how much it cost (blue scale), a coral dot on days with failed
 * calls, a week-total column, and month navigation. Clicking a day (or a week total) sets the page range to it.
 */
export function SpendCalendar() {
  const range = useTimeRange();
  const [month, setMonth] = useState(() => {
    const d = new Date(range.to);
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const state = useOps<OpsSummary>("summary", { from: month.toISOString(), to: monthEnd.toISOString() });
  const days = useMemo(() => byDay(state.data), [state.data]);

  const weeks = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - start.getDay());
    const rows: Date[][] = [];
    const cursor = new Date(start);
    while (cursor < monthEnd || rows.length === 0 || rows[rows.length - 1].length < 7) {
      if (rows.length === 0 || rows[rows.length - 1].length === 7) {
        if (cursor >= monthEnd) break;
        rows.push([]);
      }
      rows[rows.length - 1].push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return rows;
    // monthEnd derives from month.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const max = Math.max(0, ...[...days.values()].map((d) => d.cost));
  const monthTotal = [...days.values()].reduce((s, d) => s + d.cost, 0);
  const today = dayKey(new Date());

  /** Sets the page range to [from, to). */
  const pick = (from: Date, to: Date) => range.setCustom(from.toISOString(), to.toISOString());

  return (
    <Card
      title={
        <span className="flex items-center gap-1.5">
          Spend calendar
          <Tip
            content={
              <TipBody title="Spend calendar">
                Each day is tinted by its spend: the brighter the blue, the more it cost. A coral dot means some calls failed that day.
                Click a day or a week total to look at just that period.
              </TipBody>
            }
          >
            <Info className="size-3 text-muted-foreground" />
          </Tip>
        </span>
      }
      actions={
        <span className="flex items-center gap-2 text-xs">
          {state.loading && <Spinner />}
          <span className="text-muted-foreground">Month</span>
          <span className="font-mono tabular-nums text-ice">{formatUsd(monthTotal)}</span>
        </span>
      }
    >
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-ice/10 hover:text-foreground"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-32 text-center text-sm font-medium">
            {month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button
            type="button"
            className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-ice/10 hover:text-foreground"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="grid grid-cols-8 gap-1.5 text-[11px]">
          {[...WEEKDAYS, "Week"].map((d) => (
            <div key={d} className="pb-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
              {d}
            </div>
          ))}
          {weeks.map((week, wi) => {
            const totals = week.reduce(
              (acc, d) => {
                const day = d.getMonth() === month.getMonth() ? days.get(dayKey(d)) : undefined;
                return { cost: acc.cost + (day?.cost ?? 0), calls: acc.calls + (day?.calls ?? 0) };
              },
              { cost: 0, calls: 0 },
            );
            return [
              ...week.map((d, di) => {
                const inMonth = d.getMonth() === month.getMonth();
                const day = inMonth ? days.get(dayKey(d)) : undefined;
                const t = day && max > 0 ? day.cost / max : 0;
                const end = new Date(d);
                end.setDate(end.getDate() + 1);
                return (
                  <Tip
                    key={`${wi}-${di}`}
                    className="block"
                    content={
                      inMonth ? (
                        <TipBody
                          title={d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                          rows={[
                            ["Spend", formatUsd(day?.cost ?? 0)],
                            ["Calls", formatInt(day?.calls ?? 0)],
                            ["Failed calls", formatInt(day?.failed ?? 0)],
                          ]}
                        >
                          Click to look at just this day.
                        </TipBody>
                      ) : null
                    }
                  >
                    <button
                      type="button"
                      disabled={!inMonth}
                      onClick={() => pick(d, end)}
                      className={cn(
                        "relative flex h-16 w-full flex-col justify-between rounded-lg border p-1.5 text-left transition-all duration-200",
                        inMonth ? "hover:-translate-y-px hover:border-ice/50" : "opacity-25",
                        dayKey(d) === today && "ring-1 ring-ok/50",
                      )}
                      style={{
                        backgroundColor: day?.calls ? `rgba(56,189,248,${0.06 + 0.42 * t})` : "rgba(148,178,214,0.03)",
                        borderColor: day?.calls ? `rgba(103,232,249,${0.12 + 0.35 * t})` : undefined,
                      }}
                    >
                      <span className="flex items-center justify-between text-[10px] text-muted-foreground">
                        {d.getDate()}
                        {day?.failed ? <span className="size-1.5 rounded-full bg-bad shadow-[0_0_6px_rgba(240,138,128,0.8)]" /> : null}
                      </span>
                      {day?.calls ? (
                        <span className="leading-tight">
                          <span className="block font-mono text-[11px] tabular-nums text-foreground">{formatUsd(day.cost)}</span>
                          <span className="block text-[9px] text-muted-foreground">{formatInt(day.calls)} calls</span>
                        </span>
                      ) : null}
                    </button>
                  </Tip>
                );
              }),
              <button
                key={`w${wi}`}
                type="button"
                onClick={() => {
                  const end = new Date(week[6]);
                  end.setDate(end.getDate() + 1);
                  pick(week[0], end);
                }}
                className="flex h-16 flex-col items-center justify-center rounded-lg border border-dashed text-center transition-colors hover:border-ice/40"
                title="Look at this week"
              >
                <span className="font-mono text-[11px] tabular-nums text-ice">{totals.cost ? formatUsd(totals.cost) : "—"}</span>
                {totals.calls > 0 && <span className="text-[9px] text-muted-foreground">{formatInt(totals.calls)} calls</span>}
              </button>,
            ];
          })}
        </div>
      </div>
    </Card>
  );
}
