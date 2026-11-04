import { logEntries, type Database } from "@senoy/db";
import { hasStorableEnums, toStorableRow } from "./redact.ts";
import type { BatchedLogSink, LogComponent, LogEntryRow, LogWriter } from "./types.ts";

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
  const settings: LogSinkOptions = { ...LOG_SINK_DEFAULTS, report: reportToStderr, ...options };
  let buffer: LogEntryRow[] = [];
  let write: LogWriter | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  /** The drain running now; there is never more than one, so never two inserts in flight. */
  let draining: Promise<void> | null = null;
  /** Rows dropped since the last notice, by component and reason. */
  const dropped = new Map<string, { component: LogComponent; reason: DropReason; count: number }>();

  /**
   * Reports one line, swallowing a reporter that throws.
   * @param line - The line
   */
  function report(line: string) {
    try {
      settings.report(line);
    } catch {
      // The reporter is the last resort; nothing is left to tell.
    }
  }

  /**
   * Counts rows dropped for one reason. The first drop of a run is reported; the rest wait for the notice row.
   * @param rows - The components of the dropped rows
   * @param reason - Why they were dropped
   */
  function drop(rows: Pick<LogEntryRow, "component">[], reason: DropReason) {
    for (const { component } of rows) {
      const key = `${component}|${reason}`;
      const counted = dropped.get(key);
      if (counted) counted.count += 1;
      else dropped.set(key, { component, reason, count: 1 });
    }
  }

  /** Queues one notice row per component and reason with drops since the last notice, and resets the counts. */
  function queueDropNotices() {
    for (const { component, reason, count } of dropped.values()) {
      if (!hasStorableEnums({ component, level: "warn" })) continue;
      buffer.push(toStorableRow({
        loggedAt: new Date(), component, level: "warn", message: `Dropped ${count} Log Entries || reason=${reason}`, context: { droppedBy: "log sink" },
        requestId: null, generationJobId: null, courseRequestId: null, learnerId: null, pipelineEventId: null,
      }));
    }
    dropped.clear();
  }

  /**
   * Writes one batch, guarded: a rejected or hung write drops its rows and is reported, and never rejects here.
   * @param writer - The writer
   * @param batch - The rows
   * @returns Whether the batch was stored
   */
  async function writeBatch(writer: LogWriter, batch: LogEntryRow[]): Promise<boolean> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<"timed out">((resolve) => {
      // Not unref'ed: while a write is pending, its timeout is what settles the flush someone may be awaiting.
      timeout = setTimeout(() => resolve("timed out"), settings.writeTimeoutMs);
    });
    // A writer that throws at once is a rejection too; a late rejection after a timeout is swallowed.
    const writing = Promise.resolve().then(() => writer(batch)).then(() => "written" as const);
    writing.catch(() => {});
    try {
      const outcome = await Promise.race([writing, timedOut]);
      if (outcome === "written") return true;
      drop(batch, "write timed out");
      report(`[sink.ts: writeBatch] A Log Entry write did not settle in time; its rows were dropped || rows=${batch.length} || writeTimeoutMs=${settings.writeTimeoutMs}`);
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      drop(batch, "write failed");
      report(`[sink.ts: writeBatch] A Log Entry write failed; its rows were dropped || rows=${batch.length} || ${message}`);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Writes every queued row, one batch at a time, and the drop notices after a successful write. Joins the drain
   * already running, if any, and drains again after it for rows queued meanwhile.
   */
  function drain(): Promise<void> {
    if (draining) return draining.then(() => drain());
    const writer = write;
    if (!writer || buffer.length === 0) return Promise.resolve();
    draining = (async () => {
      try {
        while (buffer.length > 0) {
          const batch = buffer.splice(0, settings.batchSize);
          const stored = await writeBatch(writer, batch);
          if (stored && dropped.size > 0) queueDropNotices();
        }
      } catch (error) {
        // Unreachable: writeBatch never rejects. Kept so a drain can never reject into flush or the timer.
        const message = error instanceof Error ? error.message : String(error);
        report(`[sink.ts: drain] Writing Log Entries stopped || ${message}`);
      } finally {
        draining = null;
      }
    })();
    return draining;
  }

  return {
    push(row) {
      try {
        if (!hasStorableEnums(row)) {
          drop([row], "invalid component or level");
          report(`[sink.ts: push] A Log Entry with an unknown component or level was dropped || component=${String(row.component)} || level=${String(row.level)}`);
          return;
        }
        if (buffer.length >= settings.maxBuffered) {
          if (!dropped.size) report(`[sink.ts: push] The Log Entry buffer is full; rows are dropped until it drains || maxBuffered=${settings.maxBuffered}`);
          drop([row], "buffer full");
          return;
        }
        buffer.push(toStorableRow(row));
        if (write && !draining && buffer.length >= settings.batchSize) void drain();
      } catch {
        // push never throws into the code that logged.
      }
    },
    start(writer) {
      write = writer;
      if (!timer) {
        // A tick while a write is still running waits for the next one; the running drain picks up new rows anyway.
        timer = setInterval(() => {
          if (!draining) void drain();
        }, settings.flushIntervalMs);
        timer.unref?.();
      }
      if (buffer.length >= settings.batchSize) void drain();
    },
    flush() {
      return drain().catch(() => {});
    },
    async close() {
      if (timer) clearInterval(timer);
      timer = null;
      let wait: ReturnType<typeof setTimeout> | undefined;
      const gaveUp = new Promise<void>((resolve) => {
        wait = setTimeout(resolve, settings.closeTimeoutMs);
      });
      try {
        await Promise.race([drain().catch(() => {}), gaveUp]);
      } finally {
        clearTimeout(wait);
      }
    },
  };
}

/** Why the sink dropped rows; the notice row names it. */
type DropReason = "buffer full" | "write failed" | "write timed out" | "invalid component or level";

/**
 * The default reporter: one line on stderr, never through Pino, so a failing sink cannot log into itself.
 * @param line - The line
 */
function reportToStderr(line: string) {
  process.stderr.write(`${line}\n`);
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
