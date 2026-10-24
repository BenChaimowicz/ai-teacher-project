import type { OpsPipelineEventRow } from "@senoy/db/usage";
import { Link } from "react-router-dom";
import { CostSplitCell } from "@/components/Cost";
import { KindName, StepStatusBadge } from "@/components/Badges";
import { Mono } from "@/components/ui";
import { Table, Td, Th, Tr } from "@/components/Table";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useDrawers, useHref } from "@/lib/nav";

/**
 * The Pipeline Events table, shared by the Pipeline steps view and step drawers (children).
 * @param props.rows - Steps to show
 * @param props.hideCourseRequest - Drop the Course Request column
 */
export function PipelineEventTable({ rows, hideCourseRequest }: { rows: OpsPipelineEventRow[]; hideCourseRequest?: boolean }) {
  const { openStep, stepId } = useDrawers();
  const href = useHref();
  return (
    <Table>
      <thead>
        <tr>
          <Th>Started</Th>
          <Th>Step</Th>
          {!hideCourseRequest && <Th>Course Request</Th>}
          <Th>Status</Th>
          <Th>Error</Th>
          <Th numeric tip="Usage Records under this step, including its child steps.">
            Calls
          </Th>
          <Th numeric>Failed</Th>
          <Th numeric tip="Cost of every Usage Record under this step, including its child steps.">
            Cost
          </Th>
          <Th numeric>Duration</Th>
          <Th>Id</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e) => (
          <Tr key={e.id} onClick={() => openStep(e.id)} active={stepId === e.id} tone={e.status === "failed" ? "failed" : undefined}>
            <Td className="text-muted-foreground tabular-nums">{formatDateTime(e.startedAt)}</Td>
            <Td className="max-w-[18rem] truncate" title={e.label ?? undefined}>
              <KindName kind={e.kind} />
              {e.label && <span className="ml-1 text-muted-foreground">· {e.label}</span>}
            </Td>
            {!hideCourseRequest && (
              <Td className="max-w-[12rem] truncate">
                {e.courseRequestId ? (
                  <Link to={href(`/course-requests/${e.courseRequestId}`)} onClick={(ev) => ev.stopPropagation()} className="hover:underline">
                    {e.courseRequestSubject ?? e.courseRequestId.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
            )}
            <Td>
              <StepStatusBadge status={e.status} error={e.error} />
            </Td>
            <Td className="max-w-[18rem] truncate text-bad" title={e.error ?? undefined}>
              {e.error?.split("\n")[0] ?? ""}
            </Td>
            <Td numeric>{e.calls}</Td>
            <Td numeric className={e.failedCalls ? "text-bad" : "text-muted-foreground"}>
              {e.failedCalls}
            </Td>
            <Td numeric>
              <CostSplitCell split={e} compact />
            </Td>
            <Td numeric>{e.status === "running" ? <span className="text-muted-foreground">running</span> : formatDuration(e.durationMs)}</Td>
            <Td>
              <Mono id={e.id} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
