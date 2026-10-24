import type { OpsCourseRequestRow } from "@senoy/db/usage";
import { useNavigate } from "react-router-dom";
import { CostSplitCell } from "@/components/Cost";
import { CardEmpty } from "@/components/States";
import { Table, Td, Th, Tr } from "@/components/Table";
import { formatDuration, humanize } from "@/lib/format";
import { useHref } from "@/lib/nav";
import { METRIC_HELP } from "@/lib/glossary";

/**
 * The most expensive Course Requests in the range; rows open the Course Request timeline.
 * @param props.rows - `topCourseRequests` from the summary
 */
export function TopCourseRequests({ rows }: { rows: OpsCourseRequestRow[] }) {
  const navigate = useNavigate();
  const href = useHref();
  if (rows.length === 0) return <CardEmpty text="No Course Requests in this range." />;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Subject</Th>
          <Th numeric>Cost</Th>
          <Th numeric>Calls</Th>
          <Th numeric tip={METRIC_HELP.wallTime}>Start to finish</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <Tr key={r.id} onClick={() => navigate(href(`/course-requests/${r.id}`))}>
            <Td className="max-w-[12rem]">
              <div className="truncate" title={r.learningGoal}>
                {r.subject}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">{humanize(r.status)}</div>
            </Td>
            <Td numeric>
              <CostSplitCell split={r} compact calls={r.calls} />
            </Td>
            <Td numeric>
              {r.calls}
              {r.failedCalls > 0 && <span className="text-bad"> ({r.failedCalls}✕)</span>}
            </Td>
            <Td numeric>{formatDuration(r.wallMs)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
