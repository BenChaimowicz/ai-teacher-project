import type { OpsPipelineEventRow, OpsProductEventRow, OpsUsageRecordRow } from "@senoy/db/usage";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { kindLabel } from "@/components/Badges";
import { CostCell, CostSplitCell } from "@/components/Cost";
import { Tip, TipBody } from "@/components/Tip";
import { Button } from "@/components/ui";
import { KIND_HELP, OUTCOME_HELP, PRODUCT_EVENT_HELP } from "@/lib/glossary";
import { STATUS_COLORS, outcomeTone } from "@/lib/palette";
import { formatUsd, formatDateTime, formatDuration, formatInt, humanize } from "@/lib/format";
import { useDrawers } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { tryLabel } from "@/lib/labels";

/** Bar color per Pipeline Event status: ice for ok, coral for failed, dim ice for running. */
const STEP_BAR: Record<OpsPipelineEventRow["status"], string> = {
  ok: "#4a9ade",
  failed: STATUS_COLORS.critical,
  running: "#8ccbf5",
};

/** One flattened timeline row. */
type Row =
  | { type: "event"; event: OpsPipelineEventRow; depth: number; hasChildren: boolean; calls: OpsUsageRecordRow[] }
  | { type: "call"; record: OpsUsageRecordRow; depth: number };

/**
 * When a Usage Record started. Assumes `createdAt` is written when the call returns, so start = createdAt − duration.
 * @param r - The record
 * @returns Epoch ms
 */
function callStart(r: OpsUsageRecordRow): number {
  return new Date(r.createdAt).getTime() - (r.durationMs ?? 0);
}

/**
 * A Gantt-style waterfall of one Course Request: Pipeline Events nested by parent, bars colored by status, call
 * ticks on each step, expandable call rows, and Product Events on a lane above. Clicking a bar opens its drawer.
 * @param props.events - Every Pipeline Event of the Course Request (flat, with parentId)
 * @param props.records - Every Usage Record of the Course Request
 * @param props.productEvents - What the Learner did, on the same clock
 */
export function Timeline({
  events,
  records,
  productEvents,
}: {
  events: OpsPipelineEventRow[];
  records: OpsUsageRecordRow[];
  productEvents: OpsProductEventRow[];
}) {
  const { openStep, openCall } = useDrawers();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  const [now] = useState(() => Date.now());

  const { t0, span, rows, unscoped } = useMemo(() => {
    const ids = new Set(events.map((e) => e.id));
    const children = new Map<string | null, OpsPipelineEventRow[]>();
    for (const e of events) {
      const parent = e.parentId && ids.has(e.parentId) ? e.parentId : null;
      children.set(parent, [...(children.get(parent) ?? []), e]);
    }
    for (const list of children.values()) list.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    const callsByEvent = new Map<string, OpsUsageRecordRow[]>();
    const unscopedCalls: OpsUsageRecordRow[] = [];
    for (const r of records) {
      if (r.pipelineEventId && ids.has(r.pipelineEventId)) {
        callsByEvent.set(r.pipelineEventId, [...(callsByEvent.get(r.pipelineEventId) ?? []), r]);
      } else unscopedCalls.push(r);
    }
    for (const list of callsByEvent.values()) list.sort((a, b) => callStart(a) - callStart(b));

    const flat: Row[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const e of children.get(parent) ?? []) {
        const calls = callsByEvent.get(e.id) ?? [];
        flat.push({ type: "event", event: e, depth, hasChildren: (children.get(e.id)?.length ?? 0) > 0, calls });
        if (expandedCalls.has(e.id)) for (const r of calls) flat.push({ type: "call", record: r, depth: depth + 1 });
        if (!collapsed.has(e.id)) walk(e.id, depth + 1);
      }
    };
    walk(null, 0);

    const times = [
      ...events.flatMap((e) => [new Date(e.startedAt).getTime(), e.finishedAt ? new Date(e.finishedAt).getTime() : now]),
      ...records.flatMap((r) => [callStart(r), new Date(r.createdAt).getTime()]),
      ...productEvents.map((p) => new Date(p.createdAt).getTime()),
    ].filter(Number.isFinite);
    const start = times.length ? Math.min(...times) : now;
    const end = times.length ? Math.max(...times) : now;
    return { t0: start, span: Math.max(1, end - start), rows: flat, unscoped: unscopedCalls };
  }, [events, records, productEvents, collapsed, expandedCalls, now]);

  const pct = (ms: number) => `${((ms - t0) / span) * 100}%`;
  const width = (from: number, to: number) => `max(3px, ${((to - from) / span) * 100}%)`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  return (
    <div className="text-xs">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-muted-foreground">
          {formatDateTime(new Date(t0).toISOString())} → +{formatDuration(span)} · bars: steps by status · ticks: calls by outcome
        </span>
        <span className="flex gap-1.5">
          <Button variant="ghost" onClick={() => setExpandedCalls(new Set(events.map((e) => e.id)))}>
            Expand calls
          </Button>
          <Button variant="ghost" onClick={() => setExpandedCalls(new Set())}>
            Collapse calls
          </Button>
        </span>
      </div>

      <div className="grid grid-cols-[minmax(16rem,22rem)_1fr]">
        {/* Axis */}
        <div className="border-y bg-card-solid/60 px-3 py-1 text-[11px] text-muted-foreground">Step</div>
        <div className="relative h-6 border-y bg-card-solid/60">
          {ticks.map((f) => (
            <span
              key={f}
              className="absolute top-1 -translate-x-1/2 text-[10px] tabular-nums text-muted-foreground first:translate-x-0 last:-translate-x-full"
              style={{ left: `${f * 100}%` }}
            >
              +{formatDuration(f * span)}
            </span>
          ))}
        </div>

        {/* Product Events lane */}
        {productEvents.length > 0 && (
          <>
            <div className="border-b px-3 py-1.5 text-muted-foreground">Learner (Product Events)</div>
            <div className="relative h-7 border-b">
              {productEvents.map((p) => (
                <span
                  key={p.id}
                  className="absolute top-1/2 flex -translate-x-1/2 -translate-y-1/2"
                  style={{ left: pct(new Date(p.createdAt).getTime()) }}
                >
                <Tip
                  content={
                    <TipBody title={humanize(p.kind)} rows={[["At", formatDateTime(p.createdAt)]]}>
                      {PRODUCT_EVENT_HELP[p.kind]}
                    </TipBody>
                  }
                >
                  <span className="block size-2.5 rotate-45 rounded-[2px] bg-ok/80 ring-2 ring-[#0e1522] transition-transform hover:scale-150" />
                </Tip>
                </span>
              ))}
            </div>
          </>
        )}

        {rows.map((row, i) =>
          row.type === "event" ? (
            <EventRow
              key={row.event.id}
              row={row}
              index={i}
              pct={pct}
              width={width}
              collapsed={collapsed.has(row.event.id)}
              callsOpen={expandedCalls.has(row.event.id)}
              onToggleChildren={() => toggle(collapsed, row.event.id, setCollapsed)}
              onToggleCalls={() => toggle(expandedCalls, row.event.id, setExpandedCalls)}
              onOpen={() => openStep(row.event.id)}
              onOpenCall={openCall}
              now={now}
            />
          ) : (
            <CallRow key={row.record.id} record={row.record} depth={row.depth} pct={pct} width={width} onOpen={() => openCall(row.record.id)} />
          ),
        )}

        {unscoped.length > 0 && (
          <>
            <div className="border-b px-3 py-1.5 text-muted-foreground">Calls outside any step ({unscoped.length})</div>
            <div className="relative h-7 border-b">
              {unscoped.map((r) => (
                <CallTick key={r.id} record={r} pct={pct} width={width} onOpen={() => openCall(r.id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * One Pipeline Event row: indented label with toggles and cost, and its bar with call ticks.
 */
function EventRow({
  row,
  index,
  pct,
  width,
  collapsed,
  callsOpen,
  onToggleChildren,
  onToggleCalls,
  onOpen,
  onOpenCall,
  now,
}: {
  row: Extract<Row, { type: "event" }>;
  index: number;
  pct: (ms: number) => string;
  width: (from: number, to: number) => string;
  collapsed: boolean;
  callsOpen: boolean;
  onToggleChildren: () => void;
  onToggleCalls: () => void;
  onOpen: () => void;
  onOpenCall: (id: string) => void;
  now: number;
}) {
  const e = row.event;
  const start = new Date(e.startedAt).getTime();
  const end = e.finishedAt ? new Date(e.finishedAt).getTime() : now;
  const tip = (
    <TipBody
      title={`${kindLabel(e.kind)}${e.label ? ` · ${e.label}` : ""}`}
      rows={[
        ["Status", e.status],
        ["Duration", e.status === "running" ? `${formatDuration(end - start)} so far` : formatDuration(e.durationMs)],
        ["Cost (incl. children)", `${formatUsd(e.totalUsd)}${e.unknownCount ? ` +${e.unknownCount} unknown` : ""}`],
        ["Calls", `${formatInt(e.calls)}${e.failedCalls ? ` (${e.failedCalls} failed)` : ""}`],
        ["Started", formatDateTime(e.startedAt)],
      ]}
    >
      {KIND_HELP[e.kind]}
      {e.error && <span className="mt-1 block line-clamp-4 font-mono text-[11px] text-bad">{e.error}</span>}
    </TipBody>
  );
  return (
    <>
      <div
        className={cn("flex min-w-0 items-center gap-1 border-b border-border/50 px-3 py-1 hover:bg-ice/[0.04]", e.status === "failed" && "bg-bad/[0.04]")}
        style={{ paddingLeft: `${0.75 + row.depth * 0.9}rem` }}
      >
        <button
          type="button"
          className={cn("rounded p-0.5 text-muted-foreground hover:text-foreground", !row.hasChildren && "invisible")}
          onClick={onToggleChildren}
          aria-label={collapsed ? "Expand child steps" : "Collapse child steps"}
        >
          {collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 truncate text-left hover:text-ice" title={e.label ?? undefined}>
          {kindLabel(e.kind)}
          {e.label && <span className="text-muted-foreground"> · {e.label}</span>}
        </button>
        {row.calls.length > 0 && (
          <button
            type="button"
            onClick={onToggleCalls}
            className={cn(
              "shrink-0 rounded-full border px-1.5 text-[10px] tabular-nums transition-colors hover:border-ice/40",
              callsOpen ? "border-ice/40 text-ice" : "text-muted-foreground",
            )}
            title="Show this step's calls as rows"
          >
            {row.calls.length} call{row.calls.length === 1 ? "" : "s"}
          </button>
        )}
        <span className="w-16 shrink-0 text-right">
          <CostSplitCell split={e} compact />
        </span>
      </div>
      <div className="relative h-7 border-b border-border/50 hover:bg-ice/[0.03]">
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "animate-grow-x absolute top-1.5 h-4 rounded-[4px] opacity-85 transition-[filter,opacity] hover:opacity-100 hover:brightness-125",
            e.status === "running" && "animate-pulse",
          )}
          style={{
            left: pct(start),
            width: width(start, end),
            backgroundColor: STEP_BAR[e.status],
            animationDelay: `${Math.min(index * 18, 400)}ms`,
          }}
          aria-label={`${kindLabel(e.kind)} ${e.status}`}
        >
          <Tip content={tip} className="block size-full">
            <span className="block size-full" />
          </Tip>
        </button>
        {row.calls.map((r) => (
          <CallTick key={r.id} record={r} pct={pct} width={width} onOpen={() => onOpenCall(r.id)} small />
        ))}
      </div>
    </>
  );
}

/**
 * A Usage Record's span as a thin mark (on its step's row) or bar (on its own row), colored by outcome.
 */
function CallTick({
  record: r,
  pct,
  width,
  onOpen,
  small,
}: {
  record: OpsUsageRecordRow;
  pct: (ms: number) => string;
  width: (from: number, to: number) => string;
  onOpen: () => void;
  small?: boolean;
}) {
  const start = callStart(r);
  const end = new Date(r.createdAt).getTime();
  const color = r.outcome === "ok" ? "#cfe9fb" : STATUS_COLORS[outcomeTone(r.outcome)];
  return (
    <span className={cn("absolute", small ? "bottom-0.5 h-1" : "top-2 h-3")} style={{ left: pct(start), width: width(start, end) }}>
      <Tip
        className="block size-full"
        content={
          <TipBody
            title={`${tryLabel(r.attempt)} · ${r.modelId}`}
            rows={[
              ["Outcome", `${r.outcome}${r.invalidCause ? `/${r.invalidCause}` : ""}`],
              ["Cost", <CostCell key="c" usd={r.costUsd} basis={r.costBasis} />],
              ["Duration", formatDuration(r.durationMs)],
              ["Tokens in / out", `${r.promptTokens ?? "—"} / ${r.completionTokens ?? "—"}`],
            ]}
          >
            {r.outcome !== "ok" ? OUTCOME_HELP[r.outcome] : null}
          </TipBody>
        }
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
          className="block size-full rounded-full ring-1 ring-[#0e1522] transition-transform hover:scale-y-150"
          style={{ backgroundColor: color }}
          aria-label={`Call ${r.modelId} ${r.outcome}`}
        />
      </Tip>
    </span>
  );
}

/**
 * A Usage Record as its own row under an expanded step.
 */
function CallRow({
  record: r,
  depth,
  pct,
  width,
  onOpen,
}: {
  record: OpsUsageRecordRow;
  depth: number;
  pct: (ms: number) => string;
  width: (from: number, to: number) => string;
  onOpen: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 items-center gap-2 border-b border-border/30 px-3 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-ice/[0.04] hover:text-foreground"
        style={{ paddingLeft: `${1.6 + depth * 0.9}rem` }}
      >
        <span className="tabular-nums">{tryLabel(r.attempt)}</span>
        <span className="min-w-0 flex-1 truncate font-mono">{r.modelId}</span>
        <span className={r.outcome === "ok" ? "" : "text-bad"}>{r.outcome === "ok" ? formatDuration(r.durationMs) : humanize(r.outcome)}</span>
        <CostCell usd={r.costUsd} basis={r.costBasis} className="w-14 text-right" />
      </button>
      <div className="relative h-[22px] border-b border-border/30">
        <CallTick record={r} pct={pct} width={width} onOpen={onOpen} />
      </div>
    </>
  );
}
