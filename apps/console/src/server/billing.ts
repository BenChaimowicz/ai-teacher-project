import { sql } from "drizzle-orm";
import {
  BALANCE_VENDORS,
  RESEARCH_ADAPTER_VENDORS,
  type BalanceVendor,
  type OpsBalanceSnapshot,
  type OpsBilling,
  type OpsVendorBilling,
} from "@senoy/db";
import {
  RESEARCH_LIST_PRICES_USD,
  readOpenRouterBalance,
  readParallelBalance,
  readYouBalance,
  type BalanceReading,
  type ParallelTokenKeeper,
} from "@senoy/research";
import { toIso, toNumber, toNumberOrNull, toText, type SqlRow } from "./format.ts";
import type { SqlRunner } from "./ops-store.ts";
import type { ResolvedRange } from "./query.ts";

/**
 * The billing check (SEN-70): balance snapshots of every paid vendor, taken on startup and on a schedule while the
 * Usage Console API runs, compared with what Usage Records say we spent. Also the single writer of the Parallel token
 * file: it keeps the access token fresh so the Learner API and worker can read balances around research calls.
 */

/** How often readings are taken while the console API runs. */
export const SNAPSHOT_EVERY_MS = 15 * 60_000;

/** How often the Parallel token is checked (and refreshed when close to expiry). */
const TOKEN_CHECK_EVERY_MS = 60_000;

/** One vendor's reader: a reading, or `not_configured` when there are no credentials. Throws on failure. */
export type VendorReader = () => Promise<BalanceReading | "not_configured">;

/** Where the console logs; Fastify's Pino logger fits. */
export type BillingLog = { info(message: string): void; error(message: string): void };

/** The billing routes and the snapshot schedule. */
export type BillingService = {
  /** The billing check for a range (the range only bounds `series`). */
  billing(range: ResolvedRange): Promise<OpsBilling>;
  /** Takes readings now, then answers like `billing`. */
  refresh(range: ResolvedRange): Promise<OpsBilling>;
  /** Takes one reading of every vendor and stores it. Concurrent calls share one run. */
  takeSnapshots(): Promise<SnapshotOutcome[]>;
  /** Starts the schedule: readings now and every `snapshotEveryMs`, plus Parallel token upkeep. */
  start(log: BillingLog): void;
  stop(): void;
};

/** What one vendor reading did. */
export type SnapshotOutcome = { vendor: BalanceVendor; status: "stored" | "error" | "not_configured"; error: string | null };

/** A good reading's numbers, as the billing math uses them. */
export type GoodReading = Omit<OpsBalanceSnapshot, "error">;

/**
 * Rounds money to a millionth of a dollar, so float noise does not show.
 * @param usd - Amount
 */
function round(usd: number) {
  return Math.round(usd * 1e6) / 1e6;
}

/**
 * The money a vendor counts against us in one reading: the balance, plus Parallel's held funds (see
 * `parallelFundsUsd` in `@senoy/research`, which measurement uses the same way).
 * @param vendor - Vendor
 * @param reading - Reading
 */
function fundsOf(vendor: BalanceVendor, reading: GoodReading) {
  return (reading.balanceUsd ?? 0) + (vendor === "parallel" ? reading.pendingUsd ?? 0 : 0);
}

/**
 * What the vendor billed between the first good reading and the latest one.
 * OpenRouter: the rise in our key's lifetime usage (else the account's), which top-ups do not touch. Otherwise the sum
 * of every drop between consecutive readings: a rise is a top-up and is skipped, and an OpenRouter rise in credits
 * bought is added back. A top-up and spend inside the same interval hide part of that spend.
 * @param vendor - Vendor
 * @param good - Good readings, oldest first
 * @returns USD, or null with fewer than two readings
 */
export function billedSinceFirst(vendor: BalanceVendor, good: GoodReading[]): number | null {
  if (good.length < 2) return null;
  const first = good[0]!;
  const last = good[good.length - 1]!;
  if (vendor === "openrouter") {
    if (first.keyUsageUsd !== null && last.keyUsageUsd !== null) return round(last.keyUsageUsd - first.keyUsageUsd);
    if (first.accountUsageUsd !== null && last.accountUsageUsd !== null) return round(last.accountUsageUsd - first.accountUsageUsd);
  }
  let billed = 0;
  for (let index = 1; index < good.length; index += 1) {
    const before = good[index - 1]!;
    const after = good[index]!;
    let drop = fundsOf(vendor, before) - fundsOf(vendor, after);
    if (before.creditsTotalUsd !== null && after.creditsTotalUsd !== null) drop += Math.max(0, after.creditsTotalUsd - before.creditsTotalUsd);
    billed += Math.max(0, drop);
  }
  return round(billed);
}

/**
 * OpenRouter key usage windows from a stored `/key` body.
 * @param raw - The stored `raw` of an OpenRouter reading
 */
export function keyWindowsFrom(raw: unknown): OpsVendorBilling["keyWindows"] {
  const data = (raw as { key?: { data?: Record<string, unknown> } } | null)?.key?.data;
  if (!data) return null;
  return {
    dailyUsd: toNumber(data.usage_daily),
    weeklyUsd: toNumber(data.usage_weekly),
    monthlyUsd: toNumber(data.usage_monthly),
    limitUsd: toNumberOrNull(data.limit),
    remainingUsd: toNumberOrNull(data.limit_remaining),
  };
}

/**
 * What the research accounts started with, as the Operators told us on 2026-10-24 (neither vendor reports it).
 * Lifetime spend is this minus today's balance, so update it when an account is topped up.
 */
export const OPERATOR_STARTING_BALANCES: Partial<Record<BalanceVendor, number>> = { you: 100, parallel: 25 };

/** Everything one vendor's billing check is built from. */
export type VendorBillingInput = {
  vendor: BalanceVendor;
  /** Why the vendor cannot be read now, when it has no credentials. */
  notConfigured: string | null;
  good: GoodReading[];
  latest: OpsBalanceSnapshot | null;
  /** `raw` of the latest good reading. */
  latestGoodRaw: unknown;
  series: OpsBalanceSnapshot[];
  recordedSinceFirstUsd: number;
  recordedAllTimeUsd: number;
  reconstructed: OpsVendorBilling["reconstructed"];
  /** A starting balance an Operator told us, for vendors that do not report one. */
  operatorStartingUsd?: number;
};

/**
 * Builds one vendor's billing check.
 * @param input - Readings and recorded sums
 */
export function vendorBilling(input: VendorBillingInput): OpsVendorBilling {
  const { vendor, good, latest } = input;
  const latestGood = good[good.length - 1] ?? null;
  const billed = billedSinceFirst(vendor, good);
  const openRouter = vendor === "openrouter";
  const starting = openRouter
    ? latestGood?.creditsTotalUsd != null ? { usd: latestGood.creditsTotalUsd, source: "vendor" as const } : null
    : input.operatorStartingUsd != null ? { usd: input.operatorStartingUsd, source: "operator" as const } : null;
  // OpenRouter reports lifetime usage itself; for the others it is what the account started with minus what is left.
  const lifetimeSpent = openRouter ? latestGood?.accountUsageUsd ?? null
    : starting && latestGood?.balanceUsd != null ? starting.usd - fundsOf(vendor, latestGood) : null;
  const [status, error]: [OpsVendorBilling["status"], string | null] = input.notConfigured ? ["not_configured", input.notConfigured]
    : !latest ? ["error", "No reading yet"]
      : latest.error ? ["error", latest.error] : ["ok", null];
  return {
    vendor,
    status,
    error,
    latest,
    firstGoodAt: good[0]?.takenAt ?? null,
    billedSinceFirstUsd: billed,
    recordedSinceFirstUsd: round(input.recordedSinceFirstUsd),
    gapUsd: billed === null ? null : round(billed - input.recordedSinceFirstUsd),
    recordedAllTimeUsd: round(input.recordedAllTimeUsd),
    startingUsd: starting?.usd ?? null,
    startingSource: starting?.source ?? null,
    untrackedAccountUsd: lifetimeSpent === null ? null : round(lifetimeSpent - input.recordedAllTimeUsd),
    untrackedKeyUsd: openRouter && latestGood?.keyUsageUsd != null ? round(latestGood.keyUsageUsd - input.recordedAllTimeUsd) : null,
    reconstructed: openRouter ? null : input.reconstructed,
    keyWindows: openRouter ? keyWindowsFrom(input.latestGoodRaw) : null,
    series: input.series,
  };
}

/**
 * Prices calls rebuilt from stored Source packs and counts fact-check diagnostics, per research vendor.
 * @param packs - Per adapter: counted packs and their first/last start
 * @param diagnostics - Per fact-check adapter: diagnostics made before recording began
 * @returns The `reconstructed` block per vendor (vendors with nothing get zeros)
 */
export function reconstructedByVendor(
  packs: { adapter: string; calls: number; fromAt: string | null; toAt: string | null }[],
  diagnostics: { adapter: string; count: number }[],
): Record<BalanceVendor, NonNullable<OpsVendorBilling["reconstructed"]>> {
  const empty = () => ({ calls: 0, estimatedUsd: 0, factCheckDiagnostics: 0, from: null as string | null, to: null as string | null });
  const out: Record<BalanceVendor, NonNullable<OpsVendorBilling["reconstructed"]>> = { openrouter: empty(), you: empty(), parallel: empty() };
  const vendorOf = (adapter: string) => RESEARCH_ADAPTER_VENDORS[adapter as keyof typeof RESEARCH_ADAPTER_VENDORS] as BalanceVendor | undefined;
  for (const row of packs) {
    const vendor = vendorOf(row.adapter);
    if (!vendor) continue;
    const block = out[vendor];
    block.calls += row.calls;
    block.estimatedUsd = round(block.estimatedUsd + row.calls * RESEARCH_LIST_PRICES_USD[row.adapter as keyof typeof RESEARCH_LIST_PRICES_USD]);
    if (row.fromAt && (!block.from || row.fromAt < block.from)) block.from = row.fromAt;
    if (row.toAt && (!block.to || row.toAt > block.to)) block.to = row.toAt;
  }
  for (const row of diagnostics) {
    const vendor = vendorOf(row.adapter);
    if (vendor) out[vendor].factCheckDiagnostics += row.count;
  }
  return out;
}

/**
 * Runs async steps one after another.
 * @param steps - Steps in order
 * @returns Their results, in order
 */
async function inSequence<T>(steps: (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  for (const step of steps) results.push(await step());
  return results;
}

/** What a Usage Record cost for the billing check: measured cost first for research calls. */
const RECORDED_COST = sql`case when u.role in ('research_primary', 'research_secondary')
  then coalesce(u.measured_cost_usd, u.cost_usd) else u.cost_usd end`;

/** Snapshot columns for `OpsBalanceSnapshot`, from `s`. */
const SNAPSHOT_COLUMNS = sql`s.vendor, s.taken_at as "takenAt", s.balance_usd as "balanceUsd", s.pending_usd as "pendingUsd",
  s.credits_total_usd as "creditsTotalUsd", s.account_usage_usd as "accountUsageUsd", s.key_usage_usd as "keyUsageUsd", s.error`;

/**
 * Stored Source packs that were never recorded as Usage Records, per adapter. A pack counts unless it failed
 * (`error`), or its vendor request id is on a Usage Record, or (with no id, e.g. timed out) it started after recording
 * began, when its call was recorded without an id to match. Browser-test fixture packs (answered, yet priced at 0, which
 * a real answered pack never is) are left out.
 */
export const RECONSTRUCTED_PACKS_QUERY = sql`with first_record as (select min(created_at) as at from usage_records where origin = 'captured'),
  packs as (
    select p->>'adapter' as adapter, p->>'status' as status, nullif(p->>'vendorRequestId', '') as rid,
      (p->>'startedAt')::timestamptz as started, (p->>'estimatedCostUsd')::double precision as listed
    from lesson_research lr cross join lateral jsonb_array_elements(lr.source_packs) p
  )
  select packs.adapter, count(*) as calls, min(packs.started) as "fromAt", max(packs.started) as "toAt"
  from packs cross join first_record
  where packs.status is distinct from 'error'
    and not (packs.status in ('ok', 'empty_vendor', 'empty_filtered') and packs.listed = 0)
    and case when packs.rid is not null
      then not exists (select 1 from usage_records u where u.response_id = packs.rid)
      else first_record.at is null or packs.started < first_record.at end
  group by packs.adapter`;

/** Diagnostics that fact-checked before recording began, per adapter. */
const FACT_CHECK_DIAGNOSTICS_QUERY = sql`select d.fact_check_vendor as adapter, count(*) as count
  from starting_level_diagnostics d
  where d.fact_check_vendor is not null
    and d.created_at < coalesce((select min(created_at) from usage_records where origin = 'captured'), 'infinity'::timestamptz)
  group by 1`;

/**
 * Maps a snapshot row.
 * @param row - Row with `SNAPSHOT_COLUMNS`
 */
function toSnapshot(row: SqlRow): OpsBalanceSnapshot {
  return {
    takenAt: toIso(row.takenAt),
    balanceUsd: toNumberOrNull(row.balanceUsd),
    pendingUsd: toNumberOrNull(row.pendingUsd),
    creditsTotalUsd: toNumberOrNull(row.creditsTotalUsd),
    accountUsageUsd: toNumberOrNull(row.accountUsageUsd),
    keyUsageUsd: toNumberOrNull(row.keyUsageUsd),
    error: toText(row.error),
  };
}

/**
 * The production readers: OpenRouter and You.com with their API keys, Parallel with the Account API token the keeper
 * keeps fresh. A missing key or login is `not_configured`.
 * @param options.env - Environment with the keys
 * @param options.keeper - Parallel token keeper (the single writer of the token file)
 * @param options.fetch - fetch seam
 */
export function vendorReadersFromEnv(options: {
  env: Record<string, string | undefined>;
  keeper: ParallelTokenKeeper;
  fetch?: typeof globalThis.fetch;
}): Record<BalanceVendor, VendorReader> {
  const request = { fetch: options.fetch };
  return {
    openrouter: async () => (options.env.OPENROUTER_API_KEY?.trim() ? readOpenRouterBalance(options.env.OPENROUTER_API_KEY, request) : "not_configured"),
    you: async () => (options.env.YOU_DOT_COM_API_KEY?.trim() ? readYouBalance(options.env.YOU_DOT_COM_API_KEY, request) : "not_configured"),
    parallel: async () => {
      const state = await options.keeper.ensureFresh();
      if (state.status === "not_configured") return "not_configured";
      if (state.status === "error") throw new Error(state.error);
      return readParallelBalance(state.accessToken, request);
    },
  };
}

/** Why each vendor is `not_configured`. */
const NOT_CONFIGURED: Record<BalanceVendor, string> = {
  openrouter: "OPENROUTER_API_KEY is not set",
  you: "YOU_DOT_COM_API_KEY is not set",
  parallel: "Not signed in to Parallel's Account API. Run pnpm parallel:login.",
};

/**
 * Builds the billing service.
 * @param options.run - SQL runner
 * @param options.readers - One reader per vendor
 * @param options.keeper - Parallel token keeper, kept fresh on a timer once started
 * @param options.now - Clock
 * @param options.snapshotEveryMs - Reading interval (default 15 min)
 */
export function createBillingService(options: {
  run: SqlRunner;
  readers: Record<BalanceVendor, VendorReader>;
  keeper?: ParallelTokenKeeper;
  now?: () => Date;
  snapshotEveryMs?: number;
}): BillingService {
  const { run, readers } = options;
  const now = options.now ?? (() => new Date());
  const snapshotEveryMs = options.snapshotEveryMs ?? SNAPSHOT_EVERY_MS;
  const notConfigured = new Map<BalanceVendor, string>();
  let inFlight: Promise<SnapshotOutcome[]> | null = null;
  let timers: ReturnType<typeof setInterval>[] = [];
  let log: BillingLog | null = null;

  /**
   * Reads one vendor and stores the reading (or its error). `not_configured` stores nothing.
   * @param vendor - Vendor
   */
  const snapshotOne = async (vendor: BalanceVendor): Promise<SnapshotOutcome> => {
    const takenAt = now().toISOString();
    let reading: BalanceReading | "not_configured";
    try {
      reading = await readers[vendor]();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notConfigured.delete(vendor);
      await run(sql`insert into vendor_balance_snapshots (vendor, taken_at, error) values (${vendor}, ${takenAt}::timestamptz, ${message})`);
      return { vendor, status: "error", error: message };
    }
    if (reading === "not_configured") {
      notConfigured.set(vendor, NOT_CONFIGURED[vendor]);
      return { vendor, status: "not_configured", error: NOT_CONFIGURED[vendor] };
    }
    notConfigured.delete(vendor);
    await run(sql`insert into vendor_balance_snapshots
      (vendor, taken_at, balance_usd, pending_usd, credits_total_usd, account_usage_usd, key_usage_usd, raw)
      values (${vendor}, ${takenAt}::timestamptz, ${reading.balanceUsd}, ${reading.pendingUsd}, ${reading.creditsTotalUsd},
        ${reading.accountUsageUsd}, ${reading.keyUsageUsd}, ${JSON.stringify(reading.raw ?? null)}::jsonb)`);
    return { vendor, status: "stored", error: null };
  };

  const takeSnapshots = () => {
    inFlight ??= Promise.all(BALANCE_VENDORS.map(async (vendor) => {
      try {
        return await snapshotOne(vendor);
      } catch (error) {
        // The insert itself failed (database down): report it, store nothing.
        const message = `[billing.ts: takeSnapshots] Could not store the reading || vendor=${vendor} || ${error instanceof Error ? error.message : String(error)}`;
        return { vendor, status: "error" as const, error: message };
      }
    })).finally(() => {
      inFlight = null;
    });
    return inFlight;
  };

  const billing = async (range: ResolvedRange): Promise<OpsBilling> => {
    // One query at a time: run together, these stalled on the Supabase transaction pooler (postgres-js pipelines them
    // onto shared connections); about 2 s in sequence is fine for this panel.
    const [goodRows, latestRows, rawRows, seriesRows, recordedRows, packRows, diagnosticRows] = await inSequence([
      () => run(sql`select ${SNAPSHOT_COLUMNS} from vendor_balance_snapshots s where s.error is null order by s.vendor, s.taken_at, s.id`),
      () => run(sql`select distinct on (s.vendor) ${SNAPSHOT_COLUMNS} from vendor_balance_snapshots s order by s.vendor, s.taken_at desc, s.id desc`),
      () => run(sql`select distinct on (s.vendor) s.vendor, s.raw from vendor_balance_snapshots s where s.error is null
        order by s.vendor, s.taken_at desc, s.id desc`),
      () => run(sql`select ${SNAPSHOT_COLUMNS} from vendor_balance_snapshots s
        where s.taken_at >= ${range.from}::timestamptz and s.taken_at < ${range.to}::timestamptz order by s.taken_at, s.id`),
      () => run(sql`with bounds as (
          select vendor, min(taken_at) as first_at, max(taken_at) as last_at
          from vendor_balance_snapshots where error is null group by vendor
        )
        select u.vendor, min(u.created_at) filter (where u.origin = 'captured') as "firstAt", coalesce(sum(${RECORDED_COST}), 0) as "allTime",
          coalesce(sum(${RECORDED_COST}) filter (where u.created_at >= b.first_at and u.created_at <= b.last_at), 0) as "sinceFirst"
        from usage_records u left join bounds b on b.vendor = u.vendor
        group by u.vendor`),
      () => run(RECONSTRUCTED_PACKS_QUERY),
      () => run(FACT_CHECK_DIAGNOSTICS_QUERY),
    ]);
    const reconstructed = reconstructedByVendor(
      packRows.map((row) => ({
        adapter: String(row.adapter),
        calls: toNumber(row.calls),
        fromAt: row.fromAt ? toIso(row.fromAt) : null,
        toAt: row.toAt ? toIso(row.toAt) : null,
      })),
      diagnosticRows.map((row) => ({ adapter: String(row.adapter), count: toNumber(row.count) })),
    );
    const vendors = BALANCE_VENDORS.map((vendor) => {
      const recorded = recordedRows.find((row) => row.vendor === vendor);
      const latestRow = latestRows.find((row) => row.vendor === vendor);
      return vendorBilling({
        vendor,
        notConfigured: notConfigured.get(vendor) ?? null,
        good: goodRows.filter((row) => row.vendor === vendor).map((row) => {
          const { error: _error, ...numbers } = toSnapshot(row);
          return numbers;
        }),
        latest: latestRow ? toSnapshot(latestRow) : null,
        latestGoodRaw: rawRows.find((row) => row.vendor === vendor)?.raw ?? null,
        series: seriesRows.filter((row) => row.vendor === vendor).map(toSnapshot),
        recordedSinceFirstUsd: toNumber(recorded?.sinceFirst),
        recordedAllTimeUsd: toNumber(recorded?.allTime),
        reconstructed: reconstructed[vendor],
        operatorStartingUsd: OPERATOR_STARTING_BALANCES[vendor],
      });
    });
    // The first captured Usage Record of any vendor (folded into the per-vendor sums rather than one more query);
    // backfilled rows describe calls from before recording started, so they don't move it.
    const firsts = recordedRows.filter((row) => row.firstAt != null).map((row) => toIso(row.firstAt)).sort();
    return { vendors, recordingStartedAt: firsts[0] ?? null, snapshotEveryMs };
  };

  /** Takes readings and logs what failed; never throws (runs from timers). */
  const scheduledSnapshots = async () => {
    try {
      for (const outcome of await takeSnapshots()) {
        if (outcome.status === "error") log?.error(`[billing.ts: scheduledSnapshots] Balance reading failed || vendor=${outcome.vendor} || ${outcome.error}`);
      }
    } catch (error) {
      log?.error(`[billing.ts: scheduledSnapshots] Readings failed || ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  let lastKeeperError: string | null = null;
  /** Keeps the Parallel token fresh for the other processes; logs a failure once until it changes. */
  const keepToken = async () => {
    if (!options.keeper) return;
    const state = await options.keeper.ensureFresh();
    const problem = state.status === "error" ? state.error : null;
    if (problem && problem !== lastKeeperError) log?.error(problem);
    lastKeeperError = problem;
  };

  return {
    billing,
    async refresh(range) {
      await takeSnapshots();
      return billing(range);
    },
    takeSnapshots,
    start(logger) {
      log = logger;
      void scheduledSnapshots().then(() => {
        const missing = [...notConfigured.entries()].map(([vendor, why]) => `${vendor}: ${why}`);
        if (missing.length) logger.info(`[billing.ts: start] Some balances are not read || ${missing.join(" || ")}`);
      });
      timers = [setInterval(() => void scheduledSnapshots(), snapshotEveryMs)];
      if (options.keeper) timers.push(setInterval(() => void keepToken(), TOKEN_CHECK_EVERY_MS));
    },
    stop() {
      for (const timer of timers) clearInterval(timer);
      timers = [];
    },
  };
}
