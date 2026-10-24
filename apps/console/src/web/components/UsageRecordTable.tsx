import type { OpsUsageRecordQuery, OpsUsageRecordRow } from "@senoy/db/usage";
import { Link } from "react-router-dom";
import { MeasuredCostCell } from "@/components/Cost";
import { KindName, OutcomeBadge, RoleBadge } from "@/components/Badges";
import { METRIC_HELP } from "@/lib/glossary";
import { Table, Td, Th, Tr } from "@/components/Table";
import { formatDateTime, formatDuration, formatTokens } from "@/lib/format";
import { useDrawers, useHref } from "@/lib/nav";

/** Sort keys the usage-records route accepts. */
export type UsageSort = NonNullable<OpsUsageRecordQuery["sort"]>;

/**
 * The Usage Records table, shared by Calls, step drawers, and the Course Request timeline.
 * @param props.rows - Records to show
 * @param props.sort - Active server sort, if sortable
 * @param props.onSort - Change sort; omit for a non-sortable table
 * @param props.hideCourseRequest - Drop the Course Request column (when already scoped to one)
 * @param props.hideStep - Drop the step column (when already scoped to one step)
 */
export function UsageRecordTable({
  rows,
  sort,
  onSort,
  hideCourseRequest,
  hideStep,
}: {
  rows: OpsUsageRecordRow[];
  sort?: UsageSort;
  onSort?: (sort: UsageSort) => void;
  hideCourseRequest?: boolean;
  hideStep?: boolean;
}) {
  const { openCall, callId } = useDrawers();
  const href = useHref();
  const sortProps = (key: UsageSort) => (onSort ? { sorted: sort === key, onSort: () => onSort(key) } : {});

  return (
    <Table>
      <thead>
        <tr>
          <Th {...sortProps("createdAt")}>Time</Th>
          {!hideStep && <Th>Pipeline step</Th>}
          {!hideCourseRequest && <Th>Course Request</Th>}
          <Th>Role</Th>
          <Th>Model / adapter</Th>
          <Th numeric tip={METRIC_HELP.attempt}>
            Attempt
          </Th>
          <Th>Outcome</Th>
          <Th numeric tip={`${METRIC_HELP.tokensIn} Cached tokens in brackets.`}>
            Tokens in
          </Th>
          <Th numeric tip={METRIC_HELP.tokensOut}>
            Tokens out
          </Th>
          <Th numeric tip={METRIC_HELP.reasoning}>
            Reasoning
          </Th>
          <Th numeric {...sortProps("costUsd")} tip="$0.10 actual (vendor-reported) · ~$0.10 estimated (list price) · ? unknown (billed but unreported). Research calls also show the measured balance drop. Hover a cost for its basis.">
            Cost
          </Th>
          <Th numeric {...sortProps("durationMs")}>
            Duration
          </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.id} onClick={() => openCall(r.id)} active={callId === r.id} tone={r.outcome === "ok" ? undefined : "failed"}>
            <Td className="text-muted-foreground tabular-nums" title={r.createdAt}>
              {formatDateTime(r.createdAt)}
            </Td>
            {!hideStep && (
              <Td className="max-w-[16rem] truncate" title={r.pipelineLabel ?? undefined}>
                <KindName kind={r.pipelineKind} />
                {r.pipelineLabel && <span className="ml-1 text-muted-foreground">· {r.pipelineLabel}</span>}
              </Td>
            )}
            {!hideCourseRequest && (
              <Td className="max-w-[12rem] truncate">
                {r.courseRequestId ? (
                  <Link
                    to={href(`/course-requests/${r.courseRequestId}`)}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:underline"
                    title={r.courseRequestId}
                  >
                    {r.courseRequestSubject ?? r.courseRequestId.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
            )}
            <Td>
              <RoleBadge role={r.role} />
            </Td>
            <Td className="max-w-[16rem] truncate font-mono text-[11px]" title={`${r.vendor} · ${r.modelId}${r.provider ? ` via ${r.provider}` : ""}`}>
              {r.modelId}
              {r.provider && <span className="text-muted-foreground"> · {r.provider}</span>}
            </Td>
            <Td numeric>{r.attempt}</Td>
            <Td>
              <OutcomeBadge outcome={r.outcome} invalidCause={r.invalidCause} httpStatus={r.httpStatus} error={r.error} />
            </Td>
            <Td numeric>
              {formatTokens(r.promptTokens)}
              {r.cachedTokens ? <span className="text-muted-foreground"> ({formatTokens(r.cachedTokens)})</span> : null}
            </Td>
            <Td numeric>{formatTokens(r.completionTokens)}</Td>
            <Td numeric className="text-muted-foreground">
              {r.reasoningTokens ? formatTokens(r.reasoningTokens) : "—"}
            </Td>
            <Td numeric>
              <MeasuredCostCell record={r} />
            </Td>
            <Td numeric>{formatDuration(r.durationMs)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
