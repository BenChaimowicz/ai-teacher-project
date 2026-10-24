import { ArrowDownRight, ArrowUpRight, Info, Minus, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Tip, TipBody } from "@/components/Tip";
import { useCountUp } from "@/lib/motion";
import { formatPct } from "@/lib/format";
import { cn } from "@/lib/cn";

/** A comparison against the previous range of the same length. */
export type KpiDelta = {
  current: number;
  previous: number;
  /** Whether a rise is good news (calls) or bad news (spend, failures). */
  upIsGood: boolean;
  /** Formats the raw values for the tooltip. */
  format: (n: number) => string;
  /** Compare as an absolute difference in percentage points (for rates) instead of a relative change. */
  points?: boolean;
};

/** What a KPI's number means: good (green flash), bad (coral), neutral (ice blue), estimated (amber). */
export type KpiTone = "good" | "bad" | "neutral" | "est";

/** Number color per tone. */
const TONE_CLASS: Record<KpiTone, string> = {
  good: "text-ok",
  bad: "text-bad",
  neutral: "text-ice",
  est: "text-est",
};

/**
 * A stat tile: label with an ⓘ tooltip, a faint icon top-right, a large monospace counted-up number colored by
 * meaning, an optional delta vs the previous range, and a subline.
 * @param props.label - Sentence-case label
 * @param props.tip - What the number means
 * @param props.icon - Faint icon in the corner
 * @param props.value - Raw number to count up to
 * @param props.format - Formats the (animated) number
 * @param props.tone - Color of the number
 * @param props.delta - Comparison with the previous range
 * @param props.sub - Small line under the value
 * @param props.onClick - Make the tile a link
 */
export function KpiTile({
  label,
  tip,
  icon: Icon,
  value,
  format,
  tone = "neutral",
  delta,
  sub,
  onClick,
}: {
  label: string;
  tip?: ReactNode;
  icon?: LucideIcon;
  value: number | null;
  format: (n: number) => string;
  tone?: KpiTone;
  delta?: KpiDelta;
  sub?: ReactNode;
  onClick?: () => void;
}) {
  const animated = useCountUp(value ?? 0);
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "glass glow-border inner-glow lift glow-focus flex min-w-0 flex-col rounded-2xl border px-4 py-3.5 text-left",
        onClick && "cursor-pointer",
      )}
    >
      <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1">
          <span className="truncate">{label}</span>
          {tip && (
            <Tip content={typeof tip === "string" ? <TipBody title={label}>{tip}</TipBody> : tip}>
              <Info className="size-3 shrink-0 opacity-70 hover:opacity-100" />
            </Tip>
          )}
        </span>
        {Icon && <Icon className="size-3.5 shrink-0 opacity-40" />}
      </span>
      <span className={cn("mt-2 truncate font-mono text-[1.6rem] font-semibold leading-none tracking-tight tabular-nums", TONE_CLASS[tone])}>
        {value === null ? "—" : format(animated)}
      </span>
      <span className="mt-2 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
        {delta && <DeltaChip delta={delta} />}
        {sub}
      </span>
    </Wrapper>
  );
}

/**
 * The change vs the previous range, colored by whether it's good news, with the raw numbers in a tooltip.
 * @param props.delta - The comparison
 */
export function DeltaChip({ delta }: { delta: KpiDelta }) {
  const { current, previous, upIsGood, format, points } = delta;
  const diff = current - previous;
  let text: string;
  if (points) text = `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}pp`;
  else if (previous === 0) text = current === 0 ? "0%" : "new";
  else text = `${diff >= 0 ? "+" : ""}${formatPct(diff / previous, 0)}`;
  const flat = Math.abs(diff) < 1e-9;
  const good = flat ? null : diff > 0 === upIsGood;
  const Icon = flat ? Minus : diff > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <Tip
      content={
        <TipBody
          title="Compared with the previous range"
          rows={[
            ["This range", format(current)],
            ["Previous range", format(previous)],
            ["Change", `${diff >= 0 ? "+" : ""}${format(diff)}`],
          ]}
        >
          The previous range is the same length, right before this one (e.g. the 7 days before these 7 days).
          {points ? " For a rate, the change is in percentage points (pp)." : ""}
        </TipBody>
      }
    >
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-px font-medium tabular-nums",
          good === true && "bg-ok/10 text-ok",
          good === false && "bg-bad/10 text-bad",
          good === null && "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-3" />
        {text}
      </span>
    </Tip>
  );
}
