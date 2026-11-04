import type { LogComponent, LogLevel } from "@senoy/db/logs";

/**
 * The shapes every log writer shares (ADR 0029). A Log Entry row goes into a `LogSink`, which batches rows and hands
 * them to a `LogWriter` (one multi-row insert into `log_entries`). Nothing here may ever throw into, or wait inside, the
 * request or job that logged.
 */

/** The ids of the code running now. Every line logged under them carries them; absent or null means "not known here". */
export type LogCorrelation = {
  /** The API request being served, or the one that queued the Generation job being run. */
  requestId?: string | null;
  /** The Generation job whose run is logging. */
  jobId?: string | null;
  courseRequestId?: string | null;
  learnerId?: string | null;
  /** The innermost Pipeline Event running now. */
  pipelineEventId?: string | null;
};

/** One `log_entries` row as a writer hands it to the sink. The sink validates, redacts and caps it before it is stored. */
export type LogEntryRow = {
  loggedAt: Date;
  component: LogComponent;
  level: LogLevel;
  message: string;
  context: Record<string, unknown> | null;
  requestId: string | null;
  generationJobId: string | null;
  courseRequestId: string | null;
  learnerId: string | null;
  pipelineEventId: string | null;
};

/** Stores one batch of rows: one multi-row insert. May throw or hang; the sink guards every call. */
export type LogWriter = (rows: LogEntryRow[]) => Promise<void>;

/**
 * Where log rows go. Every process has exactly one, shared by its logger and, in the api and the Usage Console's
 * server, by its client-log route.
 */
export interface LogSink {
  /**
   * Queues one row. Synchronous, never throws, never waits. Before it is queued the row is made storable (ids that are
   * not UUIDs move into the context, secrets and emails are redacted, the message and context are capped). When the
   * buffer is full the row is dropped and counted.
   * @param row - The row
   */
  push(row: LogEntryRow): void;
  /**
   * Writes everything queued so far. Resolves when the write finished, failed, or timed out; never rejects.
   */
  flush(): Promise<void>;
  /** Stops the timer and flushes one last time, waiting at most the close timeout. Never rejects. */
  close(): Promise<void>;
}

/** A sink that buffers until it is given its writer, so a process can log before its database is ready. */
export interface BatchedLogSink extends LogSink {
  /**
   * Starts writing: rows queued so far, and every later one, go to `write` in batches.
   * @param write - The writer, normally `drizzleLogWriter` on a connection of its own
   */
  start(write: LogWriter): void;
}

export type { LogComponent, LogLevel };
