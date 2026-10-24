import type { OpsApiRequestRow, OpsApiRouteRow, OpsPage } from "@senoy/db/usage";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { HttpBadge } from "@/components/Badges";
import { Async, CAPTURE_HINT, EmptyState, Spinner } from "@/components/States";
import { Pager, Table, Td, Th, Tr } from "@/components/Table";
import { ActiveFilters, Card } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { METRIC_HELP } from "@/lib/glossary";
import { formatDateTime, formatDuration, formatInt, formatPct, ratio } from "@/lib/format";
import { useSetParams } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Rows per page for recent requests. */
const PAGE_SIZE = 50;

/** Sortable route columns. */
type RouteSort = "count" | "errors" | "p95Ms" | "maxMs";

/**
 * API traffic: per-route volume, errors, and latency for the platform's own API, and the recent requests list
 * (filter by route or errors only).
 */
export function ApiTraffic() {
  const range = useTimeRange();
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const route = search.get("route") ?? "";
  const errorsOnly = search.get("errorsOnly") === "1" || search.get("errorsOnly") === "true";
  const page = Math.max(0, Number(search.get("page") ?? 0) || 0);
  const [sort, setSort] = useState<RouteSort>("count");

  const routes = useOps<OpsApiRouteRow[]>("api-routes", { from: range.from, to: range.to });
  const requests = useOps<OpsPage<OpsApiRequestRow>>("api-requests", {
    from: range.from,
    to: range.to,
    route,
    errorsOnly: errorsOnly || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const chips = [
    ...(route ? [{ key: "route", label: `route: ${route}`, onRemove: () => setParams({ route: undefined }) }] : []),
    ...(errorsOnly ? [{ key: "err", label: "errors only", onRemove: () => setParams({ errorsOnly: undefined }) }] : []),
  ];

  return (
    <>
      <PageHeader title="API traffic" description="API Requests: hits on the platform's own HTTP API (not external calls)." />
      <div className="space-y-4">
        <Card title="Routes" subtitle="Click a route to filter recent requests." actions={routes.loading && <Spinner />}>
          <Async state={routes} rows={6}>
            {(rows) =>
              rows.length === 0 ? (
                <EmptyState title="No API Requests in this range." hint={CAPTURE_HINT} />
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>Route</Th>
                      <Th numeric sorted={sort === "count"} onSort={() => setSort("count")}>
                        Requests
                      </Th>
                      <Th numeric sorted={sort === "errors"} onSort={() => setSort("errors")} tip="Responses with status ≥ 400.">
                        Errors
                      </Th>
                      <Th numeric tip={METRIC_HELP.usual}>Usual time</Th>
                      <Th numeric sorted={sort === "p95Ms"} onSort={() => setSort("p95Ms")} tip={METRIC_HELP.slowest}>
                        Slowest times
                      </Th>
                      <Th numeric sorted={sort === "maxMs"} onSort={() => setSort("maxMs")} tip={METRIC_HELP.longest}>
                        Longest
                      </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows]
                      .sort((a, b) => (b[sort] ?? 0) - (a[sort] ?? 0))
                      .map((r) => {
                        const errRate = ratio(r.errors, r.count);
                        return (
                          <Tr key={`${r.method} ${r.route}`} onClick={() => setParams({ route: r.route })} active={route === r.route}>
                            <Td className="font-mono text-[11px]">
                              <span className="mr-2 inline-block w-12 text-muted-foreground">{r.method}</span>
                              {r.route}
                            </Td>
                            <Td numeric>{formatInt(r.count)}</Td>
                            <Td numeric className={cn(r.errors ? "text-bad" : "text-muted-foreground")}>
                              {formatInt(r.errors)} <span className="text-[10px] opacity-70">({formatPct(errRate, 0)})</span>
                            </Td>
                            <Td numeric>{formatDuration(r.p50Ms)}</Td>
                            <Td numeric>{formatDuration(r.p95Ms)}</Td>
                            <Td numeric className="text-muted-foreground">
                              {formatDuration(r.maxMs)}
                            </Td>
                          </Tr>
                        );
                      })}
                  </tbody>
                </Table>
              )
            }
          </Async>
        </Card>

        <Card
          title="Recent requests"
          actions={
            <>
              {requests.loading && <Spinner />}
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={errorsOnly}
                  onChange={(e) => setParams({ errorsOnly: e.target.checked ? 1 : undefined })}
                  className="accent-[#8ccbf5]"
                />
                Errors only
              </label>
            </>
          }
        >
          {chips.length > 0 && (
            <div className="border-b px-3 py-2">
              <ActiveFilters chips={chips} onClear={() => setParams({ route: undefined, errorsOnly: undefined })} />
            </div>
          )}
          <Async state={requests} rows={8}>
            {(data) =>
              data.rows.length === 0 ? (
                <EmptyState title={chips.length ? "No requests match." : "No API Requests in this range."} hint={chips.length ? undefined : CAPTURE_HINT} />
              ) : (
                <>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Time</Th>
                        <Th>Status</Th>
                        <Th>Method</Th>
                        <Th>URL</Th>
                        <Th numeric>Duration</Th>
                        <Th>Error</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r) => (
                        <Tr key={r.id} tone={r.statusCode >= 500 ? "failed" : undefined}>
                          <Td className="tabular-nums text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                          <Td>
                            <HttpBadge code={r.statusCode} />
                          </Td>
                          <Td className="font-mono text-[11px] text-muted-foreground">{r.method}</Td>
                          <Td className="max-w-[28rem] truncate font-mono text-[11px]" title={`${r.route}\n${r.url}`}>
                            {r.url}
                          </Td>
                          <Td numeric>{formatDuration(r.durationMs)}</Td>
                          <Td className="max-w-[24rem] truncate text-bad" title={r.error ?? undefined}>
                            {r.error ?? ""}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                  <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(n) => setParams({ page: n || undefined }, { keepPage: true })} />
                </>
              )
            }
          </Async>
        </Card>
      </div>
    </>
  );
}
