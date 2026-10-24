import type { OpsPipelineEventDetail } from "@senoy/db/usage";
import { ArrowRight, ArrowUp } from "lucide-react";
import { Link } from "react-router-dom";
import { CodeBlock, CopyButton } from "@/components/CodeBlock";
import { CostSplitCell } from "@/components/Cost";
import { Drawer, DrawerSection } from "@/components/Drawer";
import { StepStatusBadge, kindLabel } from "@/components/Badges";
import { PipelineEventTable } from "@/components/PipelineEventTable";
import { UsageRecordTable } from "@/components/UsageRecordTable";
import { Async, EmptyState } from "@/components/States";
import { Button, Field, Mono } from "@/components/ui";
import { formatDateTime, formatDuration } from "@/lib/format";
import { useDrawers, useHref } from "@/lib/nav";
import { useOps } from "@/lib/useOps";

/**
 * The Pipeline Event drawer: the step's fields, error, detail payload, child steps, and its own Usage Records.
 * @param props.id - Pipeline Event id
 */
export function PipelineEventDrawer({ id }: { id: string }) {
  const { close } = useDrawers();
  const state = useOps<OpsPipelineEventDetail>(`pipeline-events/${encodeURIComponent(id)}`);
  const e = state.data;
  return (
    <Drawer
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          {e ? kindLabel(e.kind) : "Pipeline step"}
          {e?.label && <span className="font-normal text-muted-foreground">· {e.label}</span>}
          {e && <StepStatusBadge status={e.status} />}
        </span>
      }
      subtitle={
        <span className="flex items-center gap-1">
          Pipeline Event <Mono id={id} full /> <CopyButton text={id} label="" />
        </span>
      }
    >
      <Async state={state} rows={8}>
        {(event) => <StepBody event={event} />}
      </Async>
    </Drawer>
  );
}

/**
 * The drawer's content once loaded.
 * @param props.event - The full Pipeline Event
 */
function StepBody({ event: e }: { event: OpsPipelineEventDetail }) {
  const { openStep } = useDrawers();
  const href = useHref();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        {e.courseRequestId && (
          <Link to={href(`/course-requests/${e.courseRequestId}`)} className="rounded bg-secondary px-1.5 py-0.5 hover:bg-accent">
            Course Request: {e.courseRequestSubject ?? e.courseRequestId.slice(0, 8)}
          </Link>
        )}
        {e.parentId && (
          <Button onClick={() => openStep(e.parentId!)}>
            <ArrowUp className="size-3" /> Parent step
          </Button>
        )}
        <Link to={href("/calls", { pipelineEventId: e.id })} className="text-muted-foreground hover:text-foreground">
          Calls in Calls view <ArrowRight className="inline size-3" />
        </Link>
      </div>

      <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Field label="Cost (incl. children)">
          <CostSplitCell split={e} />
        </Field>
        <Field label="Duration">{e.status === "running" ? "running" : formatDuration(e.durationMs)}</Field>
        <Field label="Calls">
          {e.calls}
          {e.failedCalls > 0 && <span className="text-bad"> · {e.failedCalls} failed</span>}
        </Field>
        <Field label="Children">{e.children.length}</Field>
        <Field label="Started">{formatDateTime(e.startedAt)}</Field>
        <Field label="Finished">{formatDateTime(e.finishedAt)}</Field>
      </dl>

      {e.error && (
        <DrawerSection title="Error" actions={<CopyButton text={e.error} />}>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-bad/30 bg-bad/10 p-2 font-mono text-[11px] text-bad">
            {e.error}
          </pre>
        </DrawerSection>
      )}

      {e.detail !== null && e.detail !== undefined && (
        <DrawerSection title="Detail">
          <CodeBlock title="Step detail" value={e.detail} defaultOpen />
        </DrawerSection>
      )}

      {e.children.length > 0 && (
        <DrawerSection title={`Child steps (${e.children.length})`}>
          <div className="rounded-md border">
            <PipelineEventTable rows={e.children} hideCourseRequest />
          </div>
        </DrawerSection>
      )}

      <DrawerSection title={`Usage Records in this step (${e.usageRecords.length})`}>
        {e.usageRecords.length === 0 ? (
          <EmptyState
            title="No calls directly under this step"
            hint={e.children.length ? "Its calls belong to the child steps above." : undefined}
            className="py-5"
          />
        ) : (
          <div className="rounded-md border">
            <UsageRecordTable rows={e.usageRecords} hideCourseRequest hideStep />
          </div>
        )}
      </DrawerSection>
    </>
  );
}
