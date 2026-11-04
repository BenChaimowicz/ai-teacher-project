import type { ResearchTierRating } from "@senoy/db/course-request";
import type { CostSplit, OpsCourseRequestDetail, OpsUsageRecordRow } from "@senoy/db/usage";
import { ArrowLeft, ScrollText } from "lucide-react";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { CostLegend, CostSplitCell } from "@/components/Cost";
import { KindName, StatusPill } from "@/components/Badges";
import { Async, EmptyState } from "@/components/States";
import { Table, Td, Th, Tr } from "@/components/Table";
import { Timeline } from "@/components/Timeline";
import { UsageRecordTable } from "@/components/UsageRecordTable";
import { Card, Field, Mono } from "@/components/ui";
import { PageHeader } from "@/components/PageHeader";
import { CopyButton } from "@/components/CodeBlock";
import { METRIC_HELP, RESEARCH_TIER_HELP } from "@/lib/glossary";
import { RESEARCH_TIER_LABEL } from "@/lib/labels";
import { formatDateTime, formatDuration, formatInt, formatPct, humanize, ratio } from "@/lib/format";
import { useGo, useHref } from "@/lib/nav";
import { useOps } from "@/lib/useOps";
import { courseRequestTone } from "@/views/CourseRequests";

/** Per-step totals for one Course Request. */
type StepTotal = CostSplit & { kind: string | null; calls: number; failedCalls: number; callMs: number };

/**
 * Sums a Course Request's Usage Records per Pipeline step kind.
 * @param records - Every Usage Record of the Course Request
 * @returns Totals, most expensive first
 */
function totalsByKind(records: OpsUsageRecordRow[]): StepTotal[] {
  const map = new Map<string, StepTotal>();
  for (const r of records) {
    const key = r.pipelineKind ?? "";
    const t = map.get(key) ?? { kind: r.pipelineKind, calls: 0, failedCalls: 0, callMs: 0, actualUsd: 0, estimatedUsd: 0, totalUsd: 0, unknownCount: 0 };
    t.calls += 1;
    if (r.outcome !== "ok") t.failedCalls += 1;
    t.callMs += r.durationMs ?? 0;
    if (r.costBasis === "unknown" || r.costUsd === null) t.unknownCount += 1;
    else {
      if (r.costBasis === "actual") t.actualUsd += r.costUsd;
      else t.estimatedUsd += r.costUsd;
      t.totalUsd += r.costUsd;
    }
    map.set(key, t);
  }
  return [...map.values()].sort((a, b) => b.totalUsd - a.totalUsd);
}

/**
 * The rating's three answers in a line, e.g. `niche no · scholarly yes · dense yes`.
 * @param rating - The triage model's rating
 */
function ratingAnswers(rating: ResearchTierRating): string {
  return (["niche", "scholarly", "dense"] as const).map((question) => `${question} ${rating[question] ? "yes" : "no"}`).join(" · ");
}

/**
 * The research tier every Reading of the Course uses, and the rating behind it (SEN-124). Before generation there is
 * none; a tier with no rating means the rating failed.
 * @param props.cr - The Course Request detail
 */
function ResearchTierLine({ cr }: { cr: OpsCourseRequestDetail }) {
  if (!cr.researchTier) return null;
  const rating = cr.researchTierRating;
  return (
    <div className="glass mb-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border px-4 py-2 text-xs">
      <Field label="Research tier" tip={RESEARCH_TIER_HELP.tier}>
        {RESEARCH_TIER_LABEL[cr.researchTier] ?? cr.researchTier}
      </Field>
      <Field label="Rating" tip={RESEARCH_TIER_HELP.rating} className="min-w-[14rem] flex-1">
        {rating ? (
          <span className="whitespace-normal">
            <span className="font-mono">{ratingAnswers(rating)}</span>
            <span className="text-muted-foreground"> · {rating.reason}</span>
            <span className="text-muted-foreground"> · {rating.modelId}</span>
          </span>
        ) : (
          <span className="text-est">Rating failed, so the tier fell back to its default.</span>
        )}
      </Field>
    </div>
  );
}

/**
 * The Course Request's Generation jobs, each with a link to its Log Entries, and one to the whole Request's.
 * @param props.cr - The Course Request detail
 */
function JobsCard({ cr }: { cr: OpsCourseRequestDetail }) {
  const href = useHref();
  return (
    <Card
      title={`Generation jobs (${cr.jobs.length})`}
      subtitle="Each job's worker Log Entries carry its id."
      className="mb-4"
      actions={
        <Link to={href("/logs", { courseRequestId: cr.id })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-ice">
          <ScrollText className="size-3" /> Logs for this Course Request
        </Link>
      }
    >
      {cr.jobs.length === 0 ? (
        <EmptyState title="No Generation jobs for this Course Request." className="py-5" />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>Kind</Th>
              <Th>Status</Th>
              <Th>Stage</Th>
              <Th numeric>Claims</Th>
              <Th>Updated</Th>
              <Th>Logs</Th>
            </tr>
          </thead>
          <tbody>
            {cr.jobs.map((j) => (
              <Tr key={j.id}>
                <Td>
                  <Mono id={j.id} />
                </Td>
                <Td>{humanize(j.kind)}</Td>
                <Td>{humanize(j.status)}</Td>
                <Td className="text-muted-foreground">{j.stage ? humanize(j.stage) : "—"}</Td>
                <Td numeric>{j.claims}</Td>
                <Td className="tabular-nums text-muted-foreground">{formatDateTime(j.updatedAt)}</Td>
                <Td>
                  <span className="flex gap-3">
                    <Link to={href("/logs", { jobId: j.id })} className="hover:text-ice">
                      Job logs
                    </Link>
                    {j.requestId && (
                      <Link to={href("/logs", { requestId: j.requestId })} className="text-muted-foreground hover:text-ice" title="Everything from the request that queued it">
                        Request logs
                      </Link>
                    )}
                  </span>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/**
 * One Course Request: its totals, its research tier, a Gantt timeline of Pipeline Events with calls and Learner actions, the cost per
 * step, and every call.
 */
export function CourseRequestDetail() {
  const { id = "" } = useParams();
  const href = useHref();
  const state = useOps<OpsCourseRequestDetail>(`course-requests/${encodeURIComponent(id)}`);
  return (
    <>
      <Link to={href("/course-requests")} className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-ice">
        <ArrowLeft className="size-3" /> Course Requests
      </Link>
      <Async state={state} rows={12}>
        {(cr) => <Body cr={cr} />}
      </Async>
    </>
  );
}

/**
 * The detail once loaded.
 * @param props.cr - The Course Request detail
 */
function Body({ cr }: { cr: OpsCourseRequestDetail }) {
  const go = useGo();
  const steps = useMemo(() => totalsByKind(cr.usageRecords), [cr.usageRecords]);
  const failedSteps = cr.events.filter((e) => e.status === "failed").length;

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {cr.subject}
            <StatusPill tone={courseRequestTone(cr.status)}>{humanize(cr.status)}</StatusPill>
          </span>
        }
        description={cr.learningGoal}
        actions={<CostLegend />}
      />
      <div className="glass mb-4 grid grid-cols-2 gap-4 rounded-xl border px-4 py-3 md:grid-cols-6">
        <Field label="Cost">
          <CostSplitCell split={cr} calls={cr.calls} />
        </Field>
        <Field label="Calls">
          {formatInt(cr.calls)}
          {cr.failedCalls > 0 && <span className="text-bad"> · {cr.failedCalls} failed ({formatPct(ratio(cr.failedCalls, cr.calls), 0)})</span>}
        </Field>
        <Field label="Pipeline steps">
          {formatInt(cr.events.length)}
          {failedSteps > 0 && <span className="text-bad"> · {failedSteps} failed</span>}
        </Field>
        <Field label="Start to finish" tip={METRIC_HELP.wallTime}>
          {formatDuration(cr.wallMs)}
        </Field>
        <Field label="Created">{formatDateTime(cr.createdAt)}</Field>
        <Field label="Id">
          <span className="inline-flex items-center gap-1">
            <Mono id={cr.id} /> <CopyButton text={cr.id} label="" />
          </span>
        </Field>
      </div>
      <ResearchTierLine cr={cr} />
      <JobsCard cr={cr} />

      <Card title="Timeline" subtitle="Pipeline Events nested by parent. Click a bar for the step, a tick for the call." className="mb-4">
        {cr.events.length === 0 && cr.usageRecords.length === 0 ? (
          <EmptyState title="No Pipeline Events or calls recorded for this Course Request." hint="It may predate capture (migration 0016)." />
        ) : (
          <Timeline events={cr.events} records={cr.usageRecords} productEvents={cr.productEvents} />
        )}
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Cost per step" subtitle="Summed from this Course Request's calls." className="xl:col-span-1">
          <Table>
            <thead>
              <tr>
                <Th>Step</Th>
                <Th numeric>Cost</Th>
                <Th numeric>Calls</Th>
                <Th numeric tip="Sum of call durations (calls can overlap, so this can exceed wall time).">
                  Call time
                </Th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => (
                <Tr key={s.kind ?? "none"} onClick={() => go("/calls", { courseRequestId: cr.id, pipelineKind: s.kind ?? undefined })}>
                  <Td>
                    <KindName kind={s.kind} />
                  </Td>
                  <Td numeric>
                    <CostSplitCell split={s} compact calls={s.calls} />
                  </Td>
                  <Td numeric>
                    {s.calls}
                    {s.failedCalls > 0 && <span className="text-bad"> ({s.failedCalls}✕)</span>}
                  </Td>
                  <Td numeric>{formatDuration(s.callMs)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card title={`Calls (${cr.usageRecords.length})`} className="xl:col-span-2">
          {cr.usageRecords.length === 0 ? (
            <EmptyState title="No calls recorded." />
          ) : (
            <div className="max-h-[32rem] overflow-y-auto">
              <UsageRecordTable rows={cr.usageRecords} hideCourseRequest />
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
