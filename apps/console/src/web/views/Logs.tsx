import { LOG_COMPONENTS, LOG_LEVELS, type LogLevel, type OpsLogEntryRow } from "@senoy/db/logs";
import type { OpsPage } from "@senoy/db/usage";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CodeBlock, CopyButton } from "@/components/CodeBlock";
import { StatusPill } from "@/components/Badges";
import { PageHeader } from "@/components/PageHeader";
import { Async, EmptyState, Spinner } from "@/components/States";
import { Pager, Table, Td, Th, Tr } from "@/components/Table";
import { ActiveFilters, Card, Select, TextInput } from "@/components/ui";
import { formatDateTime, formatInt, humanize } from "@/lib/format";
import { useDrawers, useHref, useSetParams } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import type { StatusTone } from "@/lib/palette";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Rows per page. */
const PAGE_SIZE = 50;

/** The id filters a link can set, with the label each chip shows. */
const ID_FILTERS = [
  ["requestId", "request"],
  ["jobId", "job"],
  ["courseRequestId", "Course Request"],
  ["learnerId", "Learner"],
  ["pipelineEventId", "step"],
] as const;

/** Pill tone per level. */
const LEVEL_TONE: Record<LogLevel, StatusTone> = { info: "neutral", warn: "warning", error: "critical", fatal: "critical" };

/**
 * A Log Entry's level.
 * @param props.level - info / warn / error / fatal
 */
function LevelBadge({ level }: { level: LogLevel }) {
  return <StatusPill tone={LEVEL_TONE[level]}>{level}</StatusPill>;
}

/**
 * One id in a row, as a link to its entity. Stops the click so it does not also expand the row.
 * @param props.id - The id, or null
 * @param props.label - What the id is
 * @param props.to - Where it leads (a link) or a click handler (opens a drawer)
 */
function IdLink({ id, label, to, onOpen }: { id: string | null; label: string; to?: string; onOpen?: () => void }) {
  if (!id) return null;
  const className = "inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] hover:bg-accent hover:text-ice";
  const text = (
    <>
      <span className="font-sans text-muted-foreground">{label}</span> <span title={id}>{id.slice(0, 8)}</span>
    </>
  );
  if (onOpen) {
    return (
      <button type="button" className={className} onClick={(e) => { e.stopPropagation(); onOpen(); }}>
        {text}
      </button>
    );
  }
  return (
    <Link to={to ?? "#"} className={className} onClick={(e) => e.stopPropagation()}>
      {text}
    </Link>
  );
}

/**
 * Logs: every Log Entry the api, worker, web app and console stored (ADR 0029), newest first. Filters live in the URL
 * so other views can link here; a row expands to its context, and each id in it leads to its entity.
 */
export function Logs() {
  const range = useTimeRange();
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const href = useHref();
  const { openStep } = useDrawers();
  const component = search.get("component") ?? "";
  const level = search.get("level") ?? "";
  const q = search.get("q") ?? "";
  const ids = Object.fromEntries(ID_FILTERS.map(([key]) => [key, search.get(key) ?? ""]));
  const page = Math.max(0, Number(search.get("page") ?? 0) || 0);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  const state = useOps<OpsPage<OpsLogEntryRow>>("logs", {
    from: range.from,
    to: range.to,
    component,
    level,
    q,
    ...ids,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const chips = [
    ...ID_FILTERS.filter(([key]) => ids[key]).map(([key, label]) => ({
      key,
      label: `${label}: ${ids[key].slice(0, 8)}`,
      onRemove: () => setParams({ [key]: undefined }),
    })),
    ...(q ? [{ key: "q", label: `text: ${q}`, onRemove: () => setParams({ q: undefined }) }] : []),
  ];
  const filtered = chips.length > 0 || component !== "" || level !== "";

  return (
    <>
      <PageHeader
        title="Logs"
        description="Log Entries from the api, worker, web app and console. Info is kept 7 days, warnings and errors 30."
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <Select label="Component" value={component} onChange={(e) => setParams({ component: e.target.value })}>
            <option value="">All</option>
            {LOG_COMPONENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select label="Level" value={level} onChange={(e) => setParams({ level: e.target.value })}>
            <option value="">All</option>
            {LOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "info" ? "info and up" : `${l} and up`}
              </option>
            ))}
          </Select>
          <form
            className="inline-flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              setParams({ q: draft.trim() });
            }}
          >
            <TextInput
              label="Search"
              placeholder="message text"
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => draft.trim() !== q && setParams({ q: draft.trim() })}
              className="w-56"
            />
          </form>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {state.loading && <Spinner />}
            {state.data && `${formatInt(state.data.total)} entries`}
          </span>
        </div>
        {chips.length > 0 && (
          <div className="border-b px-3 py-2">
            <ActiveFilters
              chips={chips}
              onClear={() => setParams({ ...Object.fromEntries(ID_FILTERS.map(([key]) => [key, undefined])), q: undefined })}
            />
          </div>
        )}
        <Async state={state} rows={10}>
          {(data) =>
            data.rows.length === 0 ? (
              <EmptyState
                title={filtered ? "No Log Entries match." : "No Log Entries in this range."}
                hint={filtered ? "Widen the time range or drop a filter." : "Entries appear once the api, worker, web app or console log something at info or above."}
              />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-6" />
                      <Th>Time</Th>
                      <Th>Level</Th>
                      <Th>Component</Th>
                      <Th>Message</Th>
                      <Th>Links</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <Fragment key={r.id}>
                        <Tr
                          onClick={() => setOpen(open === r.id ? null : r.id)}
                          active={open === r.id}
                          tone={r.level === "error" || r.level === "fatal" ? "failed" : undefined}
                        >
                          <Td>{open === r.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Td>
                          <Td className="whitespace-nowrap tabular-nums text-muted-foreground">{formatDateTime(r.loggedAt)}</Td>
                          <Td>
                            <LevelBadge level={r.level} />
                          </Td>
                          <Td className="text-muted-foreground">{humanize(r.component)}</Td>
                          <Td className={cn("max-w-[36rem] truncate font-mono text-[11px]", open === r.id && "whitespace-normal break-words")} title={r.message}>
                            {r.message}
                          </Td>
                          <Td>
                            <span className="flex flex-wrap gap-1">
                              <IdLink id={r.requestId} label="request" to={href("/api", { requestId: r.requestId })} />
                              <IdLink id={r.jobId} label="job" to={href("/logs", { jobId: r.jobId })} />
                              <IdLink id={r.courseRequestId} label="Course Request" to={href(`/course-requests/${r.courseRequestId}`)} />
                              <IdLink id={r.pipelineEventId} label="step" onOpen={() => r.pipelineEventId && openStep(r.pipelineEventId)} />
                              <IdLink id={r.learnerId} label="Learner" to={href("/activity", { learnerId: r.learnerId })} />
                            </span>
                          </Td>
                        </Tr>
                        {open === r.id && (
                          <tr className="animate-fade-in border-b border-border/60">
                            <td />
                            <td colSpan={5} className="space-y-2 px-2.5 py-2">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                Log Entry <span className="font-mono">{r.id}</span> <CopyButton text={r.id} label="" />
                                <CopyButton text={r.message} label="Copy message" />
                              </div>
                              <CodeBlock title="Context" value={r.context} defaultOpen />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </Table>
                <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(n) => setParams({ page: n || undefined }, { keepPage: true })} />
              </>
            )
          }
        </Async>
      </Card>
    </>
  );
}
