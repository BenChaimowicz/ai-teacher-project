import { PRODUCT_EVENT_KINDS, type OpsPage, type OpsProductEventRow } from "@senoy/db/usage";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CodeBlock } from "@/components/CodeBlock";
import { Async, CAPTURE_HINT, EmptyState, Spinner } from "@/components/States";
import { Pager, Table, Td, Th, Tr } from "@/components/Table";
import { Tip, TipBody } from "@/components/Tip";
import { Card, Mono, Select } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { PRODUCT_EVENT_HELP } from "@/lib/glossary";
import { formatAgo, formatDateTime, formatInt, humanize } from "@/lib/format";
import { useHref, useSetParams } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";

/** Rows per page. */
const PAGE_SIZE = 50;

/**
 * Compact one-line preview of a Product Event's detail payload.
 * @param detail - The payload
 * @returns Up to ~80 chars of `key=value` pairs
 */
function preview(detail: unknown): string {
  if (detail === null || detail === undefined) return "";
  if (typeof detail !== "object") return String(detail).slice(0, 80);
  const text = Object.entries(detail as Record<string, unknown>)
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("  ");
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** Learner activity: the stream of Product Events, newest first, with the payload one click away. */
export function LearnerActivity() {
  const range = useTimeRange();
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const href = useHref();
  const kind = search.get("kind") ?? "";
  const page = Math.max(0, Number(search.get("page") ?? 0) || 0);
  const [open, setOpen] = useState<string | null>(null);
  const state = useOps<OpsPage<OpsProductEventRow>>("product-events", {
    from: range.from,
    to: range.to,
    kind,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  return (
    <>
      <PageHeader title="Learner activity" description="Product Events: what Learners did, newest first." />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <Select label="Kind" value={kind} onChange={(e) => setParams({ kind: e.target.value })}>
            <option value="">All</option>
            {PRODUCT_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {humanize(k)}
              </option>
            ))}
          </Select>
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {state.loading && <Spinner />}
            {state.data && `${formatInt(state.data.total)} events`}
          </span>
        </div>
        <Async state={state} rows={10}>
          {(data) =>
            data.rows.length === 0 ? (
              <EmptyState title={kind ? "No events of this kind in this range." : "No Product Events in this range."} hint={kind ? undefined : CAPTURE_HINT} />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th className="w-6" />
                      <Th>Time</Th>
                      <Th>Event</Th>
                      <Th>Course Request</Th>
                      <Th>Learner</Th>
                      <Th>Detail</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((p) => (
                      <Fragment key={p.id}>
                        <Tr onClick={() => setOpen(open === p.id ? null : p.id)} active={open === p.id}>
                          <Td>{open === p.id ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Td>
                          <Td className="tabular-nums text-muted-foreground" title={formatDateTime(p.createdAt)}>
                            {formatDateTime(p.createdAt)} <span className="text-[10px]">({formatAgo(p.createdAt)})</span>
                          </Td>
                          <Td>
                            <Tip content={<TipBody title={humanize(p.kind)}>{PRODUCT_EVENT_HELP[p.kind]}</TipBody>}>
                              <span className="flex items-center gap-1.5">
                                <span className="size-1.5 rotate-45 bg-ok/80" />
                                {humanize(p.kind)}
                              </span>
                            </Tip>
                          </Td>
                          <Td>
                            {p.courseRequestId ? (
                              <Link to={href(`/course-requests/${p.courseRequestId}`)} onClick={(e) => e.stopPropagation()} className="hover:text-ice">
                                <Mono id={p.courseRequestId} />
                              </Link>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </Td>
                          <Td>
                            <Mono id={p.learnerId} />
                          </Td>
                          <Td className="max-w-[28rem] truncate font-mono text-[11px] text-muted-foreground">{preview(p.detail)}</Td>
                        </Tr>
                        {open === p.id && (
                          <tr className="animate-fade-in border-b border-border/60">
                            <td />
                            <td colSpan={5} className="px-2.5 py-2">
                              <CodeBlock title="Detail" value={p.detail} defaultOpen />
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
