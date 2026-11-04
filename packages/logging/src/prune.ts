import type { Database } from "@senoy/db";

/**
 * Retention (ADR 0029): Log Entries are kept `LOG_RETENTION_DAYS` by level (`info` 7 days, `warn` and above 30 days).
 * The worker prunes on a timer, in batches, so no delete holds a lock for long. Every worker on the shared database
 * prunes; `for update skip locked` keeps two of them from fighting over the same rows, and deleting is idempotent.
 */

/** When the worker prunes: shortly after it starts, then every hour. */
export const PRUNE_SCHEDULE = {
  /** Delay before the first prune after the worker starts, so startup is not slowed. */
  firstRunDelayMs: 60_000,
  /** Time between prunes. */
  intervalMs: 3_600_000,
} as const;

/** How much one prune deletes. */
export const PRUNE_DEFAULTS = {
  /** Rows per delete statement. */
  batchSize: 5_000,
  /** Delete statements per level group per prune; the rest waits for the next hour. */
  maxBatches: 20,
} as const;

/** Prune settings; any left out take `PRUNE_DEFAULTS`, and `now` the wall clock. */
export type PruneOptions = { now?: Date; batchSize?: number; maxBatches?: number };

/** How many rows one prune deleted. */
export type PruneResult = { info: number; warnAndAbove: number };

/**
 * Deletes Log Entries past their retention: `info` rows older than 7 days, then `warn`, `error` and `fatal` rows older
 * than 30 days, each in batches of `batchSize` until a batch comes back short or `maxBatches` ran.
 * @param db - Drizzle client
 * @param options - Clock and batch sizes
 * @returns How many rows were deleted, by level group
 * @throws Error when a delete fails; the worker's timer logs it as a `warn` and tries again next hour
 */
export async function pruneLogEntries(db: Database, options: PruneOptions = {}): Promise<PruneResult> {
  // Stub (SEN-116): job 02.
  void db;
  void options;
  return { info: 0, warnAndAbove: 0 };
}
