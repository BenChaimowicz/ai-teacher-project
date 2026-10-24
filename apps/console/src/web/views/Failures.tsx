import { USAGE_OUTCOMES, type OpsFailureGroup, type UsageOutcome } from "@senoy/db/usage";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { kindLabel } from "@/components/Badges";
import { Async, CAPTURE_HINT, EmptyState, Spinner } from "@/components/States";
import { Table, Td, Th, Tr } from "@/components/Table";
import { Tip, TipBody } from "@/components/Tip";
import { Card } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { INVALID_CAUSE_HELP, METRIC_HELP, OUTCOME_HELP } from "@/lib/glossary";
import { formatAgo, formatDateTime, formatInt, formatUsd, shortId } from "@/lib/format";
import { useDrawers, useHref, useSetParams } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Source tabs. */
const SOURCES = [
  { key: "", label: "All" },
  { key: "usage_record", label: "Calls" },
  { key: "pipeline_event", label: "Pipeline steps" },
  { key: "api_request", label: "API" },
] as const;

/**
 * Splits a failure reason like `invalid_output/schema` or `http 429` into a known outcome and detail.
 * @param reason - The group's reason
 * @returns The outcome (if the reason starts with one) and the rest
 */
function parseReason(reason: string): { outcome: UsageOutcome | null; detail: string } {
  const match = /^([a-z_]+)[/ ]?(.*)$/.exec(reason);
  const head = match?.[1] ?? "";
  return (USAGE_OUTCOMES as readonly string[]).includes(head)
    ? { outcome: head as UsageOutcome, detail: match?.[2] ?? "" }
    : { outcome: null, detail: reason };
}

/** Failures: failed calls, steps, and API requests grouped by reason, with what they cost and samples to open. */
export function Failures() {
  const range = useTimeRange();
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const source = search.get("source") ?? "";
  const state = useOps<OpsFailureGroup[]>("failures", { from: range.from, to: range.to });

  return (
    <>
      <PageHeader title="Failures" description="What failed and why, grouped by reason. Expand a group for samples." actions={state.loading && <Spinner />} />
      <Async state={state} rows={10}>
        {(groups) => {
          const shown = groups.filter((g) => !source || g.source === source).sort((a, b) => b.count - a.count || b.wastedUsd - a.wastedUsd);
          const wasted = shown.reduce((s, g) => s + g.wastedUsd, 0);
          const count = shown.reduce((s, g) => s + g.count, 0);
          return (
            <Card
              title={
                <span className="inline-flex rounded-md border bg-secondary p-0.5 text-[11px] font-normal">
                  {SOURCES.map((s) => {
                    const n = groups.filter((g) => !s.key || g.source === s.key).reduce((sum, g) => sum + g.count, 0);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setParams({ source: s.key })}
                        className={cn(
                          "rounded px-2 py-0.5 transition-colors",
                          source === s.key ? "bg-ice/15 text-ice" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {s.label} <span className="tabular-nums opacity-70">{formatInt(n)}</span>
                      </button>
                    );
                  })}
                </span>
              }
              actions={
                <span className="text-xs text-muted-foreground">
                  {formatInt(count)} failures ·{" "}
                  <Tip content={<TipBody title="Wasted">{METRIC_HELP.wasted}</TipBody>} underline>
                    <span className="text-bad">{formatUsd(wasted)} wasted</span>
                  </Tip>
                </span>
              }
            >
              {shown.length === 0 ? (
                <EmptyState
                  title={groups.length ? "Nothing failed from this source in this range." : "No failures in this range."}
                  hint={groups.length ? undefined : `Either everything worked or nothing ran yet. ${CAPTURE_HINT}`}
                />
              ) : (
                <FailureTable groups={shown} />
              )}
            </Card>
          );
        }}
      </Async>
    </>
  );
}

/**
 * The grouped failures table with expandable sample ids.
 * @param props.groups - Groups to show
 */
function FailureTable({ groups }: { groups: OpsFailureGroup[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const max = Math.max(1, ...groups.map((g) => g.count));
  return (
    <Table>
      <thead>
        <tr>
          <Th className="w-6" />
          <Th>Reason</Th>
          <Th>Where</Th>
          <Th numeric>Count</Th>
          <Th numeric tip={METRIC_HELP.wasted}>Wasted</Th>
          <Th>Last seen</Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {groups.map((g, i) => {
          const expanded = open.has(i);
          const { outcome, detail } = parseReason(g.reason);
          return (
            <Fragment key={`${g.source}:${g.reason}:${g.key}`}>
              <Tr
                onClick={() =>
                  setOpen((prev) => {
                    const next = new Set(prev);
                    if (next.has(i)) next.delete(i);
                    else next.add(i);
                    return next;
                  })
                }
                active={expanded}
              >
                <Td>{expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Td>
                <Td className="max-w-[26rem]">
                  <Tip
                    content={
                      <TipBody title={g.reason}>
                        {outcome ? OUTCOME_HELP[outcome] : "The first line of the error the step threw."}
                        {outcome === "invalid_output" && detail && INVALID_CAUSE_HELP[detail] ? <span className="mt-1 block">{INVALID_CAUSE_HELP[detail]}</span> : null}
                      </TipBody>
                    }
                  >
                    <span className="truncate font-mono text-[11px] text-bad">{g.reason}</span>
                  </Tip>
                </Td>
                <Td className="max-w-[16rem] truncate">
                  <span className="mr-1.5 rounded border px-1 text-[10px] text-muted-foreground">
                    {g.source === "usage_record" ? "call" : g.source === "pipeline_event" ? "step" : "api"}
                  </span>
                  <span className={g.source === "pipeline_event" ? "" : "font-mono text-[11px]"}>
                    {g.source === "pipeline_event" ? kindLabel(g.key) : g.key}
                  </span>
                </Td>
                <Td numeric className="w-40">
                  <span className="flex items-center justify-end gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/60">
                      <span className="animate-grow-x block h-full rounded-full bg-bad/80" style={{ width: `${(g.count / max) * 100}%` }} />
                    </span>
                    {formatInt(g.count)}
                  </span>
                </Td>
                <Td numeric className={g.wastedUsd ? "text-bad" : "text-muted-foreground"}>
                  {formatUsd(g.wastedUsd)}
                </Td>
                <Td className="text-muted-foreground" title={formatDateTime(g.lastAt)}>
                  {formatAgo(g.lastAt)}
                </Td>
                <Td>
                  <SeeAll group={g} outcome={outcome} />
                </Td>
              </Tr>
              {expanded && (
                <tr className="animate-fade-in border-b border-border/60 bg-ice/[0.02]">
                  <td />
                  <td colSpan={6} className="px-2.5 py-2">
                    <Samples group={g} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}

/**
 * The link from a failure group to the full filtered list.
 * @param props.group - The group
 * @param props.outcome - Parsed outcome, when the reason starts with one
 */
function SeeAll({ group: g, outcome }: { group: OpsFailureGroup; outcome: UsageOutcome | null }) {
  const href = useHref();
  const to =
    g.source === "usage_record"
      ? href("/calls", { modelId: g.key, outcome: outcome ?? "failed" })
      : g.source === "pipeline_event"
        ? href("/steps", { kind: g.key, status: "failed" })
        : href("/api", { route: g.key, errorsOnly: 1 });
  return (
    <Link to={to} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 whitespace-nowrap text-ice/80 hover:text-ice">
      See all <ArrowRight className="size-3" />
    </Link>
  );
}

/**
 * The sample ids of a group, each opening its call or step drawer.
 * @param props.group - The group
 */
function Samples({ group: g }: { group: OpsFailureGroup }) {
  const { openCall, openStep } = useDrawers();
  if (g.sampleIds.length === 0) return <span className="text-xs text-muted-foreground">No samples.</span>;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">Samples:</span>
      {g.sampleIds.map((id) =>
        g.source === "api_request" ? (
          <span key={id} className="rounded border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground" title={id}>
            {shortId(id)}
          </span>
        ) : (
          <button
            key={id}
            type="button"
            onClick={() => (g.source === "usage_record" ? openCall(id) : openStep(id))}
            className="rounded border px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:border-ice/40 hover:text-ice"
            title={id}
          >
            {shortId(id)}
          </button>
        ),
      )}
    </div>
  );
}
