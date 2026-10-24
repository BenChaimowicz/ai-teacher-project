import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { BalanceReading } from "@senoy/research";
import {
  RECONSTRUCTED_PACKS_QUERY,
  billedSinceFirst,
  createBillingService,
  reconstructedByVendor,
  vendorBilling,
  type GoodReading,
  type VendorBillingInput,
  type VendorReader,
} from "./billing.ts";
import type { SqlRow } from "./format.ts";

const dialect = new PgDialect();
const NOW = new Date("2026-10-24T12:00:00.000Z");
const RANGE = { from: "2026-10-17T12:00:00.000Z", to: "2026-10-24T12:00:00.000Z" };

/**
 * A good reading with only the fields a test cares about.
 * @param takenAt - ISO instant
 * @param fields - Numbers to set
 */
function reading(takenAt: string, fields: Partial<GoodReading>): GoodReading {
  return { takenAt, balanceUsd: null, pendingUsd: null, creditsTotalUsd: null, accountUsageUsd: null, keyUsageUsd: null, ...fields };
}

/**
 * A billing input with defaults.
 * @param overrides - Fields to set
 */
function input(overrides: Partial<VendorBillingInput>): VendorBillingInput {
  return {
    vendor: "you", notConfigured: null, good: [], latest: null, latestGoodRaw: null, series: [],
    recordedSinceFirstUsd: 0, recordedAllTimeUsd: 0, reconstructed: null, ...overrides,
  };
}

describe("Billed since the first good reading", () => {
  it("is null until there are two good readings", () => {
    assert.equal(billedSinceFirst("you", []), null);
    assert.equal(billedSinceFirst("you", [reading("a", { balanceUsd: 10 })]), null);
  });

  it("sums the drops and skips a top-up", () => {
    const good = [
      reading("1", { balanceUsd: 10 }),
      reading("2", { balanceUsd: 9.5 }),
      reading("3", { balanceUsd: 29.5 }), // +$20 top-up
      reading("4", { balanceUsd: 29.2 }),
    ];
    assert.equal(billedSinceFirst("you", good), 0.8);
  });

  it("counts Parallel held funds with the balance, so a hold is not spend until it settles", () => {
    const good = [
      reading("1", { balanceUsd: 10, pendingUsd: 0 }),
      reading("2", { balanceUsd: 9.9, pendingUsd: 0.1 }),
      reading("3", { balanceUsd: 9.9, pendingUsd: 0 }),
    ];
    assert.equal(billedSinceFirst("parallel", good), 0.1);
  });

  it("prefers OpenRouter key usage, which top-ups do not move", () => {
    const good = [
      reading("1", { balanceUsd: 15, creditsTotalUsd: 50, accountUsageUsd: 35, keyUsageUsd: 30 }),
      reading("2", { balanceUsd: 64, creditsTotalUsd: 100, accountUsageUsd: 36, keyUsageUsd: 30.75 }),
    ];
    assert.equal(billedSinceFirst("openrouter", good), 0.75);
  });

  it("falls back to OpenRouter balance drops with credits bought added back", () => {
    const good = [
      reading("1", { balanceUsd: 15, creditsTotalUsd: 50 }),
      reading("2", { balanceUsd: 64, creditsTotalUsd: 100 }),
    ];
    assert.equal(billedSinceFirst("openrouter", good), 1);
  });
});

describe("One vendor's billing check", () => {
  const latest = { takenAt: "2", balanceUsd: 9.5, pendingUsd: null, creditsTotalUsd: null, accountUsageUsd: null, keyUsageUsd: null, error: null };

  it("has no gap with one good reading, and a gap of billed minus recorded with two", () => {
    const one = vendorBilling(input({ good: [reading("1", { balanceUsd: 10 })], latest, recordedSinceFirstUsd: 0 }));
    assert.equal(one.gapUsd, null);
    assert.equal(one.billedSinceFirstUsd, null);
    const two = vendorBilling(input({ good: [reading("1", { balanceUsd: 10 }), reading("2", { balanceUsd: 9.5 })], latest, recordedSinceFirstUsd: 0.35 }));
    assert.equal(two.billedSinceFirstUsd, 0.5);
    assert.equal(two.gapUsd, 0.15);
    assert.equal(two.status, "ok");
    assert.equal(two.firstGoodAt, "1");
    assert.equal(two.untrackedAccountUsd, null);
    assert.equal(two.keyWindows, null);
  });

  it("reports the latest failed reading as an error, and no reading at all as an error", () => {
    const failed = vendorBilling(input({ good: [reading("1", { balanceUsd: 10 })], latest: { ...latest, balanceUsd: null, error: "status=503" } }));
    assert.deepEqual([failed.status, failed.error, failed.firstGoodAt], ["error", "status=503", "1"]);
    const none = vendorBilling(input({}));
    assert.deepEqual([none.status, none.error], ["error", "No reading yet"]);
  });

  it("is not_configured when there are no credentials", () => {
    const parallel = vendorBilling(input({ vendor: "parallel", notConfigured: "Run pnpm parallel:login." }));
    assert.deepEqual([parallel.status, parallel.error], ["not_configured", "Run pnpm parallel:login."]);
  });

  it("works out OpenRouter's untracked spend and key windows; no reconstruction", () => {
    const row = vendorBilling(input({
      vendor: "openrouter",
      good: [reading("1", { balanceUsd: 15.05, creditsTotalUsd: 50, accountUsageUsd: 34.95, keyUsageUsd: 30 })],
      latest,
      latestGoodRaw: { key: { data: { usage_daily: 1.5, usage_weekly: 4, usage_monthly: 20, limit: 100, limit_remaining: 70 } } },
      recordedAllTimeUsd: 12.5,
      reconstructed: { calls: 1, estimatedUsd: 1, factCheckDiagnostics: 0, from: null, to: null },
    }));
    assert.equal(row.untrackedAccountUsd, 22.45);
    assert.equal(row.untrackedKeyUsd, 17.5);
    assert.deepEqual(row.keyWindows, { dailyUsd: 1.5, weeklyUsd: 4, monthlyUsd: 20, limitUsd: 100, remainingUsd: 70 });
    assert.equal(row.reconstructed, null);
    assert.deepEqual([row.startingUsd, row.startingSource], [50, "vendor"]);
  });

  it("uses an Operator-told starting balance for research vendors, counting Parallel's held funds as ours", () => {
    const you = vendorBilling(input({ vendor: "you", good: [reading("1", { balanceUsd: 88.35 })], latest, recordedAllTimeUsd: 0.45, operatorStartingUsd: 100 }));
    assert.deepEqual([you.startingUsd, you.startingSource, you.untrackedAccountUsd, you.untrackedKeyUsd], [100, "operator", 11.2, null]);
    const parallel = vendorBilling(input({ vendor: "parallel", good: [reading("1", { balanceUsd: 22.5, pendingUsd: 0.5 })], latest, operatorStartingUsd: 25 }));
    assert.equal(parallel.untrackedAccountUsd, 2);
    const unknown = vendorBilling(input({ vendor: "you", good: [reading("1", { balanceUsd: 88.35 })], latest }));
    assert.deepEqual([unknown.startingUsd, unknown.startingSource, unknown.untrackedAccountUsd], [null, null, null]);
  });
});

describe("Reconstructed research history", () => {
  it("prices timed-out packs at list price and counts fact-check diagnostics without pricing them", () => {
    const out = reconstructedByVendor(
      [
        { adapter: "parallel-pro", calls: 18, fromAt: "2026-10-19T08:00:00.000Z", toAt: "2026-10-22T10:00:00.000Z" },
        { adapter: "you-research", calls: 18, fromAt: "2026-10-19T08:00:01.000Z", toAt: "2026-10-22T10:00:01.000Z" },
        { adapter: "exa", calls: 3, fromAt: null, toAt: null },
      ],
      [{ adapter: "you-research", count: 10 }],
    );
    assert.deepEqual(out.parallel, { calls: 18, estimatedUsd: 1.8, factCheckDiagnostics: 0, from: "2026-10-19T08:00:00.000Z", to: "2026-10-22T10:00:00.000Z" });
    assert.deepEqual(out.you, { calls: 18, estimatedUsd: 0.9, factCheckDiagnostics: 10, from: "2026-10-19T08:00:01.000Z", to: "2026-10-22T10:00:01.000Z" });
  });

  it("counts timed-out packs, drops failed ones, and dedupes against recorded calls by vendor request id", () => {
    const { sql: text } = dialect.sqlToQuery(RECONSTRUCTED_PACKS_QUERY);
    // Only `error` packs are excluded, so `timed_out` packs are counted (and priced at list price above).
    assert.match(text, /packs\.status is distinct from 'error'/);
    assert.doesNotMatch(text, /timed_out/);
    assert.match(text, /not exists \(select 1 from usage_records u where u\.response_id = packs\.rid\)/);
    // A pack with no id only counts from before recording began.
    assert.match(text, /packs\.started < first_record\.at/);
    // Browser-test fixture packs say they answered but carry no price.
    assert.match(text, /not \(packs\.status in \('ok', 'empty_vendor', 'empty_filtered'\) and packs\.listed = 0\)/);
  });
});

/**
 * A SQL runner that keeps each rendered query and answers from `answer`.
 * @param answer - Rows for a rendered query
 */
function fakeRunner(answer: (text: string, params: unknown[]) => SqlRow[] = () => []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const run = async (query: SQL) => {
    const rendered = dialect.sqlToQuery(query);
    queries.push(rendered);
    return answer(rendered.sql, rendered.params);
  };
  return { run, queries };
}

/** A reading with a balance. */
const youReading: BalanceReading = { balanceUsd: 88.35, pendingUsd: null, creditsTotalUsd: null, accountUsageUsd: null, keyUsageUsd: null, keyWindows: null, raw: { data: { attributes: { balance: 8835 } } } };

describe("Taking snapshots", () => {
  const readers = (parallel: VendorReader): Record<"openrouter" | "you" | "parallel", VendorReader> => ({
    openrouter: async () => { throw new Error("[balances.ts: readOpenRouterBalance] Balance request was refused || status=500"); },
    you: async () => youReading,
    parallel,
  });

  it("stores a row per vendor, an error row on failure, and nothing for a vendor without credentials", async () => {
    const { run, queries } = fakeRunner();
    const service = createBillingService({ run, readers: readers(async () => "not_configured"), now: () => NOW });
    const outcomes = await service.takeSnapshots();
    assert.deepEqual(outcomes.map((o) => [o.vendor, o.status]), [["openrouter", "error"], ["you", "stored"], ["parallel", "not_configured"]]);
    const inserts = queries.filter((q) => q.sql.startsWith("insert into vendor_balance_snapshots"));
    assert.equal(inserts.length, 2);
    assert.ok(inserts.some((q) => q.params.includes("openrouter") && q.params.some((p) => String(p).includes("status=500"))));
    assert.ok(inserts.some((q) => q.params.includes("you") && q.params.includes(88.35)));
  });

  it("reports not_configured in the billing check, and shares one run between concurrent refreshes", async () => {
    let parallelReads = 0;
    const { run } = fakeRunner();
    const service = createBillingService({
      run,
      readers: readers(async () => {
        parallelReads += 1;
        return "not_configured";
      }),
      now: () => NOW,
    });
    const [a] = await Promise.all([service.refresh(RANGE), service.refresh(RANGE)]);
    assert.equal(parallelReads, 1);
    assert.deepEqual(a.vendors.map((v) => [v.vendor, v.status]), [["openrouter", "error"], ["you", "error"], ["parallel", "not_configured"]]);
    assert.equal(a.snapshotEveryMs, 15 * 60_000);
    assert.equal(a.recordingStartedAt, null);
  });

  it("builds every vendor from stored rows: latest reading, recorded sums, reconstruction, recording start", async () => {
    const { run } = fakeRunner((text) => {
      if (text.includes("lesson_research")) return [{ adapter: "you-research", calls: "4", fromAt: "2026-10-19 08:00:00+00", toAt: "2026-10-20 08:00:00+00" }];
      if (text.includes("starting_level_diagnostics")) return [];
      if (text.includes("\"sinceFirst\"")) {
        return [
          { vendor: "you", firstAt: "2026-10-23 09:00:00+00", allTime: "0.3", sinceFirst: "0.1" },
          { vendor: "openrouter", firstAt: "2026-10-23 08:00:00+00", allTime: "1", sinceFirst: "0" },
        ];
      }
      if (text.includes("s.raw")) return [];
      if (text.includes("where s.error is null order by")) {
        return [
          { vendor: "you", takenAt: "2026-10-24 10:00:00+00", balanceUsd: 88.5, error: null },
          { vendor: "you", takenAt: "2026-10-24 11:00:00+00", balanceUsd: 88.35, error: null },
        ];
      }
      if (text.includes("distinct on")) return [{ vendor: "you", takenAt: "2026-10-24 11:00:00+00", balanceUsd: 88.35, error: null }];
      return [];
    });
    const service = createBillingService({ run, readers: readers(async () => "not_configured") });
    const result = await service.billing(RANGE);
    assert.equal(result.recordingStartedAt, "2026-10-23T08:00:00.000Z");
    const you = result.vendors.find((v) => v.vendor === "you")!;
    assert.equal(you.status, "ok");
    assert.equal(you.latest?.balanceUsd, 88.35);
    assert.equal(you.billedSinceFirstUsd, 0.15);
    assert.equal(you.recordedSinceFirstUsd, 0.1);
    assert.equal(you.gapUsd, 0.05);
    assert.equal(you.recordedAllTimeUsd, 0.3);
    assert.deepEqual(you.reconstructed, { calls: 4, estimatedUsd: 0.2, factCheckDiagnostics: 0, from: "2026-10-19T08:00:00.000Z", to: "2026-10-20T08:00:00.000Z" });
  });
});
