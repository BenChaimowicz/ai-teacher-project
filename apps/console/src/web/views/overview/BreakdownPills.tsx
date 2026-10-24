import type { OpsBreakdownRow, OpsSummary } from "@senoy/db/usage";
import { useState } from "react";
import { PillBars } from "@/components/charts/PillBars";
import { Tip, TipBody } from "@/components/Tip";
import { Card } from "@/components/ui";
import { METRIC_HELP } from "@/lib/glossary";
import { MEASURE } from "@/lib/labels";
import { ACCENT } from "@/lib/palette";
import { formatDuration, formatInt, formatPct, formatTokens, formatUsd, ratio } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * The rich tooltip for one breakdown row.
 * @param row - The row
 * @returns Tooltip body
 */
function rowTip(row: OpsBreakdownRow) {
  return (
    <TipBody
      title={row.key || "(none)"}
      rows={[
        ["Spend", formatUsd(row.totalUsd)],
        ["Exact / estimated", `${formatUsd(row.actualUsd)} / ~${formatUsd(row.estimatedUsd)}`],
        ["Calls", formatInt(row.calls)],
        ["Worked", formatPct(ratio(row.calls - row.failedCalls, row.calls))],
        [MEASURE.average, formatDuration(row.avgDurationMs)],
        [MEASURE.slowest, formatDuration(row.p95DurationMs)],
        ["Tokens in / out", `${formatTokens(row.promptTokens)} / ${formatTokens(row.completionTokens)}`],
      ]}
    >
      Click to see these calls.
    </TipBody>
  );
}

/**
 * "By model / By provider": pill + proportional bar (calls · success%) + $ rows, switchable between models and
 * serving providers.
 * @param props.summary - The Overview summary
 * @param props.modelColor - Series color per model (matches the spend-over-time chart)
 * @param props.onModel - Model click
 * @param props.onProvider - Provider click
 */
export function BreakdownPills({
  summary,
  modelColor,
  onModel,
  onProvider,
}: {
  summary: OpsSummary;
  modelColor: (key: string) => string;
  onModel: (key: string) => void;
  onProvider: (key: string) => void;
}) {
  const [tab, setTab] = useState<"model" | "provider">("model");
  return (
    <Card
      title={
        <span className="inline-flex rounded-full border bg-secondary p-0.5 text-[11px] font-normal">
          {(["model", "provider"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "rounded-full px-2.5 py-0.5 transition-colors",
                tab === k ? "pill-gradient text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {k === "model" ? "By model" : "By provider"}
            </button>
          ))}
        </span>
      }
      actions={
        <Tip content={<TipBody title="Vendor vs provider">{METRIC_HELP.vendorVsProvider}</TipBody>} underline>
          <span className="text-[11px] text-muted-foreground">calls · success · spend</span>
        </Tip>
      }
    >
      {tab === "model" ? (
        <PillBars rows={summary.byModel} color={modelColor} onSelect={onModel} tipFor={rowTip} />
      ) : (
        <PillBars rows={summary.byProvider ?? []} color={() => ACCENT} onSelect={onProvider} tipFor={rowTip} />
      )}
    </Card>
  );
}
