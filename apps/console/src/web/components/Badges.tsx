import type { PipelineEventKind, PipelineEventStatus, UsageOutcome, UsageRole } from "@senoy/db/usage";
import { AlertOctagon, AlertTriangle, CheckCircle2, CircleDashed, Clock, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Tip, TipBody } from "@/components/Tip";
import { INVALID_CAUSE_HELP, KIND_HELP, OUTCOME_HELP, ROLE_HELP } from "@/lib/glossary";
import { STEP_STATUS_LABEL, kindLabel, outcomeLabel, roleLabel } from "@/lib/labels";

export { kindLabel, roleLabel };
import { STATUS_COLORS, httpTone, outcomeTone, stepTone, type StatusTone } from "@/lib/palette";
import { cn } from "@/lib/cn";

/** Icon per status tone, so a status never relies on color alone. */
const TONE_ICON: Record<StatusTone, typeof CheckCircle2> = {
  good: CheckCircle2,
  warning: AlertTriangle,
  serious: Clock,
  critical: AlertOctagon,
  running: Loader2,
  neutral: CircleDashed,
};

/**
 * A status pill: icon + label, tinted by tone.
 * @param props.tone - Which status color
 * @param props.tip - Rich tooltip content
 */
export function StatusPill({ tone, children, tip }: { tone: StatusTone; children: ReactNode; tip?: ReactNode }) {
  const Icon = TONE_ICON[tone];
  const color = STATUS_COLORS[tone];
  const pill = (
    <span
      className="inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-px text-[11px] font-medium ring-1 ring-inset"
      style={{ backgroundColor: `${color}14`, color, ["--tw-ring-color" as string]: `${color}33` }}
    >
      <Icon className={cn("size-3 shrink-0", tone === "running" && "animate-spin")} />
      <span className="truncate">{children}</span>
    </span>
  );
  return tip ? <Tip content={tip}>{pill}</Tip> : pill;
}

/**
 * A Usage Record outcome, with its invalid cause or HTTP status, and a tooltip in plain words.
 * @param props.outcome - The outcome
 * @param props.invalidCause - `unparseable` / `schema` / `check` for invalid_output
 * @param props.httpStatus - Status for `http`
 * @param props.error - Full error text, shown in the tooltip
 */
export function OutcomeBadge({
  outcome,
  invalidCause,
  httpStatus,
  error,
}: {
  outcome: UsageOutcome;
  invalidCause?: string | null;
  httpStatus?: number | null;
  error?: string | null;
}) {
  const tip = (
    <TipBody title={outcomeLabel(outcome, invalidCause, httpStatus)}>
      <p>{OUTCOME_HELP[outcome] ?? outcome}</p>
      {invalidCause && <p className="mt-1">{INVALID_CAUSE_HELP[invalidCause] ?? invalidCause}</p>}
      {error && <p className="mt-1.5 line-clamp-6 break-words font-mono text-[11px] text-bad">{error}</p>}
    </TipBody>
  );
  return (
    <StatusPill tone={outcomeTone(outcome)} tip={tip}>
      {outcomeLabel(outcome, invalidCause, httpStatus)}
    </StatusPill>
  );
}

/**
 * A Pipeline Event status.
 * @param props.status - running / ok / failed
 * @param props.error - Error text for the tooltip
 */
export function StepStatusBadge({ status, error }: { status: PipelineEventStatus; error?: string | null }) {
  const help =
    status === "running"
      ? "Still running, or the worker stopped before it could record the end."
      : status === "ok"
        ? "The step finished."
        : "The step stopped with an error.";
  return (
    <StatusPill
      tone={stepTone(status)}
      tip={
        <TipBody title={STEP_STATUS_LABEL[status]}>
          <p>{help}</p>
          {error && <p className="mt-1.5 line-clamp-6 break-words font-mono text-[11px] text-bad">{error}</p>}
        </TipBody>
      }
    >
      {STEP_STATUS_LABEL[status]}
    </StatusPill>
  );
}

/**
 * An HTTP status code pill.
 * @param props.code - HTTP status
 */
export function HttpBadge({ code }: { code: number }) {
  return <StatusPill tone={httpTone(code)}>{code}</StatusPill>;
}

/**
 * A Pipeline step name with its meaning as a tooltip.
 * @param props.kind - The kind
 */
export function KindName({ kind }: { kind: string | null | undefined }) {
  const help = kind ? KIND_HELP[kind as PipelineEventKind] : "Calls made outside any recorded step.";
  return (
    <Tip content={help ? <TipBody title={kindLabel(kind)}>{help}</TipBody> : null}>
      <span>{kindLabel(kind)}</span>
    </Tip>
  );
}

/**
 * A role pill; fallbacks are tinted so retries-then-fallback stand out.
 * @param props.role - The role
 */
export function RoleBadge({ role }: { role: UsageRole }) {
  return (
    <Tip content={<TipBody title={roleLabel(role)}>{ROLE_HELP[role]}</TipBody>}>
      <span
        className={cn(
          "whitespace-nowrap rounded border px-1.5 py-px text-[11px]",
          role === "fallback_generator" ? "border-[#f0a37a]/40 text-[#f0a37a]" : "text-muted-foreground",
        )}
      >
        {roleLabel(role)}
      </span>
    </Tip>
  );
}
