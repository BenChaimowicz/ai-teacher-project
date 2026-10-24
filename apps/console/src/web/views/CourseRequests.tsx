import type { OpsCourseRequestRow, OpsPage } from "@senoy/db/usage";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CostLegend, CostSplitCell } from "@/components/Cost";
import { StatusPill } from "@/components/Badges";
import { Async, CAPTURE_HINT, EmptyState, Spinner } from "@/components/States";
import { Pager, Table, Td, Th, Tr } from "@/components/Table";
import { Card, Mono } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { METRIC_HELP } from "@/lib/glossary";
import { formatDateTime, formatDuration, formatInt, humanize } from "@/lib/format";
import type { StatusTone } from "@/lib/palette";
import { useHref, useSetParams } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";

/** Rows per page. */
const PAGE_SIZE = 50;

/**
 * Picks a tone for a Course Request status string (statuses live in the course-request module, so match loosely).
 * @param status - e.g. `published`, `generation_failed`, `rejected`, `generating`
 * @returns The tone
 */
export function courseRequestTone(status: string): StatusTone {
  if (/fail|reject|error/.test(status)) return "critical";
  if (/publish|complete/.test(status)) return "good";
  if (/cancel/.test(status)) return "neutral";
  return "running";
}

/** Course Requests: each one with what it cost, how many calls failed, and how long it took end to end. */
export function CourseRequests() {
  const range = useTimeRange();
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const navigate = useNavigate();
  const href = useHref();
  const page = Math.max(0, Number(search.get("page") ?? 0) || 0);
  const state = useOps<OpsPage<OpsCourseRequestRow>>("course-requests", {
    from: range.from,
    to: range.to,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  return (
    <>
      <PageHeader
        title="Course Requests"
        description="What each Course Request cost, how often its calls failed, and how long it took. Open one for its timeline."
        actions={
          <>
            {state.loading && <Spinner />}
            <CostLegend />
          </>
        }
      />
      <Card>
        <Async state={state} rows={10}>
          {(data) =>
            data.rows.length === 0 ? (
              <EmptyState title="No Course Requests with activity in this range." hint={CAPTURE_HINT} />
            ) : (
              <>
                <Table>
                  <thead>
                    <tr>
                      <Th>Created</Th>
                      <Th>Subject · Learning Goal</Th>
                      <Th>Status</Th>
                      <Th numeric>Cost</Th>
                      <Th numeric>Calls</Th>
                      <Th numeric>Failed</Th>
                      <Th numeric tip={METRIC_HELP.wallTime}>Start to finish</Th>
                      <Th>Id</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <Tr key={r.id} onClick={() => navigate(href(`/course-requests/${r.id}`))}>
                        <Td className="tabular-nums text-muted-foreground">{formatDateTime(r.createdAt)}</Td>
                        <Td className="max-w-[28rem]">
                          <div className="truncate font-medium">{r.subject}</div>
                          <div className="truncate text-[11px] text-muted-foreground" title={r.learningGoal}>
                            {r.learningGoal}
                          </div>
                        </Td>
                        <Td>
                          <StatusPill tone={courseRequestTone(r.status)}>{humanize(r.status)}</StatusPill>
                        </Td>
                        <Td numeric>
                          <CostSplitCell split={r} calls={r.calls} />
                        </Td>
                        <Td numeric>{formatInt(r.calls)}</Td>
                        <Td numeric className={r.failedCalls ? "text-bad" : "text-muted-foreground"}>
                          {r.failedCalls}
                        </Td>
                        <Td numeric>{formatDuration(r.wallMs)}</Td>
                        <Td>
                          <Mono id={r.id} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
                <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(p) => setParams({ page: p || undefined }, { keepPage: true })} />
              </>
            )
          }
        </Async>
      </Card>
    </>
  );
}
