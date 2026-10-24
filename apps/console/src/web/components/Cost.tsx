import type { CostBasis, CostSplit, OpsUsageRecordRow } from "@senoy/db/usage";
import { AlertTriangle, Check } from "lucide-react";
import { Tip, TipBody } from "@/components/Tip";
import { MEASURED_TOLERANCE_USD } from "@/lib/billing";
import { formatCost, formatInt, formatUsd } from "@/lib/format";
import { BILLING_HELP, METRIC_HELP } from "@/lib/glossary";
import { BASIS_LABEL } from "@/lib/labels";
import { cn } from "@/lib/cn";

/** Basis explanations shown in cost tooltips. */
const BASIS_HELP: Record<CostBasis, string> = {
  actual: METRIC_HELP.exact,
  estimated: METRIC_HELP.estimated,
  unknown: METRIC_HELP.unknown,
};

/**
 * One Usage Record's cost, marked by basis: `$0.10` actual, `~$0.10` estimated (soft amber, italic), `?` unknown.
 * @param props.usd - Cost or null
 * @param props.basis - Where the cost came from
 */
export function CostCell({ usd, basis, className }: { usd: number | null; basis: CostBasis; className?: string }) {
  return (
    <Tip content={<TipBody title={`Cost · ${BASIS_LABEL[basis]}`}>{BASIS_HELP[basis]}</TipBody>}>
      <span
        className={cn(
          "tabular-nums",
          basis === "estimated" && "italic text-est/90",
          basis === "unknown" && "cursor-help rounded bg-est/15 px-1 text-est",
          className,
        )}
      >
        {formatCost(usd, basis)}
      </span>
    </Tip>
  );
}

/** The cost fields of a Usage Record that the measured-cost display reads. */
type MeasuredFields = Pick<OpsUsageRecordRow, "role" | "costUsd" | "costBasis" | "measuredCostUsd" | "measurementNote">;

/**
 * Whether a Usage Record carries a measured cost (or a note on why it has none): research calls only.
 * @param r - The record
 * @returns True when there is something to show
 */
export function hasMeasurement(r: MeasuredFields): boolean {
  return r.role.startsWith("research") && (r.measuredCostUsd !== null || r.measurementNote !== null);
}

/**
 * A Usage Record's cost with the measured balance drop next to it for research calls:
 * `~$0.05 · $0.05 measured ✓` when they agree, `~$0.05 · measured $0.07 ⚠` when they differ, and a muted
 * `not measured` with the reason in a tooltip when the drop couldn't be pinned to this call.
 * @param props.record - The record
 * @param props.className - Classes for the wrapper
 */
export function MeasuredCostCell({ record: r, className }: { record: MeasuredFields; className?: string }) {
  if (!hasMeasurement(r)) return <CostCell usd={r.costUsd} basis={r.costBasis} className={className} />;

  const measured = r.measuredCostUsd;
  const diff = measured !== null && r.costUsd !== null ? measured - r.costUsd : null;
  const matches = diff !== null && Math.abs(diff) < MEASURED_TOLERANCE_USD;
  const tip =
    measured === null ? (
      <TipBody title="Not measured">{r.measurementNote ?? BILLING_HELP.measuredMissing}</TipBody>
    ) : (
      <TipBody
        title={matches ? "Measured cost matches" : diff === null ? "Measured cost" : "Measured cost differs"}
        rows={[
          [`${BASIS_LABEL[r.costBasis]} (price list)`, formatCost(r.costUsd, r.costBasis)],
          ["Measured (balance drop)", formatUsd(measured)],
          ...(diff !== null ? ([["Difference", `${diff > 0 ? "+" : ""}${formatUsd(diff)}`]] as [string, string][]) : []),
        ]}
      >
        {BILLING_HELP.measured} {diff === null ? "" : matches ? BILLING_HELP.measuredMatch : BILLING_HELP.measuredDiffers}
        {r.measurementNote ? ` ${r.measurementNote}` : ""}
      </TipBody>
    );

  return (
    <span className={cn("inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap", className)}>
      <CostCell usd={r.costUsd} basis={r.costBasis} />
      <Tip content={tip}>
        {measured === null ? (
          <span className="cursor-help text-[11px] text-muted-foreground/80 underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
            not measured
          </span>
        ) : matches || diff === null ? (
          <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-ok/90">
            · {formatUsd(measured)} measured {diff !== null && <Check className="size-3" />}
          </span>
        ) : (
          <span className="inline-flex items-center gap-0.5 text-[11px] tabular-nums text-est">
            · measured {formatUsd(measured)} <AlertTriangle className="size-3" />
          </span>
        )}
      </Tip>
    </span>
  );
}

/**
 * The rich tooltip for an aggregate cost.
 * @param props.split - The split
 * @param props.calls - Optional call count for an average
 */
export function CostSplitTip({ split, calls }: { split: CostSplit; calls?: number }) {
  const rows: [string, string][] = [
    ["Exact (the service told us)", formatUsd(split.actualUsd)],
    ["Estimated (price list)", `~${formatUsd(split.estimatedUsd)}`],
    ["Total", formatUsd(split.totalUsd)],
  ];
  if (calls) rows.push(["Average per call", formatUsd(split.totalUsd / calls)]);
  if (split.unknownCount > 0) rows.push(["Calls with unknown cost", formatInt(split.unknownCount)]);
  return (
    <TipBody title="Spend breakdown" rows={rows}>
      {split.unknownCount > 0 ? "The real total is a bit higher: some calls we were charged for never told us the price (e.g. ones we stopped for taking too long)." : null}
    </TipBody>
  );
}

/**
 * An aggregate cost: total, with the estimated share and the count of unknown-cost calls called out.
 * @param props.split - Actual / estimated / total / unknownCount
 * @param props.compact - One line, no estimated breakdown text
 * @param props.calls - Calls behind the total, for the average in the tooltip
 */
export function CostSplitCell({
  split,
  compact,
  calls,
  className,
}: {
  split: CostSplit;
  compact?: boolean;
  calls?: number;
  className?: string;
}) {
  const allEstimated = split.actualUsd === 0 && split.estimatedUsd > 0;
  return (
    <Tip content={<CostSplitTip split={split} calls={calls} />}>
      <span className={cn("inline-flex items-baseline gap-1 tabular-nums", className)}>
        <span className={cn(allEstimated && "italic text-est/90")}>
          {allEstimated ? "~" : ""}
          {formatUsd(split.totalUsd)}
        </span>
        {!compact && split.estimatedUsd > 0 && !allEstimated && (
          <span className="text-[11px] italic text-est/80">~{formatUsd(split.estimatedUsd)} est</span>
        )}
        {split.unknownCount > 0 && <span className="rounded bg-est/15 px-1 text-[11px] text-est">+{split.unknownCount}?</span>}
      </span>
    </Tip>
  );
}

/** Legend explaining the cost notation, shown once per screen. */
export function CostLegend() {
  return (
    <span className="inline-flex items-center gap-3 text-[11px] text-muted-foreground">
      <Tip content={<TipBody title="Exact">{BASIS_HELP.actual}</TipBody>}>
        <span>$0.10 exact</span>
      </Tip>
      <Tip content={<TipBody title="Estimated">{BASIS_HELP.estimated}</TipBody>}>
        <span className="italic text-est/90">~$0.10 estimated</span>
      </Tip>
      <Tip content={<TipBody title="Unknown">{BASIS_HELP.unknown}</TipBody>}>
        <span>
          <span className="rounded bg-est/15 px-1 text-est">?</span> unknown
        </span>
      </Tip>
    </span>
  );
}
