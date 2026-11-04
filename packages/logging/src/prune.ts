import { sql, type SQL } from "drizzle-orm";
import { logEntries, type Database } from "@senoy/db";
import { LOG_RETENTION_DAYS } from "@senoy/db/logs";

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
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? PRUNE_DEFAULTS.batchSize;
  const maxBatches = options.maxBatches ?? PRUNE_DEFAULTS.maxBatches;
  // `warn`, `error` and `fatal` share one retention, so they are one group, matched by the enum's order.
  const info = await pruneGroup(db, "info", sql`${logEntries.level} = 'info'`, cutoff(now, LOG_RETENTION_DAYS.info), batchSize, maxBatches);
  const warnAndAbove = await pruneGroup(db, "warnAndAbove", sql`${logEntries.level} >= 'warn'`, cutoff(now, LOG_RETENTION_DAYS.warn), batchSize, maxBatches);
  return { info, warnAndAbove };
}

/**
 * The instant before which rows of a retention are deleted.
 * @param now - The clock
 * @param days - The retention in days
 */
function cutoff(now: Date, days: number) {
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Deletes one level group's expired rows in batches, until a batch comes back short or `maxBatches` ran.
 * @param db - Drizzle client
 * @param group - The group, for errors
 * @param level - Which rows of the table belong to the group
 * @param before - Rows logged before this are expired
 * @param batchSize - Rows per statement
 * @param maxBatches - Statements at most
 * @returns How many rows were deleted
 */
async function pruneGroup(db: Database, group: keyof PruneResult, level: SQL, before: Date, batchSize: number, maxBatches: number) {
  let deleted = 0;
  for (let batch = 0; batch < maxBatches; batch += 1) {
    let count: number;
    try {
      const rows = await db.execute<{ id: string }>(sql`
        delete from ${logEntries} where ${logEntries.id} in (
          select ${logEntries.id} from ${logEntries}
          where ${level} and ${logEntries.loggedAt} < ${before.toISOString()}::timestamptz
          limit ${batchSize}
          for update skip locked
        )
        returning ${logEntries.id}
      `);
      count = rows.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[prune.ts: pruneLogEntries] Failed to delete expired Log Entries || group=${group} || deleted=${deleted} || ${message}`);
    }
    deleted += count;
    if (count < batchSize) break;
  }
  return deleted;
}
