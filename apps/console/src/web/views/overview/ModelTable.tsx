import type { OpsBreakdownRow } from "@senoy/db/usage";
import { CostSplitCell } from "@/components/Cost";
import { Table, Td, Th, Tr } from "@/components/Table";
import { METRIC_HELP } from "@/lib/glossary";
import { formatDuration, formatInt, formatPct, formatTokens, formatUsd, ratio } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Tip } from "@/components/Tip";
import { CardEmpty } from "@/components/States";
import type { ReactNode } from "react";

/**
 * Spend, reliability, and speed per breakdown key (model, provider…), with an inline spend bar. Rows open Calls
 * filtered by that key.
 * @param props.rows - A breakdown from the summary (`byModel`, `byProvider`)
 * @param props.color - Swatch/bar color per key (e.g. matching the spend-over-time chart)
 * @param props.onSelect - Row click
 * @param props.keyHeader - First column header
 * @param props.keyTip - Explanation of the first column
 * @param props.keyTipFor - Per-row tooltip for the key cell
 */
export function ModelTable({
  rows,
  color,
  onSelect,
  keyHeader = "Model / adapter",
  keyTip,
  keyTipFor,
}: {
  rows: OpsBreakdownRow[];
  color: (key: string) => string;
  onSelect: (key: string) => void;
  keyHeader?: string;
  keyTip?: ReactNode;
  keyTipFor?: (key: string) => ReactNode;
}) {
  const sorted = [...rows].sort((a, b) => b.totalUsd - a.totalUsd || b.calls - a.calls);
  const max = Math.max(0, ...sorted.map((r) => r.totalUsd));
  if (sorted.length === 0) return <CardEmpty />;
  return (
    <Table>
      <thead>
        <tr>
          <Th tip={keyTip}>{keyHeader}</Th>
          <Th numeric>Spend</Th>
          <Th numeric>Calls</Th>
          <Th numeric tip={METRIC_HELP.failureRate}>
            Failed
          </Th>
          <Th numeric tip="Average cost per call (known costs only).">$/call</Th>
          <Th numeric tip={METRIC_HELP.average}>Average time</Th>
          <Th numeric tip={METRIC_HELP.slowest}>Slowest times</Th>
          <Th numeric tip={`${METRIC_HELP.tokensIn} / ${METRIC_HELP.tokensOut}`}>Tokens in / out</Th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => {
          const fail = ratio(r.failedCalls, r.calls);
          return (
            <Tr key={r.key} onClick={() => onSelect(r.key)}>
              <Td className="max-w-[18rem]">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: color(r.key) }} />
                  <Tip content={keyTipFor?.(r.key) ?? null}>
                    <span className="truncate font-mono text-[11px]" title={r.key}>
                      {r.key || "(none)"}
                    </span>
                  </Tip>
                </span>
              </Td>
              <Td numeric className="w-40">
                <span className="flex items-center justify-end gap-2">
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted/60 sm:block">
                    <span
                      className="animate-grow-x block h-full rounded-full"
                      style={{ width: `${max ? (r.totalUsd / max) * 100 : 0}%`, backgroundColor: color(r.key) }}
                    />
                  </span>
                  <CostSplitCell split={r} compact calls={r.calls} />
                </span>
              </Td>
              <Td numeric>{formatInt(r.calls)}</Td>
              <Td numeric className={cn(fail && fail > 0.1 ? "text-bad" : fail ? "" : "text-muted-foreground")}>
                {formatPct(fail)}
              </Td>
              <Td numeric className="text-muted-foreground">
                {r.calls ? formatUsd(r.totalUsd / r.calls) : "—"}
              </Td>
              <Td numeric>{formatDuration(r.avgDurationMs)}</Td>
              <Td numeric>{formatDuration(r.p95DurationMs)}</Td>
              <Td numeric className="text-muted-foreground">
                {formatTokens(r.promptTokens)} / {formatTokens(r.completionTokens)}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
