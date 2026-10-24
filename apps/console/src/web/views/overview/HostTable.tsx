import type { OpsBreakdownRow, OpsModelEndpoint } from "@senoy/db/usage";
import { Star } from "lucide-react";
import { abbreviate } from "@/components/charts/PillBars";
import { Table, Td, Th, Tr } from "@/components/Table";
import { Tip, TipBody } from "@/components/Tip";
import { METRIC_HELP } from "@/lib/glossary";
import { MEASURE } from "@/lib/labels";
import { formatDuration, formatInt, formatPct, formatUsd, ratio } from "@/lib/format";
import { cn } from "@/lib/cn";

/** How the host rows are ordered. */
export type HostSort = "price" | "spend" | "usual" | "uptime";

/** One host row: OpenRouter's listing merged with what our calls show for that provider. */
export type HostRow = {
  key: string;
  provider: string;
  endpoint: OpsModelEndpoint | null;
  preferred: boolean;
  /** Our calls answered by this provider, across all models (the summary is not split by model). */
  ours: OpsBreakdownRow | null;
};

/** Why a host is dimmed. */
const NOT_ROUTED =
  "Doesn't accept the parameters we send (structured output + reasoning), so OpenRouter won't route our calls there.";

/**
 * Formats a $/1M-token list price.
 * @param usd - Price or null
 * @returns e.g. `$0.22`
 */
function price(usd: number | null): string {
  return usd === null ? "—" : `$${usd < 1 ? usd.toFixed(3).replace(/0$/, "") : usd.toFixed(2)}`;
}

/**
 * Orders host rows.
 * @param rows - Rows
 * @param sort - Sort key
 * @returns A sorted copy (routable hosts first for price)
 */
export function sortHosts(rows: HostRow[], sort: HostSort): HostRow[] {
  const blended = (r: HostRow) =>
    r.endpoint && r.endpoint.promptUsdPerMTok !== null ? r.endpoint.promptUsdPerMTok + (r.endpoint.completionUsdPerMTok ?? 0) : Infinity;
  return [...rows].sort((a, b) => {
    if (sort === "spend") return (b.ours?.totalUsd ?? -1) - (a.ours?.totalUsd ?? -1) || blended(a) - blended(b);
    if (sort === "usual") return (a.ours?.avgDurationMs ?? Infinity) - (b.ours?.avgDurationMs ?? Infinity) || blended(a) - blended(b);
    if (sort === "uptime") return (b.endpoint?.uptimeLast30m ?? -1) - (a.endpoint?.uptimeLast30m ?? -1) || blended(a) - blended(b);
    return Number(b.endpoint?.servesOurCalls ?? true) - Number(a.endpoint?.servesOurCalls ?? true) || blended(a) - blended(b);
  });
}

/**
 * Every host for one configured model: list price in/out per 1M tokens (with how many times the cheapest it is),
 * uptime and time to first token from OpenRouter, and our spend/calls/success/usual time. The preferred host is
 * starred; hosts that won't take our calls are dimmed. Rows open Calls filtered by provider.
 * @param props.rows - Host rows, already sorted
 * @param props.onSelect - Provider click
 */
export function HostTable({ rows, onSelect }: { rows: HostRow[]; onSelect: (provider: string) => void }) {
  const cheapest = Math.min(
    ...rows.filter((r) => r.endpoint?.servesOurCalls && r.endpoint.promptUsdPerMTok !== null).map((r) => r.endpoint!.promptUsdPerMTok!),
  );
  const maxSpend = Math.max(0, ...rows.map((r) => r.ours?.totalUsd ?? 0));
  const oursTip = (title: string) => (
    <TipBody title={title}>From our recorded calls answered by this provider, across all models it served. &quot;—&quot; = no calls yet.</TipBody>
  );

  return (
    <Table>
      <thead>
        <tr>
          <Th>Provider</Th>
          <Th numeric tip="OpenRouter's list price for this model on this provider, per 1 million tokens in / out. ×N = times the cheapest provider that takes our calls.">
            Price in / out
          </Th>
          <Th numeric tip="Share of requests this provider answered successfully over the last 30 minutes, as OpenRouter reports it.">
            Uptime
          </Th>
          <Th numeric tip="How long until the first token arrived, last 30 minutes, as OpenRouter reports it.">
            First token
          </Th>
          <Th numeric tip={oursTip("Our spend")}>Our spend</Th>
          <Th numeric tip={oursTip("Our calls")}>Calls</Th>
          <Th numeric tip={oursTip("Worked")}>Worked</Th>
          <Th numeric tip={<TipBody title={MEASURE.average}>{METRIC_HELP.average} From our calls on this provider.</TipBody>}>
            {MEASURE.average}
          </Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const ep = r.endpoint;
          const routable = ep?.servesOurCalls ?? true;
          const times = ep?.promptUsdPerMTok && Number.isFinite(cheapest) && cheapest > 0 ? ep.promptUsdPerMTok / cheapest : null;
          const success = r.ours ? ratio(r.ours.calls - r.ours.failedCalls, r.ours.calls) : null;
          return (
            <Tr key={r.key} onClick={() => onSelect(r.provider)} className={cn("animate-fade-in", !routable && "opacity-45")}>
              <Td className="max-w-[18rem]">
                <Tip
                  content={
                    <TipBody title={r.provider} rows={ep?.tag ? [["OpenRouter tag", ep.tag]] : undefined}>
                      {!routable ? NOT_ROUTED : r.preferred ? "We ask OpenRouter to try this provider first." : "OpenRouter may route our calls here."}
                      {" "}Click to see calls it answered.
                    </TipBody>
                  }
                >
                  <span className="flex min-w-0 items-center gap-2" style={{ animationDelay: `${i * 25}ms` }}>
                    <span
                      className={cn(
                        "grid h-6 w-10 shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold ring-1",
                        r.preferred ? "bg-ok/15 text-ok ring-ok/40" : "bg-ice/10 text-ice ring-ice/30",
                      )}
                    >
                      {abbreviate(r.provider)}
                    </span>
                    <span className="truncate">{r.provider}</span>
                    {ep?.tag && ep.tag.includes("/") && <span className="truncate font-mono text-[10px] text-muted-foreground">{ep.tag.split("/")[1]}</span>}
                    {r.preferred && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-ok/10 px-1.5 text-[10px] text-ok">
                        <Star className="size-2.5 fill-current" /> preferred
                      </span>
                    )}
                    {!routable && <span className="shrink-0 rounded-full border px-1.5 text-[10px] text-muted-foreground">not routed</span>}
                  </span>
                </Tip>
              </Td>
              <Td numeric>
                <span className="font-mono">
                  {price(ep?.promptUsdPerMTok ?? null)} <span className="text-muted-foreground">/</span> {price(ep?.completionUsdPerMTok ?? null)}
                </span>
                {times !== null && routable && (
                  <span className={cn("ml-1.5 text-[10px]", times <= 1.001 ? "text-ok" : times > 3 ? "text-est" : "text-muted-foreground")}>
                    {times <= 1.001 ? "cheapest" : `×${times.toFixed(1)}`}
                  </span>
                )}
              </Td>
              <Td numeric className={ep?.uptimeLast30m !== null && ep?.uptimeLast30m !== undefined && ep.uptimeLast30m < 95 ? "text-bad" : ""}>
                {ep?.uptimeLast30m === null || ep?.uptimeLast30m === undefined ? "—" : `${ep.uptimeLast30m.toFixed(ep.uptimeLast30m % 1 ? 1 : 0)}%`}
              </Td>
              <Td numeric>{formatDuration(ep?.latencyLast30mMs ?? null)}</Td>
              <Td numeric className="w-36">
                {r.ours ? (
                  <span className="flex items-center justify-end gap-2">
                    <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted/60">
                      <span
                        className="animate-grow-x block h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300"
                        style={{ width: `${maxSpend ? (r.ours.totalUsd / maxSpend) * 100 : 0}%` }}
                      />
                    </span>
                    <span className="font-mono">{formatUsd(r.ours.totalUsd)}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
              <Td numeric>{r.ours ? formatInt(r.ours.calls) : <span className="text-muted-foreground">—</span>}</Td>
              <Td numeric className={success !== null && success < 0.9 ? "text-bad" : success !== null ? "text-ok" : "text-muted-foreground"}>
                {success === null ? "—" : formatPct(success, 0)}
              </Td>
              <Td numeric>{r.ours ? formatDuration(r.ours.avgDurationMs) : <span className="text-muted-foreground">—</span>}</Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
