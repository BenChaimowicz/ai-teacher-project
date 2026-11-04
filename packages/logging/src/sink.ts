import { logEntries, type Database } from "@senoy/db";
import type { BatchedLogSink, LogEntryRow, LogWriter } from "./types.ts";

/**
 * The batched, non-blocking sink every process writes its Log Entries through (ADR 0029). `push` only queues; a timer
 * writes the queue in batches, one insert at a time, on a connection the process keeps for logs alone. A failed or hung
 * write is reported to stderr (never back into the logger, so it cannot loop) and its rows are dropped and counted.
 */

/** How the sink batches. */
export const LOG_SINK_DEFAULTS = {
  /** How often queued rows are written. */
  flushIntervalMs: 1_000,
  /** Rows per insert; a full batch is written at once, without waiting for the timer. */
  batchSize: 200,
  /** Rows the sink holds at most; a row pushed while it is full is dropped and counted. */
  maxBuffered: 5_000,
  /** A write not settled after this long counts as failed, and its rows are dropped; the next batch goes on. */
  writeTimeoutMs: 10_000,
  /** `close` waits at most this long for the last write. */
  closeTimeoutMs: 2_000,
} as const;

/** Sink settings; any left out take `LOG_SINK_DEFAULTS`. */
export type LogSinkOptions = { -readonly [K in keyof typeof LOG_SINK_DEFAULTS]: number } & {
  /** Where the sink reports its own failures and drops, one line each; defaults to `process.stderr`. */
  report: (line: string) => void;
};

/**
 * A sink that queues rows until `start` gives it a writer, then writes them in batches. After a run of drops it stores
 * one `warn` row saying how many rows it dropped and why.
 * @param options - Batching numbers and the failure reporter
 * @returns The sink
 */
export function createBatchedLogSink(options: Partial<LogSinkOptions> = {}): BatchedLogSink {
  // Stub (SEN-116): job 02 implements batching. Until then every row is dropped, so nothing is stored.
  void options;
  return {
    push() {},
    start() {},
    async flush() {},
    async close() {},
  };
}

/**
 * The writer that inserts a batch into `log_entries` with one multi-row insert. Give it a Drizzle client of its own
 * (`createDb(url, { max: 1 })`), so log writes never queue behind, or pipeline onto, the process's own queries.
 * @param db - Drizzle client kept for log writes
 * @returns The writer
 */
export function drizzleLogWriter(db: Database): LogWriter {
  return async (rows: LogEntryRow[]) => {
    if (rows.length === 0) return;
    try {
      await db.insert(logEntries).values(rows);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[sink.ts: drizzleLogWriter] Failed to insert Log Entries || rows=${rows.length} || ${message}`);
    }
  };
}
