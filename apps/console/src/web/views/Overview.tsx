import type { OpsFailureGroup, OpsSummary, PipelineEventKind, UsageOutcome, UsageRole } from "@senoy/db/usage";
import { AlertOctagon, Coins, FlaskConical, GitFork, Hourglass, Lightbulb, Sparkles, Text, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { BarList } from "@/components/charts/BarList";
import { KpiTile } from "@/components/charts/KpiTile";
import { LatencyHistogram } from "@/components/charts/LatencyHistogram";
import { SpendOverTime } from "@/components/charts/SpendOverTime";
import { CostLegend, CostSplitCell } from "@/components/Cost";
import { KindName, StatusPill, roleLabel } from "@/components/Badges";
import { PageHeader } from "@/components/PageHeader";
import { Async, CAPTURE_HINT } from "@/components/States";
import { TipBody } from "@/components/Tip";
import { Card } from "@/components/ui";
import { BillingSummary } from "@/views/overview/BillingSummary";
import { BreakdownPills } from "@/views/overview/BreakdownPills";
import { HeroSpend, TodayCard, greeting } from "@/views/overview/Hero";
import { ModelTable } from "@/views/overview/ModelTable";
import { ProviderSection } from "@/views/overview/ProviderSection";
import { SpendCalendar } from "@/views/overview/SpendCalendar";
import { TopCourseRequests } from "@/views/overview/TopCourseRequests";
import { useBilling, type BillingState } from "@/lib/billing";
import { KIND_HELP, METRIC_HELP, OUTCOME_HELP, ROLE_HELP } from "@/lib/glossary";
import { MEASURE, kindLabel, outcomeLabel } from "@/lib/labels";
import { assignColors, outcomeTone, SERIES_COLORS, STATUS_COLORS } from "@/lib/palette";
import { formatDuration, formatInt, formatPct, formatTokens, formatUsd, ratio } from "@/lib/format";
import { useGo } from "@/lib/nav";
import { useTimeRange } from "@/lib/range";
import { useOps } from "@/lib/useOps";

/**
 * Overview: where the AI money and time went, what failed, and the most expensive Course Requests. Every section
 * renders even before data exists (each with its own empty state); every bar, row, and legend item opens Calls
 * pre-filtered.
 */
export function Overview() {
  const range = useTimeRange();
  const summary = useOps<OpsSummary>("summary", { from: range.from, to: range.to });
  const failures = useOps<OpsFailureGroup[]>("failures", { from: range.from, to: range.to });
  // Optional: an older console API has no billing routes, and the Overview must not depend on them.
  const billing = useBilling();
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {greeting()}, Operator <Sparkles className="size-5 text-ice drop-shadow-[0_0_8px_rgba(103,232,249,0.7)]" />
          </span>
        }
        description={today}
        actions={<CostLegend />}
      />
      <Async state={summary} rows={10}>
        {(s) => <OverviewBody summary={s} failures={failures.data} billing={billing} />}
      </Async>
    </>
  );
}

/**
 * The Overview once the summary is loaded.
 * @param props.summary - The summary
 * @param props.failures - Failure groups, for money wasted (may still be loading)
 * @param props.billing - The billing check (may be loading, failed, or absent on an older API)
 */
function OverviewBody({
  summary: s,
  failures,
  billing,
}: {
  summary: OpsSummary;
  failures: OpsFailureGroup[] | undefined;
  billing: BillingState;
}) {
  const go = useGo();
  const t = s.totals;

  const modelOrder = useMemo(() => [...s.byModel].sort((a, b) => b.totalUsd - a.totalUsd || b.calls - a.calls).map((m) => m.key), [s.byModel]);
  const colors = useMemo(() => assignColors(modelOrder), [modelOrder]);
  const shownKeys = useMemo(() => modelOrder.slice(0, SERIES_COLORS.length), [modelOrder]);

  const wasted = failures?.filter((f) => f.source === "usage_record").reduce((sum, f) => sum + f.wastedUsd, 0);
  const failRate = ratio(t.failedCalls, t.calls);
  const prevFailRate = ratio(s.previous.failedCalls, s.previous.calls);
  const fallback = s.byRole.find((r) => r.key === "fallback_generator");
  const generator = s.byRole.find((r) => r.key === "generator");
  const toBucket = (from: string, to: string) => go("/calls", { range: "custom", from, to });

  return (
    <div className="space-y-4">
      {t.calls === 0 && <EmptyBanner />}


      <div className="stagger grid gap-4 xl:grid-cols-3">
        <HeroSpend summary={s} onBucket={toBucket} />
        <TodayCard />
      </div>

      <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile
          label="Per Course Request"
          icon={Coins}
          value={t.courseRequests ? t.totalUsd / t.courseRequests : null}
          format={formatUsd}
          tip="Spend in this range divided by the Course Requests that had activity in it."
          sub={<span>{formatInt(t.courseRequests)} Course Requests</span>}
          onClick={() => go("/course-requests")}
        />
        <KpiTile
          label={MEASURE.slowest}
          icon={Hourglass}
          value={t.p95DurationMs}
          format={formatDuration}
          tip={
            <TipBody
              title="How long calls take"
              rows={[
                [MEASURE.usual, formatDuration(t.p50DurationMs)],
                [MEASURE.slowest, formatDuration(t.p95DurationMs)],
              ]}
            >
              {METRIC_HELP.usual} {METRIC_HELP.slowest}
            </TipBody>
          }
          sub={
            <span>
              {MEASURE.usual.toLowerCase()} {formatDuration(t.p50DurationMs)}
            </span>
          }
          onClick={() => go("/calls", { sort: "durationMs" })}
        />
        <KpiTile
          label="Failure rate"
          icon={AlertOctagon}
          value={failRate}
          format={(n) => formatPct(n)}
          tone={t.failedCalls ? "bad" : "good"}
          tip={METRIC_HELP.failureRate}
          delta={
            prevFailRate !== null && failRate !== null
              ? { current: failRate, previous: prevFailRate, upIsGood: false, format: (n) => formatPct(n), points: true }
              : undefined
          }
          sub={<span>{formatInt(t.failedCalls)} failed</span>}
          onClick={() => go("/calls", { outcome: "failed" })}
        />
        <KpiTile
          label="Wasted on failures"
          icon={Trash2}
          value={wasted ?? null}
          format={formatUsd}
          tone={wasted ? "bad" : "good"}
          tip={METRIC_HELP.wasted}
          sub={t.totalUsd && wasted !== undefined ? <span>{formatPct(ratio(wasted, t.totalUsd))} of spend</span> : null}
          onClick={() => go("/failures")}
        />
        <KpiTile
          label="Tokens"
          icon={Text}
          value={t.promptTokens + t.completionTokens}
          format={(n) => formatTokens(Math.round(n))}
          tip={
            <TipBody
              title="Tokens"
              rows={[
                ["In", formatInt(t.promptTokens)],
                ["Out", formatInt(t.completionTokens)],
                ["Reasoning (part of out)", formatInt(t.reasoningTokens)],
              ]}
            >
              {METRIC_HELP.tokensIn} {METRIC_HELP.reasoning}
            </TipBody>
          }
          sub={
            <span>
              in {formatTokens(t.promptTokens)} · out {formatTokens(t.completionTokens)}
            </span>
          }
        />
        <KpiTile
          label="Fallback calls"
          icon={GitFork}
          value={fallback?.calls ?? 0}
          format={(n) => formatInt(Math.round(n))}
          tone={fallback?.calls ? "est" : "good"}
          tip={`${ROLE_HELP.fallback_generator} ${METRIC_HELP.attempt}`}
          sub={generator?.calls ? <span>{formatPct(ratio(fallback?.calls ?? 0, generator.calls))} of Generator calls</span> : null}
          onClick={() => go("/calls", { role: "fallback_generator" })}
        />
      </div>

      <Insights summary={s} wasted={wasted} />

      <ProviderSection summary={s} onVendor={(vendor) => go("/calls", { vendor })} onProvider={(provider) => go("/calls", { provider })} />

      <BillingSummary billing={billing} />

      <div className="stagger grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SpendCalendar />
        </div>
        <BreakdownPills
          summary={s}
          modelColor={colors.color}
          onModel={(modelId) => go("/calls", { modelId })}
          onProvider={(provider) => go("/calls", { provider })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Spend over time by model" subtitle="Stacked per bucket. Hover a legend item to isolate it." className="xl:col-span-2">
          <SpendOverTime summary={s} keys={shownKeys} color={colors.color} onBucket={toBucket} onKey={(modelId) => go("/calls", { modelId })} />
        </Card>
        <Card title="Spend by Pipeline Event" subtitle="Which step costs the most. Click a step to see its calls.">
          <BarList
            onSelect={(kind) => go("/calls", { pipelineKind: kind === "__none" ? undefined : kind })}
            rows={[...s.byPipelineKind]
              .sort((a, b) => b.totalUsd - a.totalUsd)
              .map((row) => ({
                key: row.key || "__none",
                label: <KindName kind={row.key} />,
                value: row.totalUsd,
                valueLabel: <CostSplitCell split={row} compact />,
                extra: `${formatInt(row.calls)} calls`,
                tip: (
                  <TipBody
                    title={kindLabel(row.key)}
                    rows={[
                      ["Spend", formatUsd(row.totalUsd)],
                      ["Calls", formatInt(row.calls)],
                      ["Failed", `${formatInt(row.failedCalls)} (${formatPct(ratio(row.failedCalls, row.calls))})`],
                      [MEASURE.average, formatDuration(row.avgDurationMs)],
                      [MEASURE.slowest, formatDuration(row.p95DurationMs)],
                      ["Tokens in / out", `${formatTokens(row.promptTokens)} / ${formatTokens(row.completionTokens)}`],
                    ]}
                  >
                    {KIND_HELP[row.key as PipelineEventKind]}
                  </TipBody>
                ),
              }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card title="Models" subtitle="Spend, reliability, and speed per model or research adapter." className="xl:col-span-2">
          <ModelTable rows={s.byModel} color={colors.color} onSelect={(modelId) => go("/calls", { modelId })} />
        </Card>
        <Card title="Outcomes" subtitle="How calls ended. Click to filter Calls.">
          <BarList
            onSelect={(outcome) => go("/calls", { outcome })}
            rows={[...s.byOutcome]
              .sort((a, b) => b.calls - a.calls)
              .map((row) => ({
                key: row.outcome,
                label: <StatusPill tone={outcomeTone(row.outcome)}>{outcomeLabel(row.outcome)}</StatusPill>,
                value: row.calls,
                valueLabel: formatInt(row.calls),
                extra: formatPct(ratio(row.calls, t.calls)),
                color: STATUS_COLORS[outcomeTone(row.outcome)],
                tip: <TipBody title={row.outcome}>{OUTCOME_HELP[row.outcome as UsageOutcome]}</TipBody>,
              }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="How long calls take"
          subtitle={`${MEASURE.usual} ${formatDuration(t.p50DurationMs)} · ${MEASURE.slowest.toLowerCase()} ${formatDuration(t.p95DurationMs)}`}
        >
          <LatencyHistogram histogram={s.latencyHistogram} onSelect={() => go("/calls", { sort: "durationMs" })} />
        </Card>
        <Card title="Spend by role" subtitle="Generator vs Judge vs fallbacks vs research.">
          <BarList
            onSelect={(role) => go("/calls", { role })}
            rows={[...s.byRole]
              .sort((a, b) => b.totalUsd - a.totalUsd)
              .map((row) => ({
                key: row.key,
                label: roleLabel(row.key),
                value: row.totalUsd,
                valueLabel: <CostSplitCell split={row} compact />,
                extra: `${formatInt(row.calls)} calls`,
                tip: (
                  <TipBody
                    title={roleLabel(row.key)}
                    rows={[
                      ["Calls", formatInt(row.calls)],
                      ["Failed", formatPct(ratio(row.failedCalls, row.calls))],
                      [MEASURE.slowest, formatDuration(row.p95DurationMs)],
                    ]}
                  >
                    {ROLE_HELP[row.key as UsageRole]}
                  </TipBody>
                ),
              }))}
          />
        </Card>
        <Card title="Most expensive Course Requests">
          <TopCourseRequests rows={s.topCourseRequests} />
        </Card>
      </div>
    </div>
  );
}

/** The info banner shown while nothing has been recorded in the range. */
function EmptyBanner() {
  return (
    <div className="glass glow-border animate-view-in flex items-start gap-3 rounded-2xl border px-4 py-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-ice/10 text-ice">
        <FlaskConical className="size-4" />
      </span>
      <div className="text-sm">
        <div className="font-medium">No Usage Records in this range yet</div>
        <div className="text-xs text-muted-foreground">{CAPTURE_HINT} Every section below fills in by itself once calls are recorded.</div>
      </div>
    </div>
  );
}

/**
 * A strip of computed observations a solo developer would otherwise eyeball: the dominant model, the least
 * reliable model, the slowest step, and cost coverage. Each one is a link.
 * @param props.summary - The summary
 * @param props.wasted - Money wasted on failed calls
 */
function Insights({ summary: s, wasted }: { summary: OpsSummary; wasted: number | undefined }) {
  const go = useGo();
  const t = s.totals;
  const items: { text: string; onClick?: () => void }[] = [];

  const top = [...s.byModel].sort((a, b) => b.totalUsd - a.totalUsd)[0];
  if (top && t.totalUsd > 0) {
    items.push({
      text: `${top.key} is ${formatPct(top.totalUsd / t.totalUsd, 0)} of spend (${formatUsd(top.totalUsd)}).`,
      onClick: () => go("/calls", { modelId: top.key, sort: "costUsd" }),
    });
  }
  const flaky = s.byModel.filter((m) => m.calls >= 5 && m.failedCalls > 0).sort((a, b) => b.failedCalls / b.calls - a.failedCalls / a.calls)[0];
  if (flaky) {
    items.push({
      text: `${flaky.key} fails ${formatPct(flaky.failedCalls / flaky.calls, 0)} of its calls (${flaky.failedCalls}/${flaky.calls}).`,
      onClick: () => go("/calls", { modelId: flaky.key, outcome: "failed" }),
    });
  }
  const slow = [...s.byPipelineKind].filter((k) => k.p95DurationMs !== null).sort((a, b) => (b.p95DurationMs ?? 0) - (a.p95DurationMs ?? 0))[0];
  if (slow) {
    items.push({
      text: `Slowest step: 1 in 20 ${kindLabel(slow.key)} calls takes over ${formatDuration(slow.p95DurationMs)}.`,
      onClick: () => go("/calls", { pipelineKind: slow.key || undefined, sort: "durationMs" }),
    });
  }
  if (wasted && t.totalUsd > 0) {
    items.push({ text: `${formatUsd(wasted)} (${formatPct(wasted / t.totalUsd, 0)}) went on calls that failed.`, onClick: () => go("/failures") });
  }
  if (t.unknownCount > 0) {
    items.push({
      text: `${t.unknownCount} charged call(s) never reported a price, so real spend is a bit higher.`,
      onClick: () => go("/calls", { outcome: "timeout" }),
    });
  }
  if (items.length === 0) return null;

  return (
    <div className="glass glow-border flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2 text-xs">
      <Lightbulb className="size-3.5 text-ice" />
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={item.onClick}
          className="animate-fade-in rounded-full border bg-secondary px-2.5 py-0.5 text-muted-foreground transition-colors hover:border-ice/40 hover:text-foreground"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          {item.text}
        </button>
      ))}
    </div>
  );
}
