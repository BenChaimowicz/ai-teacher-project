import { PIPELINE_EVENT_KINDS, PIPELINE_EVENT_STATUSES, type OpsPage, type OpsPipelineEventRow } from "@senoy/db/usage";
import { useSearchParams } from "react-router-dom";
import { CostLegend } from "@/components/Cost";
import { kindLabel } from "@/components/Badges";
import { PipelineEventTable } from "@/components/PipelineEventTable";
import { Async, CAPTURE_HINT, EmptyState, Spinner } from "@/components/States";
import { Pager } from "@/components/Table";
import { ActiveFilters, Card, Select } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { formatInt, shortId } from "@/lib/format";
import { useSetParams } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";

/** Rows per page. */
const PAGE_SIZE = 50;

/** Pipeline steps: every Pipeline Event with filters. Rows open the step drawer (children and calls). */
export function PipelineSteps() {
  const range = useTimeRange();
  const [search] = useSearchParams();
  const setParams = useSetParams();
  const get = (k: string) => search.get(k) ?? "";
  const page = Math.max(0, Number(search.get("page") ?? 0) || 0);
  const state = useOps<OpsPage<OpsPipelineEventRow>>("pipeline-events", {
    from: range.from,
    to: range.to,
    kind: get("kind"),
    status: get("status"),
    courseRequestId: get("courseRequestId"),
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const chips = get("courseRequestId")
    ? [{ key: "cr", label: `Course Request: ${shortId(get("courseRequestId"))}`, onRemove: () => setParams({ courseRequestId: undefined }) }]
    : [];

  return (
    <>
      <PageHeader
        title="Pipeline steps"
        description="Pipeline Events: the platform's own steps, each grouping the calls it caused. Cost includes child steps."
        actions={<CostLegend />}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <Select label="Step" value={get("kind")} onChange={(e) => setParams({ kind: e.target.value })}>
            <option value="">All</option>
            {PIPELINE_EVENT_KINDS.map((k) => (
              <option key={k} value={k}>
                {kindLabel(k)}
              </option>
            ))}
          </Select>
          <Select label="Status" value={get("status")} onChange={(e) => setParams({ status: e.target.value })}>
            <option value="">All</option>
            {PIPELINE_EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <ActiveFilters chips={chips} onClear={() => setParams({ courseRequestId: undefined })} />
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            {state.loading && <Spinner />}
            {state.data && `${formatInt(state.data.total)} steps`}
          </span>
        </div>
        <Async state={state} rows={12}>
          {(data) =>
            data.rows.length === 0 ? (
              <EmptyState
                title={get("kind") || get("status") ? "No steps match these filters." : "No Pipeline Events in this range."}
                hint={get("kind") || get("status") ? "Clear a filter or widen the time range." : CAPTURE_HINT}
              />
            ) : (
              <>
                <PipelineEventTable rows={data.rows} />
                <Pager page={page} pageSize={PAGE_SIZE} total={data.total} onPage={(p) => setParams({ page: p || undefined }, { keepPage: true })} />
              </>
            )
          }
        </Async>
      </Card>
    </>
  );
}
