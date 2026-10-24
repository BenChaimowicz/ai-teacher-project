import type { OpsSummary } from "@senoy/db/usage";
import { Info, Sun } from "lucide-react";
import { useMemo } from "react";
import { DeltaChip } from "@/components/charts/KpiTile";
import { RingGauge } from "@/components/charts/RingGauge";
import { SpendArea } from "@/components/charts/SpendArea";
import { CostSplitTip } from "@/components/Cost";
import { Spinner } from "@/components/States";
import { Tip, TipBody } from "@/components/Tip";
import { METRIC_HELP } from "@/lib/glossary";
import { MEASURE } from "@/lib/labels";
import { useCountUp } from "@/lib/motion";
import { useRefresh } from "@/lib/refresh";
import { useOps } from "@/lib/useOps";
import { formatDuration, formatInt, formatPct, formatTokens, formatUsd, ratio } from "@/lib/format";

/**
 * The big hero card: spend in the range as a large gradient number with its delta and sublines, a success-rate
 * ring in the corner, and the glowing spend-over-time area chart.
 * @param props.summary - The Overview summary
 * @param props.onBucket - Chart click with a bucket's [from, to)
 */
export function HeroSpend({ summary: s, onBucket }: { summary: OpsSummary; onBucket: (fromIso: string, toIso: string) => void }) {
  const t = s.totals;
  const spend = useCountUp(t.totalUsd, 700);
  const ok = t.calls - t.failedCalls;
  return (
    <section className="glass glow-border inner-glow lift rounded-2xl border p-5 xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            Spend · this range
            <Tip content={<CostSplitTip split={t} calls={t.calls} />}>
              <Info className="size-3" />
            </Tip>
          </div>
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="text-gradient font-mono text-5xl font-bold tracking-tight tabular-nums">{formatUsd(spend)}</span>
            <DeltaChip delta={{ current: t.totalUsd, previous: s.previous.totalUsd, upIsGood: false, format: formatUsd }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <span className="text-foreground">{formatInt(t.calls)}</span> calls
            </span>
            <span>
              <span className="text-foreground">{formatTokens(t.promptTokens + t.completionTokens)}</span> tokens
            </span>
            <span>
              <span className="text-foreground">{formatInt(t.courseRequests)}</span> Course Requests
            </span>
            {t.estimatedUsd > 0 && <span className="italic text-est">~{formatUsd(t.estimatedUsd)} estimated</span>}
            {t.unknownCount > 0 && (
              <Tip content={<TipBody title="Unknown cost">{METRIC_HELP.unknown}</TipBody>}>
                <span className="text-est">{t.unknownCount} with unknown cost</span>
              </Tip>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RingGauge value={ratio(ok, t.calls)} trackColor={t.failedCalls ? "rgba(240,138,128,0.28)" : undefined} />
          <div className="text-xs leading-relaxed">
            <div className="flex items-center gap-1 text-muted-foreground">
              Success rate
              <Tip content={<TipBody title="Success rate">Calls that came back with a usable answer, out of all calls. The coral part of the ring is the calls that failed.</TipBody>}>
                <Info className="size-3" />
              </Tip>
            </div>
            <div className="text-ok">{formatInt(ok)} ok</div>
            <div className="text-bad">{formatInt(t.failedCalls)} failed</div>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <SpendArea summary={s} onBucket={onBucket} />
      </div>
    </section>
  );
}

/** The "Today" card: spend and calls since local midnight, with an exact-vs-estimated ring. */
export function TodayCard() {
  const { tick } = useRefresh();
  const params = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: new Date().toISOString() };
    // Re-anchor "now" on every refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const today = useOps<OpsSummary>("summary", params);
  const t = today.data?.totals;
  const spend = useCountUp(t?.totalUsd ?? 0);
  const exactShare = t && t.totalUsd > 0 ? t.actualUsd / t.totalUsd : null;

  return (
    <section className="glass glow-border inner-glow lift flex flex-col rounded-2xl border p-5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Sun className="size-3.5 opacity-60" /> Today
        </span>
        {today.loading && <Spinner />}
      </div>
      <div className="mt-1 font-mono text-3xl font-semibold tabular-nums">{t ? formatUsd(spend) : "—"}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {t ? (
          <>
            {formatInt(t.calls)} calls · <span className={t.failedCalls ? "text-bad" : ""}>{formatInt(t.failedCalls)} failed</span>
          </>
        ) : today.error ? (
          "Couldn't load today."
        ) : (
          "Loading…"
        )}
      </div>
      <div className="mt-5 flex items-center gap-4">
        <RingGauge value={exactShare} size={76} center={exactShare === null ? "—" : formatPct(exactShare, 0)} />
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1 text-muted-foreground">
            Exact cost share
            <Tip content={<TipBody title="Exact vs estimated">{`${METRIC_HELP.exact} ${METRIC_HELP.estimated}`}</TipBody>}>
              <Info className="size-3" />
            </Tip>
          </div>
          <div>{t ? formatUsd(t.actualUsd) : "—"} exact</div>
          <div className="italic text-est">~{t ? formatUsd(t.estimatedUsd) : "—"} estimated</div>
        </div>
      </div>
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t pt-4 text-xs">
        <div>
          <dt className="text-muted-foreground">
            <Tip content={<TipBody title={MEASURE.usual}>{METRIC_HELP.usual}</TipBody>} underline>
              {MEASURE.usual}
            </Tip>
          </dt>
          <dd className="font-mono tabular-nums text-ice">{formatDuration(t?.p50DurationMs)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            <Tip content={<TipBody title={MEASURE.slowest}>{METRIC_HELP.slowest}</TipBody>} underline>
              {MEASURE.slowest}
            </Tip>
          </dt>
          <dd className="font-mono tabular-nums text-ice">{formatDuration(t?.p95DurationMs)}</dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * A greeting for the time of day.
 * @returns e.g. `Good afternoon`
 */
export function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}
