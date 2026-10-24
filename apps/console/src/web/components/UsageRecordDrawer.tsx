import type { ModelUsageRequest, OpsUsageRecordDetail, OpsUsageRecordRow } from "@senoy/db/usage";
import { ArrowRight, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { CodeBlock, CopyButton } from "@/components/CodeBlock";
import { CostCell } from "@/components/Cost";
import { Drawer, DrawerSection } from "@/components/Drawer";
import { OutcomeBadge, RoleBadge, StepStatusBadge, kindLabel } from "@/components/Badges";
import { Async } from "@/components/States";
import { Field, Mono } from "@/components/ui";
import { formatDateTime, formatDuration, formatInt, formatUsd } from "@/lib/format";
import { useDrawers, useHref } from "@/lib/nav";
import { useOps } from "@/lib/useOps";
import { METRIC_HELP } from "@/lib/glossary";
import { BASIS_LABEL, tryLabel } from "@/lib/labels";
import { cn } from "@/lib/cn";

/**
 * Narrows a stored request to the model-call shape (it has a system prompt).
 * @param request - The stored request payload
 * @returns True for a model Usage Record request
 */
function isModelRequest(request: unknown): request is ModelUsageRequest {
  return typeof request === "object" && request !== null && "systemPrompt" in request;
}

/**
 * The Usage Record drawer: every field, the retry chain, the pipeline path, and the full prompt and response.
 * @param props.id - Usage Record id
 */
export function UsageRecordDrawer({ id }: { id: string }) {
  const { close } = useDrawers();
  const state = useOps<OpsUsageRecordDetail>(`usage-records/${encodeURIComponent(id)}`);
  const r = state.data;

  return (
    <Drawer
      onClose={close}
      title={
        <span className="flex items-center gap-2">
          <span className="font-mono text-sm">{r?.modelId ?? "Usage Record"}</span>
          {r && <OutcomeBadge outcome={r.outcome} invalidCause={r.invalidCause} httpStatus={r.httpStatus} />}
        </span>
      }
      subtitle={
        <span className="flex items-center gap-1">
          Usage Record <Mono id={id} full /> <CopyButton text={id} label="" />
        </span>
      }
    >
      <Async state={state} rows={8}>
        {(record) => <UsageRecordBody record={record} />}
      </Async>
    </Drawer>
  );
}

/**
 * The drawer's content once loaded.
 * @param props.record - The full Usage Record
 */
function UsageRecordBody({ record: r }: { record: OpsUsageRecordDetail }) {
  const { openStep } = useDrawers();
  const href = useHref();
  const path = [...r.pipelinePath].reverse();
  const request = r.request;

  return (
    <>
      {(r.courseRequestId || path.length > 0) && (
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs" aria-label="Pipeline path">
          {r.courseRequestId && (
            <Link to={href(`/course-requests/${r.courseRequestId}`)} className="rounded bg-secondary px-1.5 py-0.5 hover:bg-accent">
              {r.courseRequestSubject ?? r.courseRequestId.slice(0, 8)}
            </Link>
          )}
          {path.map((step) => (
            <span key={step.id} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                type="button"
                onClick={() => openStep(step.id)}
                className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 hover:bg-accent"
                title={`${step.status}${step.error ? ` — ${step.error}` : ""}`}
              >
                {kindLabel(step.kind)}
                {step.label && <span className="text-muted-foreground">· {step.label}</span>}
                {step.status !== "ok" && <StepStatusBadge status={step.status} />}
              </button>
            </span>
          ))}
        </nav>
      )}

      <dl className="mb-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Field label="Cost">
          <CostCell usd={r.costUsd} basis={r.costBasis} /> <span className="text-xs text-muted-foreground">{BASIS_LABEL[r.costBasis]}</span>
        </Field>
        <Field label="Duration">
          {formatDuration(r.durationMs)}
          {isModelRequest(request) && (
            <span className="text-xs text-muted-foreground"> / {formatDuration(request.timeoutMs)} timeout</span>
          )}
        </Field>
        <Field label="Role">
          <RoleBadge role={r.role} />
        </Field>
        <Field label="Attempt" tip={METRIC_HELP.attempt}>{r.attempt}</Field>
        <Field label="Vendor">{r.vendor}</Field>
        <Field label="Provider" tip="The OpenRouter host that served the call. Helps spot one bad host (ADR 0015).">{r.provider ?? "—"}</Field>
        <Field label="Response id">
          <Mono id={r.responseId} full />
        </Field>
        <Field label="Recorded">{formatDateTime(r.createdAt)}</Field>
        <Field label="Tokens in" tip={METRIC_HELP.tokensIn}>{r.promptTokens === null ? "—" : formatInt(r.promptTokens)}</Field>
        <Field label="Cached tokens" tip={METRIC_HELP.cached}>{r.cachedTokens === null ? "—" : formatInt(r.cachedTokens)}</Field>
        <Field label="Tokens out" tip={METRIC_HELP.tokensOut}>{r.completionTokens === null ? "—" : formatInt(r.completionTokens)}</Field>
        <Field label="Reasoning tokens" tip={METRIC_HELP.reasoning}>{r.reasoningTokens === null ? "—" : formatInt(r.reasoningTokens)}</Field>
      </dl>

      {r.error && (
        <DrawerSection title="Error" actions={<CopyButton text={r.error} />}>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-md border border-bad/30 bg-bad/10 p-2 font-mono text-[11px] text-bad">
            {r.error}
          </pre>
        </DrawerSection>
      )}

      <RetryChain current={r} siblings={r.siblings} />

      <DrawerSection
        title="Payloads"
        actions={
          r.pipelineEventId ? (
            <Link to={href("/calls", { pipelineEventId: r.pipelineEventId })} className="text-xs text-muted-foreground hover:text-foreground">
              All calls in this step <ArrowRight className="inline size-3" />
            </Link>
          ) : undefined
        }
      >
        <div className="space-y-2">
          {isModelRequest(request) ? (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  schema <span className="font-mono text-foreground">{request.schemaName}</span>
                </span>
                {request.providerOrder && (
                  <span>
                    provider order <span className="font-mono text-foreground">{request.providerOrder.join(" → ")}</span>
                  </span>
                )}
                {request.reasoning !== undefined && (
                  <span>
                    reasoning <span className="font-mono text-foreground">{JSON.stringify(request.reasoning)}</span>
                  </span>
                )}
              </div>
              <CodeBlock title="System prompt" value={request.systemPrompt} />
              <CodeBlock title="Input" value={request.input} defaultOpen />
            </>
          ) : (
            <CodeBlock title="Request" value={request} defaultOpen />
          )}
          <CodeBlock title="Raw response" value={r.response} defaultOpen={r.outcome !== "ok"} />
          {isModelRequest(request) && <CodeBlock title="Full request (as stored)" value={request} />}
        </div>
      </DrawerSection>
    </>
  );
}

/**
 * The retry chain: every attempt in the same Pipeline Event, in order, with the money each one cost.
 * @param props.current - The record the drawer shows
 * @param props.siblings - The other attempts
 */
function RetryChain({ current, siblings }: { current: OpsUsageRecordRow; siblings: OpsUsageRecordRow[] }) {
  const { openCall } = useDrawers();
  const chain = [...siblings.filter((s) => s.id !== current.id), current].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.attempt - b.attempt,
  );
  if (chain.length <= 1) return null;
  const wasted = chain.filter((c) => c.outcome !== "ok").reduce((sum, c) => sum + (c.costUsd ?? 0), 0);

  return (
    <DrawerSection
      title={`Attempts in this step (${chain.length})`}
      actions={wasted > 0 ? <span className="text-xs text-muted-foreground">{formatUsd(wasted)} spent on failed attempts</span> : undefined}
    >
      <ol className="flex flex-wrap items-stretch gap-1.5">
        {chain.map((c, i) => (
          <li key={c.id} className="flex items-center gap-1.5">
            {i > 0 && <ArrowRight className="size-3 text-muted-foreground" />}
            <button
              type="button"
              onClick={() => openCall(c.id)}
              className={cn(
                "flex flex-col items-start gap-1 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:border-ice/30 hover:bg-ice/[0.06]",
                c.id === current.id && "border-ice/60 bg-ice/10",
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{tryLabel(c.attempt)}</span>
                <span className="max-w-[12rem] truncate font-mono text-[11px]">{c.modelId}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <OutcomeBadge outcome={c.outcome} invalidCause={c.invalidCause} httpStatus={c.httpStatus} />
                <CostCell usd={c.costUsd} basis={c.costBasis} />
                <span className="text-muted-foreground">{formatDuration(c.durationMs)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </DrawerSection>
  );
}
