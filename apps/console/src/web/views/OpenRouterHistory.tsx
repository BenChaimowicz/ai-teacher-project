import type { OpsOpenRouterHistory, OpsOpenRouterSlice } from "@senoy/db/usage";
import { CalendarDays, Coins, Hash, Brain } from "lucide-react";
import { useMemo, useState } from "react";
import { BarList } from "@/components/charts/BarList";
import { KpiTile } from "@/components/charts/KpiTile";
import { PageHeader } from "@/components/PageHeader";
import { Async, EmptyState, Spinner } from "@/components/States";
import { Table, Td, Th, Tr } from "@/components/Table";
import { Tip, TipBody } from "@/components/Tip";
import { ActiveFilters, Card } from "@/components/ui";
import { formatAgo, formatDay, formatInt, formatTokens, formatUsd } from "@/lib/format";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Sortable columns of the rows table. */
type RowSort = "day" | "usageUsd" | "requests";

/** What the rows table is narrowed to, from a click on a model or provider. */
type Focus = { kind: "model" | "provider"; key: string } | null;

/** Shown when nothing has been imported yet. */
const IMPORT_HINT = "Run `pnpm openrouter:import` with OPEN_ROUTER_MANAGEMENT_API_KEY in .env. It imports only the platform's own key.";

/**
 * OpenRouter history: OpenRouter's own daily report of what the platform's key spent, imported once by
 * `pnpm openrouter:import`. It covers the days before the console recorded calls, so it is shown in full, not limited
 * by the time range. Every stored row is listed; models and providers narrow the list on click.
 */
export function OpenRouterHistory() {
  const history = useOps<OpsOpenRouterHistory>("openrouter-history");
  return (
    <>
      <PageHeader
        title="OpenRouter history"
        description="OpenRouter's own daily report for the platform's key, imported once. Other keys on the account are other projects and are not imported."
      />
      <Async state={history} rows={8}>
        {(data) => (data.rows.length === 0 ? <Card><EmptyState title="Nothing imported yet." hint={IMPORT_HINT} /></Card> : <HistoryBody data={data} loading={history.loading} />)}
      </Async>
    </>
  );
}

/**
 * The page once the history is loaded.
 * @param props.data - The imported history
 * @param props.loading - A refresh is in flight
 */
function HistoryBody({ data, loading }: { data: OpsOpenRouterHistory; loading: boolean }) {
  const [focus, setFocus] = useState<Focus>(null);
  const [sort, setSort] = useState<RowSort>("day");
  const t = data.totals;
  const rows = useMemo(() => {
    const narrowed = data.rows.filter((r) => !focus || (focus.kind === "model" ? r.model === focus.key : (r.providerName ?? "unknown") === focus.key));
    return [...narrowed].sort((a, b) => (sort === "day" ? b.day.localeCompare(a.day) || b.usageUsd - a.usageUsd : b[sort] - a[sort]));
  }, [data.rows, focus, sort]);
  const shown = rows.reduce((sum, r) => sum + r.usageUsd, 0);

  return (
    <div className="space-y-4">
      {data.key && (
        <p className="text-xs text-muted-foreground">
          Key <span className="font-mono text-foreground">{data.key.name}</span> ({data.key.label}) · lifetime spend{" "}
          <span className="font-mono text-foreground">{formatUsd(data.key.usageUsd)}</span>
          {data.key.limitUsd != null && <> of a {formatUsd(data.key.limitUsd)} limit</>} · imported {formatAgo(data.key.fetchedAt)}.{" "}
          <Tip
            underline
            content={
              <TipBody title="What this covers">
                OpenRouter keeps only the last 30 completed UTC days in its API, and no list of single calls. Today appears after it
                completes; run the import again to add it. Lifetime spend includes days older than the import window.
              </TipBody>
            }
          >
            What this covers
          </Tip>
        </p>
      )}

      <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Spent (imported days)" icon={Coins} value={t.usageUsd} format={formatUsd} tip="Sum of every imported day, as OpenRouter billed our key." />
        <KpiTile label="Requests" icon={Hash} value={t.requests} format={formatInt} tip="Model calls OpenRouter counted for our key." />
        <KpiTile
          label="Tokens"
          icon={Brain}
          value={t.promptTokens + t.completionTokens}
          format={formatTokens}
          tip="Prompt + completion tokens."
          sub={<>{formatTokens(t.promptTokens)} in · {formatTokens(t.completionTokens)} out · {formatTokens(t.reasoningTokens)} reasoning · {formatTokens(t.cachedTokens)} cached</>}
        />
        <KpiTile label="Days" icon={CalendarDays} value={data.byDay.filter((d) => d.requests > 0).length} format={formatInt} sub={<>{formatDay(t.firstDay)} → {formatDay(t.lastDay)}</>} tip="Days with any usage on our key." />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="By model" subtitle="Click to list only its rows.">
          <BarList rows={sliceRows(data.byModel, t.usageUsd)} onSelect={(key) => setFocus({ kind: "model", key })} />
        </Card>
        <Card title="By provider" subtitle="The host that served the calls. Click to list only its rows.">
          <BarList rows={sliceRows(data.byProvider, t.usageUsd)} onSelect={(key) => setFocus({ kind: "provider", key })} />
        </Card>
      </div>

      <Card title="By day" subtitle="What OpenRouter billed our key, next to what the console recorded for OpenRouter that day.">
        <DayBars days={data.byDay} />
      </Card>

      <Card title="Every stored row" subtitle="One row per day, model, and serving endpoint." actions={loading && <Spinner />}>
        {focus && (
          <div className="border-b px-3 py-2">
            <ActiveFilters
              chips={[{ key: "focus", label: `${focus.kind}: ${focus.key} · ${formatUsd(shown)}`, onRemove: () => setFocus(null) }]}
              onClear={() => setFocus(null)}
            />
          </div>
        )}
        <Table>
          <thead>
            <tr>
              <Th sorted={sort === "day"} onSort={() => setSort("day")}>Day</Th>
              <Th>Model</Th>
              <Th>Provider</Th>
              <Th numeric sorted={sort === "requests"} onSort={() => setSort("requests")}>Requests</Th>
              <Th numeric tip="Prompt tokens sent.">In</Th>
              <Th numeric tip="Completion tokens returned.">Out</Th>
              <Th numeric tip="Hidden reasoning tokens (part of Out).">Reasoning</Th>
              <Th numeric tip="Prompt tokens read from the provider's cache.">Cached</Th>
              <Th numeric sorted={sort === "usageUsd"} onSort={() => setSort("usageUsd")}>Cost</Th>
              <Th numeric tip="Cost per request.">Per request</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={`${r.day}-${r.model}-${r.providerName}`}>
                <Td className="tabular-nums text-muted-foreground">{formatDay(r.day)}</Td>
                <Td className="font-mono text-[11px]">
                  <button type="button" className="hover:text-ice" onClick={() => setFocus({ kind: "model", key: r.model })}>{r.model}</button>
                </Td>
                <Td className="font-mono text-[11px] text-muted-foreground">
                  <button type="button" className="hover:text-ice" onClick={() => setFocus({ kind: "provider", key: r.providerName ?? "unknown" })}>{r.providerName ?? "unknown"}</button>
                </Td>
                <Td numeric>{formatInt(r.requests)}</Td>
                <Td numeric className="text-muted-foreground">{formatTokens(r.promptTokens)}</Td>
                <Td numeric className="text-muted-foreground">{formatTokens(r.completionTokens)}</Td>
                <Td numeric className="text-muted-foreground">{formatTokens(r.reasoningTokens)}</Td>
                <Td numeric className="text-muted-foreground">{formatTokens(r.cachedTokens)}</Td>
                <Td numeric className="font-medium">{formatUsd(r.usageUsd)}</Td>
                <Td numeric className="text-muted-foreground">{r.requests ? formatUsd(r.usageUsd / r.requests) : "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/**
 * BarList rows for a model or provider breakdown.
 * @param slices - The breakdown, most expensive first
 * @param total - All imported spend, for the share
 */
function sliceRows(slices: OpsOpenRouterSlice[], total: number) {
  return slices.map((s) => ({
    key: s.key,
    label: <span className="font-mono text-[11px]">{s.key}</span>,
    value: s.usageUsd,
    valueLabel: formatUsd(s.usageUsd),
    extra: <>{formatInt(s.requests)} req · {total > 0 ? Math.round((s.usageUsd / total) * 100) : 0}%</>,
    tip: (
      <TipBody
        title={s.key}
        rows={[
          ["Cost", formatUsd(s.usageUsd)],
          ["Requests", formatInt(s.requests)],
          ["Per request", s.requests ? formatUsd(s.usageUsd / s.requests) : "—"],
          ["Tokens in / out", `${formatTokens(s.promptTokens)} / ${formatTokens(s.completionTokens)}`],
          ["Reasoning", formatTokens(s.reasoningTokens)],
        ]}
      />
    ),
  }));
}

/**
 * Per-day pair of bars: OpenRouter's billed spend (ice blue) and the console's recorded spend (green), on one scale.
 * @param props.days - Days, oldest first
 */
function DayBars({ days }: { days: OpsOpenRouterHistory["byDay"] }) {
  const max = Math.max(0, ...days.map((d) => Math.max(d.usageUsd, d.recordedUsd)));
  if (days.length === 0) return <EmptyState title="No days imported." hint={IMPORT_HINT} />;
  return (
    <ul className="space-y-1 p-3">
      {[...days].reverse().map((d) => (
        <li key={d.day} className="grid grid-cols-[6.5rem_1fr_9rem] items-center gap-3 text-xs">
          <span className="tabular-nums text-muted-foreground">{formatDay(d.day)}</span>
          <Tip
            className="block"
            content={
              <TipBody
                title={formatDay(d.day)}
                rows={[
                  ["OpenRouter billed", `${formatUsd(d.usageUsd)} · ${formatInt(d.requests)} req`],
                  ["Console recorded", `${formatUsd(d.recordedUsd)} · ${formatInt(d.recordedCalls)} calls`],
                ]}
              >
                {d.usageUsd === 0 && d.recordedUsd > 0 ? "Not in the import yet: OpenRouter reports a day only once it completes." : undefined}
              </TipBody>
            }
          >
            <span className="flex flex-col gap-0.5">
              <Bar value={d.usageUsd} max={max} className="bg-ice/80" />
              <Bar value={d.recordedUsd} max={max} className="bg-ok/70" />
            </span>
          </Tip>
          <span className="text-right font-mono tabular-nums">
            {formatUsd(d.usageUsd)}
            <span className="ml-1.5 text-ok">{d.recordedUsd > 0 ? formatUsd(d.recordedUsd) : ""}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One thin bar scaled to the largest value.
 * @param props.value - This bar's value
 * @param props.max - The largest value on the chart
 */
function Bar({ value, max, className }: { value: number; max: number; className: string }) {
  const pct = max > 0 && value > 0 ? Math.max(1.5, (value / max) * 100) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted/40">
      <span className={cn("animate-grow-x block h-full rounded-full", className)} style={{ width: `${pct}%` }} />
    </span>
  );
}
