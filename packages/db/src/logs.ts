/**
 * Log Entry vocabulary (CONTEXT.md: Log Entry, Request id, Component; ADR 0029): the enum values the schema stores, the
 * size and retention limits every writer keeps to, the browser's client-log batch, and the Usage Console's
 * `GET /api/ops/logs` shapes. Pure: no Drizzle, no Node, so the web app and the Usage Console's screens import it too
 * (`@senoy/db/logs`).
 */

/**
 * Which part of the platform wrote a Log Entry. `web` is the Learner's browser, sent through the API; `console` is the
 * Usage Console's own screens, sent through the console's own server.
 */
export const LOG_COMPONENTS = ["api", "worker", "web", "console"] as const;

/** One Log Entry component. */
export type LogComponent = (typeof LOG_COMPONENTS)[number];

/**
 * The levels a Log Entry may have, least serious first. Postgres orders an enum by this list, so `level >= 'warn'`
 * means warn, error and fatal. `debug` and `trace` are never stored: they go to the process output only.
 */
export const LOG_LEVELS = ["info", "warn", "error", "fatal"] as const;

/** One stored log level. */
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Pino's number for each stored level. A line below `info` (30) is never stored. */
export const PINO_LEVEL_NUMBERS: Record<LogLevel, number> = { info: 30, warn: 40, error: 50, fatal: 60 };

/**
 * The stored level for a Pino level number: the highest stored level at or below it.
 * @param pinoLevel - Pino's level number, such as 30 for `info`
 * @returns The level, or null for a line below `info` (`debug`, `trace`), which is never stored
 */
export function logLevelOf(pinoLevel: number): LogLevel | null {
  let found: LogLevel | null = null;
  for (const level of LOG_LEVELS) {
    if (pinoLevel >= PINO_LEVEL_NUMBERS[level]) found = level;
  }
  return found;
}

/** Longest stored message, in UTF-8 bytes; a longer one is cut and ends with `TRUNCATION_MARKER`. */
export const LOG_MESSAGE_MAX_BYTES = 2_048;

/** Largest stored context, as UTF-8 bytes of its JSON; a larger one is replaced by a `TruncatedContext`. */
export const LOG_CONTEXT_MAX_BYTES = 8_192;

/** Ends a message that was cut to `LOG_MESSAGE_MAX_BYTES`. */
export const TRUNCATION_MARKER = "…[truncated]";

/** What a context too large to store becomes: the start of its JSON text, and how big it was. */
export type TruncatedContext = { truncated: true; originalBytes: number; preview: string };

/** How many days a Log Entry is kept, by level. The worker deletes older rows every hour, in batches. */
export const LOG_RETENTION_DAYS: Record<LogLevel, number> = { info: 7, warn: 30, error: 30, fatal: 30 };

// ---------------------------------------------------------------------------------------------------------------------
// Client logs: what the web app sends to `POST /api/client-logs`, and the Usage Console's screens to
// `POST /api/ops/client-logs`. Both servers validate it, cap it and set the component themselves.
// ---------------------------------------------------------------------------------------------------------------------

/**
 * What happened in the browser. `uncaught_error`: a `window` `error` event. `unhandled_rejection`: a promise rejected
 * with no handler. `error_boundary`: a React error boundary caught a render error. `api_failure`: an API call answered
 * 500 or more, or never got an answer (status 0).
 */
export const CLIENT_LOG_KINDS = ["uncaught_error", "unhandled_rejection", "error_boundary", "api_failure"] as const;

/** One client log kind. */
export type ClientLogKind = (typeof CLIENT_LOG_KINDS)[number];

/** The failed API call behind an `api_failure`. */
export type ClientLogApiCall = {
  /** `GET`, `POST`, … */
  method: string;
  /** The path only, such as `/api/course-requests/…`; never the query string. */
  path: string;
  /** The reply's status; 0 when no reply came (a network error or an abort by the browser). */
  status: number;
  /** The reply's `x-request-id` header, when there was a reply. Stored as the Log Entry's request id. */
  requestId: string | null;
};

/** One browser event in a client-log batch. */
export type ClientLogEvent = {
  kind: ClientLogKind;
  /** The error's message. */
  message: string;
  /** When the browser saw it (ISO). Kept in the context as `clientTime`; the Log Entry's time is when the server got it. */
  time: string;
  /** `location.pathname` when it happened; never the query string or hash. */
  page: string;
  /** The error's stack, if any. */
  stack?: string | null;
  /** React's component stack, for an `error_boundary`. */
  componentStack?: string | null;
  /** The failed call, for an `api_failure`. */
  api?: ClientLogApiCall | null;
  /** How many identical events (same kind and message) this one stands for; 1 when absent. */
  count?: number;
};

/** The body of `POST /api/client-logs` and `POST /api/ops/client-logs`. */
export type ClientLogBatch = { events: ClientLogEvent[] };

/** Limits both client-log routes, and the browser code that feeds them, keep to. */
export const CLIENT_LOG_LIMITS = {
  /** Largest request body a client-log route accepts; Fastify answers 413 beyond it. Also the browser's keepalive cap. */
  maxBodyBytes: 65_536,
  /** Events beyond this many in one batch are dropped by the server; the browser never sends more. */
  maxEventsPerBatch: 20,
  /**
   * Longest stack kept, in UTF-8 bytes. With the component stack and the user agent, a stored client event's context
   * stays under 4 KB (ADR 0029, decided 2026-11-04).
   */
  maxStackBytes: 2_048,
  /** Longest React component stack kept, in UTF-8 bytes. */
  maxComponentStackBytes: 1_472,
  /** Longest page path and failed-call path kept, in UTF-8 bytes. */
  maxPathBytes: 128,
  /** Longest `User-Agent` kept, in characters. */
  maxUserAgentChars: 128,
  /** Events one page load sends at most; the browser drops the rest. */
  maxEventsPerPageLoad: 50,
  /** The browser waits this long after the first queued event before sending, so a burst goes as one batch. */
  flushDelayMs: 2_000,
  /** Batches `POST /api/client-logs` accepts per client IP per minute; it answers 429 beyond it. */
  apiBatchesPerIpPerMinute: 12,
  /** Web events the API stores per minute across every client; the rest are dropped and counted. */
  apiEventsPerMinute: 60,
  /**
   * Web events one API process stores per UTC day across every client; the rest are dropped and counted. With the
   * 4 KB context it bounds web rows to a few MB a day, whoever posts them (ADR 0029, decided 2026-11-04).
   */
  apiEventsPerDay: 500,
  /** Console events the console's server stores per minute; the rest are dropped and counted. */
  consoleEventsPerMinute: 120,
} as const;

/**
 * The stored level of a browser event, set by the server, never by the browser. A failed call that got no reply is a
 * `warn` (often the Learner's own connection); everything else is an `error`.
 * @param event - The event's kind and failed call
 * @returns `warn` or `error`
 */
export function clientLogLevel(event: Pick<ClientLogEvent, "kind" | "api">): Extract<LogLevel, "warn" | "error"> {
  return event.kind === "api_failure" && (event.api?.status ?? 0) === 0 ? "warn" : "error";
}

// ---------------------------------------------------------------------------------------------------------------------
// `GET /api/ops/logs` (Usage Console). Newest first; times are ISO strings.
// ---------------------------------------------------------------------------------------------------------------------

/** `GET /api/ops/logs` query. Every filter is optional; the range defaults to the last 7 days. */
export type OpsLogQuery = {
  from?: string;
  to?: string;
  component?: LogComponent;
  /** The minimum level: `warn` shows warn, error and fatal. */
  level?: LogLevel;
  requestId?: string;
  /** A Generation job's id: every run of it. */
  jobId?: string;
  courseRequestId?: string;
  learnerId?: string;
  /** A Pipeline Event's id: its own Log Entries and those of every step nested under it. */
  pipelineEventId?: string;
  /** Case-insensitive text the message contains, at most `LOG_SEARCH_MAX_LENGTH` characters. */
  q?: string;
  limit?: number;
  offset?: number;
};

/** Longest `q` the Logs view may search for. */
export const LOG_SEARCH_MAX_LENGTH = 200;

/** One Log Entry as the Logs view shows it. */
export type OpsLogEntryRow = {
  id: string;
  loggedAt: string;
  component: LogComponent;
  level: LogLevel;
  message: string;
  /** Everything else the line carried, redacted and capped; a `TruncatedContext` when it was too large. */
  context: Record<string, unknown> | null;
  requestId: string | null;
  /** The Generation job whose run wrote it (`log_entries.generation_job_id`). */
  jobId: string | null;
  courseRequestId: string | null;
  learnerId: string | null;
  pipelineEventId: string | null;
};
