import type { OpsVendorBilling } from "@senoy/db/usage";
import { AlertTriangle, Check, Info, KeyRound, RefreshCw, Terminal } from "lucide-react";
import type { ReactNode } from "react";
import { BalanceSparkline } from "@/components/charts/BalanceSparkline";
import { StatusPill } from "@/components/Badges";
import { CopyButton } from "@/components/CodeBlock";
import { Tip, TipBody } from "@/components/Tip";
import { Button } from "@/components/ui";
import { VENDOR_COLOR } from "@/views/overview/ProviderSection";
import { gapTone, startingBalance, type BillingState, type GapTone } from "@/lib/billing";
import { BILLING_HELP } from "@/lib/glossary";
import { BILLING_STATUS_LABEL, vendorLabel } from "@/lib/labels";
import { SERIES_COLORS, type StatusTone } from "@/lib/palette";
import { formatAgo, formatDateTime, formatDay, formatInt, formatPct, formatUsd, ratio } from "@/lib/format";
import { cn } from "@/lib/cn";

/** The command that lets the console read Parallel's balance. */
export const PARALLEL_LOGIN = "pnpm parallel:login";

/** Status pill tone per billing status. */
const STATUS_TONE: Record<OpsVendorBilling["status"], StatusTone> = { ok: "good", not_configured: "warning", error: "critical" };

/**
 * A vendor's color, fixed per vendor.
 * @param vendor - Vendor key
 * @returns Hex color
 */
export function vendorColor(vendor: string): string {
  return VENDOR_COLOR[vendor] ?? SERIES_COLORS[3];
}

/**
 * The status of one vendor's balance reading: OK / Needs login / Error, with the reason in a tooltip.
 * @param props.billing - The vendor's billing check
 */
export function BillingStatusPill({ billing: b }: { billing: OpsVendorBilling }) {
  const tip =
    b.status === "ok" ? (
      <TipBody title="Reading balances" rows={[["Last reading", b.latest ? formatDateTime(b.latest.takenAt) : "—"]]}>
        {BILLING_HELP.snapshots}
      </TipBody>
    ) : b.status === "not_configured" ? (
      <TipBody title="Needs login">
        {b.vendor === "parallel" ? `Run ${PARALLEL_LOGIN} once in a terminal so the console can read Parallel's balance.` : "No credentials to read this vendor's balance."}
      </TipBody>
    ) : (
      <TipBody title="Couldn't read the balance">
        <span className="break-words font-mono text-[11px]">{b.error ?? b.latest?.error ?? "Unknown error"}</span>
      </TipBody>
    );
  return (
    <StatusPill tone={STATUS_TONE[b.status]} tip={tip}>
      {BILLING_STATUS_LABEL[b.status]}
    </StatusPill>
  );
}

/** Text color per gap tone. */
const GAP_CLASS: Record<GapTone, string> = { ok: "text-ok", under: "text-est", over: "text-ice", none: "text-muted-foreground" };

/**
 * The gap between what a vendor billed and what the console recorded, colored by meaning, with likely causes in
 * the tooltip.
 * @param props.billing - The vendor's billing check
 * @param props.compact - Smaller, for the Overview summary
 */
export function GapValue({ billing: b, compact }: { billing: OpsVendorBilling; compact?: boolean }) {
  const tone = gapTone(b.gapUsd);
  const Icon = tone === "ok" ? Check : tone === "under" ? AlertTriangle : Info;
  const text =
    b.gapUsd === null
      ? "needs two readings"
      : tone === "ok"
        ? "matches"
        : tone === "under"
          ? `${formatUsd(b.gapUsd)} not recorded`
          : `${formatUsd(-b.gapUsd)} over-recorded`;
  const help = tone === "ok" ? BILLING_HELP.gapOk : tone === "under" ? BILLING_HELP.gapUnder : tone === "over" ? BILLING_HELP.gapOver : BILLING_HELP.gap;
  return (
    <Tip
      content={
        <TipBody
          title="Billed vs recorded"
          rows={[
            ["Billed by vendor", b.billedSinceFirstUsd === null ? "—" : formatUsd(b.billedSinceFirstUsd)],
            ["Recorded by console", formatUsd(b.recordedSinceFirstUsd)],
            ["Gap", b.gapUsd === null ? "—" : `${b.gapUsd > 0 ? "+" : ""}${formatUsd(b.gapUsd)}`],
            ["Since", b.firstGoodAt ? formatDateTime(b.firstGoodAt) : "—"],
          ]}
        >
          {b.gapUsd === null ? "The gap needs at least two good balance readings. " : ""}
          {help}
        </TipBody>
      }
    >
      <span className={cn("inline-flex cursor-help items-center gap-1 tabular-nums", compact ? "text-[11px]" : "text-xs font-medium", GAP_CLASS[tone])}>
        <Icon className="size-3 shrink-0" />
        {text}
      </span>
    </Tip>
  );
}

/**
 * "Read balances now": takes fresh readings, spins while it works, and flashes green when it lands.
 * @param props.billing - The billing state
 */
export function ReadNowButton({ billing }: { billing: BillingState }) {
  const { readNow, reading, readCount, readError } = billing;
  return (
    <Tip
      content={
        <TipBody title={readError ? "Reading failed" : "Read balances now"}>
          {readError ? <span className="break-words font-mono text-[11px]">{readError.message}</span> : "Asks every vendor for its balance right now, instead of waiting for the next timed reading."}
        </TipBody>
      }
    >
      <Button onClick={readNow} disabled={reading} className={cn(readError && "border-bad/40 text-bad")}>
        <RefreshCw key={readCount} className={cn("size-3.5", reading && "animate-spin", readCount > 0 && !reading && "flash-ok")} />
        <span key={`r${readCount}`} className={cn(readCount > 0 && !reading && "flash-ok")}>
          {reading ? "Reading…" : readCount > 0 ? "Read just now" : "Read balances now"}
        </span>
      </Button>
    </Tip>
  );
}

/**
 * A labelled figure inside a vendor card.
 * @param props.label - Label (with tooltip)
 * @param props.tip - What it means
 */
function Figure({ label, tip, children, className }: { label: string; tip: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] text-muted-foreground">
        <Tip content={typeof tip === "string" ? <TipBody title={label}>{tip}</TipBody> : tip} underline>
          {label}
        </Tip>
      </div>
      <div className="mt-0.5 truncate font-mono text-sm tabular-nums">{children}</div>
    </div>
  );
}

/**
 * Billed vs recorded as two bars on one scale, so the gap is visible at a glance.
 * @param props.billing - The vendor's billing check
 */
function BilledVsRecorded({ billing: b }: { billing: OpsVendorBilling }) {
  const billed = b.billedSinceFirstUsd ?? 0;
  const max = Math.max(billed, b.recordedSinceFirstUsd, 0.000001);
  const color = vendorColor(b.vendor);
  const rows = [
    { label: "Billed by vendor", value: b.billedSinceFirstUsd, tip: BILLING_HELP.billed, fill: color },
    { label: "Recorded by console", value: b.recordedSinceFirstUsd, tip: BILLING_HELP.recorded, fill: "rgba(140,203,245,0.55)" },
  ];
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span>Since first reading{b.firstGoodAt ? ` · ${formatDay(b.firstGoodAt)} ${new Date(b.firstGoodAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}</span>
        <GapValue billing={b} />
      </div>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-2 text-xs">
          <Tip content={<TipBody title={row.label}>{row.tip}</TipBody>} underline className="text-muted-foreground">
            {row.label}
          </Tip>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            {row.value !== null && (
              <div className="animate-grow-x h-full rounded-full" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, backgroundColor: row.fill }} />
            )}
          </div>
          <span className="text-right font-mono tabular-nums">{row.value === null ? "—" : formatUsd(row.value)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * OpenRouter's own spend counters for our key, and how much of the key's limit is left.
 * @param props.windows - `keyWindows`
 */
function KeyWindows({ windows: w }: { windows: NonNullable<OpsVendorBilling["keyWindows"]> }) {
  const used = w.limitUsd !== null && w.remainingUsd !== null ? w.limitUsd - w.remainingUsd : null;
  const left = w.limitUsd !== null && w.remainingUsd !== null ? ratio(w.remainingUsd, w.limitUsd) : null;
  const low = left !== null && left < 0.2;
  return (
    <div className="space-y-2 rounded-xl border bg-secondary/40 p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <KeyRound className="size-3" />
        <Tip content={<TipBody title="Our API key">{BILLING_HELP.keyWindows}</TipBody>} underline>
          Our key, as OpenRouter counts it
        </Tip>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["Today", w.dailyUsd],
            ["This week", w.weeklyUsd],
            ["This month", w.monthlyUsd],
          ] as const
        ).map(([label, usd]) => (
          <div key={label}>
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="font-mono text-sm tabular-nums">{formatUsd(usd)}</div>
          </div>
        ))}
      </div>
      {w.limitUsd !== null && w.remainingUsd !== null ? (
        <Tip
          className="block"
          content={
            <TipBody
              title="Key spend limit"
              rows={[
                ["Limit", formatUsd(w.limitUsd)],
                ["Used", used === null ? "—" : formatUsd(used)],
                ["Left", formatUsd(w.remainingUsd)],
              ]}
            >
              OpenRouter stops the key once it has spent its limit.
            </TipBody>
          }
        >
          <div className="w-full space-y-1">
            <div className="flex justify-between text-[11px]">
              <span className="text-muted-foreground">Limit left</span>
              <span className={cn("tabular-nums", low ? "text-est" : "text-foreground")}>
                {formatUsd(w.remainingUsd)} of {formatUsd(w.limitUsd)} · {formatPct(left, 0)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className={cn("animate-grow-x h-full rounded-full", low ? "bg-est" : "bg-gradient-to-r from-sky-500 to-cyan-300")}
                style={{ width: `${Math.max(1, (left ?? 0) * 100)}%` }}
              />
            </div>
          </div>
        </Tip>
      ) : (
        <div className="text-[11px] text-muted-foreground">No spend limit on this key.</div>
      )}
    </div>
  );
}

/**
 * Whether anything was rebuilt from stored research for this vendor.
 * @param b - The vendor's billing check
 * @returns True when there are rebuilt runs or fact-check diagnostics
 */
export function hasReconstructed(b: OpsVendorBilling): boolean {
  // Older API builds don't send the field at all.
  return Boolean(b.reconstructed && (b.reconstructed.calls > 0 || b.reconstructed.factCheckDiagnostics > 0));
}

/**
 * What a research vendor's spend from before recording looks like, rebuilt from stored research.
 * @param props.billing - The vendor's billing check
 * @returns The lines, or null when there is nothing rebuilt
 */
export function ReconstructedLine({ billing: b, className }: { billing: OpsVendorBilling; className?: string }) {
  const r = b.reconstructed;
  if (!r || !hasReconstructed(b)) return null;
  const name = vendorLabel(b.vendor);
  return (
    <Tip
      className={cn("block", className)}
      content={
        <TipBody
          title="Reconstructed (estimated)"
          rows={[
            ["Research runs found", formatInt(r.calls)],
            ["At list price", `~${formatUsd(r.estimatedUsd)}`],
            ...(r.factCheckDiagnostics ? ([["Diagnostics with fact-checks", formatInt(r.factCheckDiagnostics)]] as [string, string][]) : []),
            ["From", r.from ? formatDateTime(r.from) : "—"],
            ["To", r.to ? formatDateTime(r.to) : "—"],
          ]}
        >
          {BILLING_HELP.reconstructed} {r.factCheckDiagnostics ? BILLING_HELP.factChecks : ""}
        </TipBody>
      }
    >
      <span className="cursor-help">
        <span className="rounded bg-est/10 px-1 text-[10px] uppercase tracking-wide text-est">Reconstructed</span>{" "}
        {r.calls > 0 && (
          <>
            Rebuilt from stored research: {formatInt(r.calls)} {name} run{r.calls === 1 ? "" : "s"}{" "}
            <span className="italic text-est">≈ ~{formatUsd(r.estimatedUsd)}</span>
            {r.from ? ` since ${formatDay(r.from)}` : ""} (a lower bound; live checks and earlier runs left no trace).
          </>
        )}
        {r.factCheckDiagnostics > 0 && (
          <>
            {r.calls > 0 ? " + " : ""}fact-checks in {formatInt(r.factCheckDiagnostics)} Placement diagnostic{r.factCheckDiagnostics === 1 ? "" : "s"} (call count not
            stored).
          </>
        )}
      </span>
    </Tip>
  );
}

/**
 * The friendly card body for Parallel before `pnpm parallel:login` has been run.
 * @param props.vendor - Vendor key
 */
function NeedsLogin({ vendor }: { vendor: string }) {
  if (vendor !== "parallel") {
    return <p className="text-xs text-muted-foreground">No credentials to read this vendor&apos;s balance. Add its API key to the console API&apos;s environment.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Run this once in a terminal to let the console read Parallel&apos;s balance:</p>
      <div className="flex items-center justify-between gap-2 rounded-lg border bg-[#050911]/70 px-2.5 py-1.5">
        <span className="flex items-center gap-2 font-mono text-xs text-ice">
          <Terminal className="size-3.5 text-muted-foreground" />
          {PARALLEL_LOGIN}
        </span>
        <CopyButton text={PARALLEL_LOGIN} />
      </div>
      <p className="text-[11px] text-muted-foreground">It opens a device login; approve it in the browser and the next reading picks it up.</p>
    </div>
  );
}

/**
 * "Started with": the account's starting balance, exact for OpenRouter and worked out (with ≈) for the others.
 * @param props.billing - One vendor's billing check
 * @param props.compact - One small line, for the Overview summary
 */
export function StartedWith({ billing: b, compact }: { billing: OpsVendorBilling; compact?: boolean }) {
  const start = startingBalance(b);
  if (!start) return null;
  const value = `${start.exact ? "" : "≈ "}${formatUsd(start.usd)}`;
  if (compact) {
    return (
      <Tip content={<TipBody title="Started with">{BILLING_HELP.startedWith}</TipBody>} underline className="text-[11px] text-muted-foreground">
        started with {value}
      </Tip>
    );
  }
  return (
    <Figure label="Started with" tip={BILLING_HELP.startedWith}>
      {value}
    </Figure>
  );
}

/**
 * One vendor's billing check card: status, latest balance, billed vs recorded with the gap, key windows
 * (OpenRouter), a balance sparkline, and what is known about spend before recording.
 * @param props.billing - The vendor's billing check
 */
export function VendorBillingCard({ billing: b }: { billing: OpsVendorBilling }) {
  const color = vendorColor(b.vendor);
  const latest = b.latest;
  return (
    <section className="glass glow-border inner-glow lift flex flex-col gap-4 rounded-2xl border p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <span className="size-2.5 rounded-sm" style={{ backgroundColor: color }} />
            {vendorLabel(b.vendor)}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{latest ? `Read ${formatAgo(latest.takenAt)}` : "No reading yet"}</div>
        </div>
        <BillingStatusPill billing={b} />
      </header>

      {b.status === "not_configured" ? (
        <NeedsLogin vendor={b.vendor} />
      ) : (
        <>
          {b.status === "error" && (
            <p className="rounded-lg border border-bad/30 bg-bad/10 px-2.5 py-1.5 font-mono text-[11px] break-words text-bad">{b.error ?? latest?.error ?? "Couldn't read the balance."}</p>
          )}
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <div className="text-[11px] text-muted-foreground">Balance now</div>
              <div className="font-mono text-2xl font-semibold tabular-nums">{latest?.balanceUsd == null ? "—" : formatUsd(latest.balanceUsd)}</div>
            </div>
            <StartedWith billing={b} />
            {latest?.pendingUsd != null && (
              <Figure label="Pending" tip={BILLING_HELP.pending}>
                {formatUsd(latest.pendingUsd)}
              </Figure>
            )}
            {latest?.accountUsageUsd != null && (
              <Figure label="Account spent" tip="Everything the account has spent, all keys, all time, as the vendor reports it.">
                {formatUsd(latest.accountUsageUsd)}
              </Figure>
            )}
          </div>
          <BalanceSparkline series={b.series} color={color} />
          <BilledVsRecorded billing={b} />
          {b.keyWindows && <KeyWindows windows={b.keyWindows} />}
        </>
      )}

      <div className="mt-auto space-y-1.5 border-t pt-3 text-[11px] leading-relaxed text-muted-foreground">
        <div className="flex justify-between gap-2">
          <Tip content={<TipBody title="Recorded, all time">Every Usage Record for this vendor, ever.</TipBody>} underline>
            Recorded by console, all time
          </Tip>
          <span className="font-mono tabular-nums text-foreground">{formatUsd(b.recordedAllTimeUsd)}</span>
        </div>
        {b.untrackedAccountUsd !== null && (
          <div className="flex justify-between gap-2">
            <Tip content={<TipBody title="Never seen by the console">{BILLING_HELP.untrackedAccount}</TipBody>} underline>
              Billed, never recorded (account)
            </Tip>
            <span className="font-mono tabular-nums text-est">≈ {formatUsd(Math.max(0, b.untrackedAccountUsd))}</span>
          </div>
        )}
        {b.untrackedKeyUsd !== null && (
          <div className="flex justify-between gap-2">
            <Tip content={<TipBody title="Never seen on our key">{BILLING_HELP.untrackedKey}</TipBody>} underline>
              Billed, never recorded (our key)
            </Tip>
            <span className="font-mono tabular-nums text-est">≈ {formatUsd(Math.max(0, b.untrackedKeyUsd))}</span>
          </div>
        )}
        {b.untrackedAccountUsd === null && <ReconstructedLine billing={b} />}
        {b.untrackedAccountUsd === null && <p>{BILLING_HELP.noLifetime}</p>}
      </div>
    </section>
  );
}
