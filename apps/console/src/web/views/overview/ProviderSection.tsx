import type { OpsBreakdownRow, OpsSetup, OpsSetupModel, OpsSummary, UsageVendor } from "@senoy/db/usage";
import { AlertTriangle, ArrowDownUp, Globe2, Info, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { CostSplitCell } from "@/components/Cost";
import { Async, Spinner } from "@/components/States";
import { Tip, TipBody } from "@/components/Tip";
import { Card } from "@/components/ui";
import { HostTable, sortHosts, type HostRow, type HostSort } from "@/views/overview/HostTable";
import { METRIC_HELP } from "@/lib/glossary";
import { MEASURE, SETUP_ROLE_LABEL, vendorLabel } from "@/lib/labels";
import { SERIES_COLORS } from "@/lib/palette";
import { formatDuration, formatInt, formatPct, formatUsd, ratio } from "@/lib/format";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** Fixed vendor colors (color follows the vendor, never its rank). */
export const VENDOR_COLOR: Record<string, string> = { openrouter: SERIES_COLORS[0], parallel: SERIES_COLORS[1], you: SERIES_COLORS[2] };

/** What each vendor is for. */
const VENDOR_HELP: Record<string, string> = {
  openrouter: "Every model call goes through OpenRouter. It routes each call to a provider (host) and reports the exact cost.",
  parallel: "Research vendor. It never reports what it charged, so its spend is estimated from the price list.",
  you: "Research vendor. It never reports what it charged, so its spend is estimated from the price list.",
};

/** Tooltip copy explaining vendor vs provider (also used by the Calls provider filter). */
export const VENDOR_VS_PROVIDER = (
  <TipBody title="Vendor vs provider">
    {METRIC_HELP.vendorVsProvider} Research calls appear under their vendor. A model call that got no answer has no provider and counts
    under &quot;openrouter&quot;.
  </TipBody>
);

/**
 * An empty breakdown row, for vendors with no calls yet.
 * @param key - Vendor key
 * @returns A zeroed row
 */
const zero = (key: string): OpsBreakdownRow => ({
  key,
  actualUsd: 0,
  estimatedUsd: 0,
  totalUsd: 0,
  unknownCount: 0,
  calls: 0,
  failedCalls: 0,
  avgDurationMs: null,
  p95DurationMs: null,
  promptTokens: 0,
  completionTokens: 0,
});

/** Configured roles that share one model id, grouped. */
type ModelGroup = { modelId: string; roles: OpsSetupModel["role"][]; models: OpsSetupModel[] };

/**
 * Groups configured roles by model id (e.g. the Generator and Judge fallbacks often share one model).
 * @param models - `setup.models`
 * @returns One group per model id, in config order
 */
function groupModels(models: OpsSetupModel[]): ModelGroup[] {
  const map = new Map<string, ModelGroup>();
  for (const m of models) {
    const g = map.get(m.modelId) ?? { modelId: m.modelId, roles: [], models: [] };
    g.roles.push(m.role);
    g.models.push(m);
    map.set(m.modelId, g);
  }
  return [...map.values()];
}

/**
 * "Vendors & providers": every vendor we pay, every provider that can serve each configured model (OpenRouter's
 * live list, merged with our own spend), research vendors with their estimated price, and providers seen in our
 * data that config doesn't list. Renders fully before any calls exist.
 * @param props.summary - The Overview summary (byVendor / byProvider)
 * @param props.onVendor - Vendor click (Calls `?vendor=`)
 * @param props.onProvider - Provider click (Calls `?provider=`)
 */
export function ProviderSection({
  summary,
  onVendor,
  onProvider,
}: {
  summary: OpsSummary;
  onVendor: (key: string) => void;
  onProvider: (key: string) => void;
}) {
  const setup = useOps<OpsSetup>("setup");
  const [sort, setSort] = useState<HostSort>("price");
  const [hideUnrouted, setHideUnrouted] = useState(false);

  return (
    <Card
      className="overflow-hidden"
      title={
        <span className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-lg bg-gradient-to-br from-cyan-300/25 to-blue-600/20 text-ice ring-1 ring-ice/30">
            <Globe2 className="size-3.5" />
          </span>
          <Tip content={VENDOR_VS_PROVIDER} underline>
            Vendors &amp; providers
          </Tip>
        </span>
      }
      subtitle="Who we pay, who answers, and what each provider charges for the models we use."
      actions={setup.loading && <Spinner />}
    >
      <div className="flex items-start gap-2 border-b bg-ice/[0.04] px-4 py-2.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0 text-ice" />
        <p>
          Providers and prices are OpenRouter&apos;s live list for the models we&apos;re configured to use. Our spend appears once calls are
          recorded. OpenRouter picks which provider answers, unless we set a preferred one.
          {setup.data && <span className="ml-1 opacity-70">List fetched {new Date(setup.data.fetchedAt).toLocaleTimeString()}.</span>}
        </p>
      </div>

      <VendorStrip summary={summary} setup={setup.data} onVendor={onVendor} />

      <Async state={setup} rows={6}>
        {(data) => (
          <ProviderGroups
            setup={data}
            summary={summary}
            sort={sort}
            setSort={setSort}
            hideUnrouted={hideUnrouted}
            setHideUnrouted={setHideUnrouted}
            onProvider={onProvider}
          />
        )}
      </Async>
    </Card>
  );
}

/**
 * The vendors as tiles: spend (exact vs estimated), calls, success, and for research vendors their estimated price
 * per call.
 * @param props.summary - The summary
 * @param props.setup - Configured vendors and research adapters (may still be loading)
 * @param props.onVendor - Vendor click
 */
function VendorStrip({ summary, setup, onVendor }: { summary: OpsSummary; setup: OpsSetup | undefined; onVendor: (key: string) => void }) {
  const vendorKeys: string[] = setup?.vendors ?? ["openrouter", "parallel", "you"];
  const rows = vendorKeys.map((k) => summary.byVendor?.find((v) => v.key === k) ?? zero(k));
  for (const v of summary.byVendor ?? []) if (!vendorKeys.includes(v.key)) rows.push(v);
  const total = rows.reduce((s, v) => s + v.totalUsd, 0);

  return (
    <div className="stagger grid gap-3 border-b p-4 md:grid-cols-3">
      {rows.map((v) => {
        const color = VENDOR_COLOR[v.key] ?? SERIES_COLORS[3];
        const research = setup?.research.filter((r) => r.vendor === (v.key as UsageVendor)) ?? [];
        const share = ratio(v.totalUsd, total);
        const exactPct = v.totalUsd > 0 ? (v.actualUsd / v.totalUsd) * 100 : 0;
        return (
          <Tip
            key={v.key}
            className="block"
            content={
              <TipBody
                title={vendorLabel(v.key)}
                rows={[
                  ["Exact", formatUsd(v.actualUsd)],
                  ["Estimated", `~${formatUsd(v.estimatedUsd)}`],
                  ["Calls", formatInt(v.calls)],
                  ["Failed", formatInt(v.failedCalls)],
                  [MEASURE.average, formatDuration(v.avgDurationMs)],
                ]}
              >
                {VENDOR_HELP[v.key]} Click to see its calls.
              </TipBody>
            }
          >
            <button type="button" onClick={() => onVendor(v.key)} className="lift glow-border w-full rounded-xl border bg-secondary/40 p-3 text-left">
              <span className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 font-medium">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
                  {vendorLabel(v.key)}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{v.key === "openrouter" ? "models" : "research"}</span>
              </span>
              <span className="mt-2 flex items-baseline justify-between gap-2">
                <span className="font-mono text-xl font-semibold">
                  <CostSplitCell split={v} compact calls={v.calls} />
                </span>
                <span className="text-[11px] text-muted-foreground">{share === null ? "" : `${formatPct(share, 0)} of spend`}</span>
              </span>
              <span className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-muted/60" aria-hidden>
                <span className="animate-grow-x h-full" style={{ width: `${exactPct}%`, backgroundColor: color }} />
                <span
                  className="animate-grow-x h-full"
                  style={{
                    width: `${v.totalUsd > 0 ? 100 - exactPct : 0}%`,
                    backgroundImage: `repeating-linear-gradient(45deg, ${color} 0 3px, ${color}55 3px 6px)`,
                  }}
                />
              </span>
              <span className="mt-2 block text-[11px] text-muted-foreground">
                {v.calls ? `${formatInt(v.calls)} calls · ${formatPct(ratio(v.calls - v.failedCalls, v.calls), 0)} worked` : "No calls yet"}
                {research.map((r) => (
                  <span key={r.slot} className="mt-0.5 block">
                    <span className="font-mono text-foreground/80">{r.adapterId}</span> ({r.slot}) ·{" "}
                    <span className="italic text-est">~{formatUsd(r.estimatedCostUsd)}/call est.</span>
                  </span>
                ))}
              </span>
            </button>
          </Tip>
        );
      })}
    </div>
  );
}

/**
 * Per configured model: its roles, preferred providers, and every provider from OpenRouter's list merged with our
 * data; then providers seen in our data that no configured model lists.
 * @param props.setup - The setup
 * @param props.summary - The summary
 * @param props.sort - Host order
 * @param props.setSort - Change host order
 * @param props.hideUnrouted - Hide hosts that won't take our calls
 * @param props.setHideUnrouted - Toggle that
 * @param props.onProvider - Provider click
 */
function ProviderGroups({
  setup,
  summary,
  sort,
  setSort,
  hideUnrouted,
  setHideUnrouted,
  onProvider,
}: {
  setup: OpsSetup;
  summary: OpsSummary;
  sort: HostSort;
  setSort: (s: HostSort) => void;
  hideUnrouted: boolean;
  setHideUnrouted: (v: boolean) => void;
  onProvider: (key: string) => void;
}) {
  const ours = useMemo(() => {
    const map = new Map<string, OpsBreakdownRow>();
    for (const p of summary.byProvider ?? []) map.set(p.key.toLowerCase(), p);
    return map;
  }, [summary.byProvider]);
  const groups = useMemo(() => groupModels(setup.models), [setup.models]);

  const listed = new Set<string>();
  for (const m of setup.models) for (const e of m.endpoints ?? []) listed.add(e.provider.toLowerCase());
  const vendorKeys = new Set<string>(setup.vendors);
  const unlisted = (summary.byProvider ?? []).filter((p) => !listed.has(p.key.toLowerCase()) && !vendorKeys.has(p.key));

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <ArrowDownUp className="size-3.5" /> Sort providers by
          <span className="inline-flex rounded-full border bg-secondary p-0.5">
            {(
              [
                ["price", "Price"],
                ["spend", "Our spend"],
                ["usual", MEASURE.average],
                ["uptime", "Uptime"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setSort(k)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 transition-colors",
                  sort === k ? "pill-gradient text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </span>
        </span>
        <label className="flex items-center gap-1.5 text-muted-foreground">
          <input type="checkbox" checked={hideUnrouted} onChange={(e) => setHideUnrouted(e.target.checked)} className="accent-[#8ccbf5]" />
          Hide providers that won&apos;t take our calls
        </label>
      </div>

      {groups.map((g) => {
        const preferred = new Set(g.models.flatMap((m) => m.preferredProviders.map((p) => p.toLowerCase())));
        const endpoints = g.models[0].endpoints;
        const error = g.models.find((m) => m.endpointsError)?.endpointsError ?? null;
        const rows: HostRow[] = (endpoints ?? [])
          .filter((e) => !hideUnrouted || e.servesOurCalls)
          .map((e, i) => ({
            key: `${e.tag ?? e.provider}-${i}`,
            provider: e.provider,
            endpoint: e,
            preferred: preferred.has(e.provider.toLowerCase()) || (e.tag ? preferred.has(e.tag.split("/")[0].toLowerCase()) : false),
            ours: ours.get(e.provider.toLowerCase()) ?? null,
          }));
        const routable = (endpoints ?? []).filter((e) => e.servesOurCalls).length;
        return (
          <section key={g.modelId} className="overflow-hidden rounded-xl border bg-background/30">
            <header className="flex flex-wrap items-center gap-2 border-b bg-secondary/30 px-3 py-2">
              <span className="font-mono text-sm text-foreground">{g.modelId}</span>
              {g.roles.map((r) => (
                <span key={r} className="rounded-full border border-ice/30 bg-ice/10 px-2 py-px text-[10px] text-ice">
                  {SETUP_ROLE_LABEL[r] ?? r}
                </span>
              ))}
              <span className="ml-auto text-[11px] text-muted-foreground">
                {endpoints ? `${endpoints.length} providers · ${routable} take our calls` : ""}
                {preferred.size > 0 && <span className="ml-2 text-ok">preferred: {[...preferred].join(", ")}</span>}
                {preferred.size === 0 && endpoints && <span className="ml-2">OpenRouter chooses</span>}
              </span>
            </header>
            {error && (
              <div className="flex items-center gap-2 border-b bg-est/10 px-3 py-1.5 text-[11px] text-est">
                <AlertTriangle className="size-3.5 shrink-0" /> Couldn&apos;t fetch OpenRouter&apos;s provider list for this model.
                <span className="truncate font-mono opacity-70">{error}</span>
              </div>
            )}
            {rows.length > 0 ? (
              <HostTable rows={sortHosts(rows, sort)} onSelect={onProvider} />
            ) : (
              !error && <p className="px-3 py-4 text-xs text-muted-foreground">No providers listed.</p>
            )}
          </section>
        );
      })}

      {unlisted.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-dashed">
          <header className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <Search className="size-3.5" /> Seen in our calls, but not in the configured models&apos; lists
          </header>
          <HostTable
            rows={sortHosts(
              unlisted.map((p) => ({ key: p.key, provider: p.key, endpoint: null, preferred: false, ours: p })),
              sort,
            )}
            onSelect={onProvider}
          />
        </section>
      )}

      {setup.researchError && (
        <div className="flex items-center gap-2 text-[11px] text-est">
          <AlertTriangle className="size-3.5" /> Couldn&apos;t read the research config: <span className="font-mono">{setup.researchError}</span>
        </div>
      )}
    </div>
  );
}
