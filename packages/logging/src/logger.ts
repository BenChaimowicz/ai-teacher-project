import pino, { type DestinationStream, type LevelWithSilent, type Logger, type LoggerOptions, type StreamEntry } from "pino";
import { logLevelOf, type LogComponent } from "@senoy/db/logs";
import { pinoRedactPaths, REDACTED } from "./redact.ts";
import type { LogCorrelation, LogSink } from "./types.ts";

/**
 * The one logger setup the api, the worker and the Usage Console's server share (ADR 0029). Every line goes to stdout as Pino JSON, as before;
 * lines at `info` and above also go to the sink as Log Entries, carrying the component and the ids of the code running
 * now. `debug` and `trace` reach stdout only, and only when `LOG_LEVEL` asks for them.
 */

/**
 * Messages Fastify writes for every request. They stay on stdout but are never stored: `api_requests` already records
 * every request (one source of truth).
 */
export const UNSTORED_MESSAGES = ["incoming request", "request completed"] as const;

/** How one process's logger is set up. */
export type CreateLoggerOptions = {
  /**
   * The process writing: the api, the worker, or the Usage Console's server. Lines from the browsers (`web`, and the
   * console's screens) never go through a logger; their routes push rows.
   */
  component: Extract<LogComponent, "api" | "worker" | "console">;
  /** Where Log Entries go; without one the logger writes stdout only (unit tests, scripts). */
  sink?: LogSink;
  /**
   * The ids of the code running now, read on every line (from the AsyncLocalStorage context). Its fields go onto the
   * line as `requestId`, `jobId`, `courseRequestId`, `learnerId` and `pipelineEventId`.
   */
  context?: () => LogCorrelation | undefined;
  /** The lowest level written to stdout; defaults to `LOG_LEVEL`, else `info`. The sink takes `info` and above whatever this is. */
  stdoutLevel?: LevelWithSilent;
  /** Where stdout lines go; defaults to file descriptor 1 (tests pass a stream). */
  stdout?: DestinationStream;
  /** Pino serializers, such as the api's request serializer that drops the sign-in token from email-link URLs. */
  serializers?: LoggerOptions["serializers"];
};

/**
 * Builds the process's Pino logger. Pass it to Fastify as `loggerInstance`. Logging through it never throws into, or
 * waits inside, the caller: the sink only queues.
 * @param options - Component, sink, correlation context, stdout level and stream, serializers
 * @returns The logger
 */
export function createLogger(options: CreateLoggerOptions): Logger {
  const stdoutLevel = options.stdoutLevel ?? levelFromEnv(process.env.LOG_LEVEL) ?? "info";
  const streams: StreamEntry<LevelWithSilent>[] = [];
  if (stdoutLevel !== "silent") streams.push({ level: stdoutLevel, stream: options.stdout ?? pino.destination(1) });
  if (options.sink) streams.push({ level: "info", stream: storeStream(options.component, options.sink) });
  // The logger lets through what the most talkative stream takes; each stream then keeps only its own levels.
  const level = streams.length === 0 ? "silent"
    : streams.reduce((lowest, entry) => (pino.levels.values[entry.level as string]! < pino.levels.values[lowest]! ? entry.level as string : lowest), "fatal");
  const settings: LoggerOptions = {
    name: options.component,
    level,
    serializers: options.serializers,
    redact: { paths: pinoRedactPaths(), censor: REDACTED },
    mixin: options.context ? correlationMixin(options.context) : undefined,
  };
  return pino(settings, pino.multistream(streams, { dedupe: false }));
}

/**
 * `LOG_LEVEL` when it names a Pino level; anything else is ignored, so a typo never stops a process from starting.
 * @param value - `LOG_LEVEL`
 */
function levelFromEnv(value: string | undefined): LevelWithSilent | undefined {
  const level = value?.trim().toLowerCase();
  return level && (level === "silent" || level in pino.levels.values) ? level as LevelWithSilent : undefined;
}

/** The line fields the correlation ids go to, by `LogCorrelation` key (the same names). */
const CORRELATION_FIELDS = ["requestId", "jobId", "courseRequestId", "learnerId", "pipelineEventId"] as const;

/**
 * The Pino `mixin` that puts the ids of the code running now on every line. A field the logger is already bound to
 * (Fastify binds `requestId` on each request's child logger) is left out, so a line never carries it twice.
 * @param context - Reads the ids of the code running now
 */
function correlationMixin(context: () => LogCorrelation | undefined): NonNullable<LoggerOptions["mixin"]> {
  return (_mergeObject, _level, logger) => {
    try {
      const ids = context();
      if (!ids) return {};
      const bound = String((logger as unknown as Record<symbol, unknown>)[pino.symbols.chindingsSym] ?? "");
      const fields: Record<string, string> = {};
      for (const field of CORRELATION_FIELDS) {
        const value = ids[field];
        if (value && !bound.includes(`"${field}":`)) fields[field] = value;
      }
      return fields;
    } catch {
      // A broken context only costs the ids on this line.
      return {};
    }
  };
}

/** Pino's own fields, which a row stores elsewhere or not at all. */
const PINO_FIELDS = new Set(["time", "level", "msg", "pid", "v"]);

/** Line fields that become the row's id columns, by line field. Fastify's default `reqId` counts as the request id. */
const ID_COLUMNS = {
  requestId: "requestId",
  reqId: "requestId",
  jobId: "generationJobId",
  courseRequestId: "courseRequestId",
  learnerId: "learnerId",
  pipelineEventId: "pipelineEventId",
} as const;

/** The messages never stored, as a set. */
const UNSTORED: ReadonlySet<string> = new Set(UNSTORED_MESSAGES);

/**
 * The Pino stream that turns each line at `info` and above into a Log Entry row and pushes it to the sink. A line it
 * cannot read is skipped (stdout still has it). Never throws.
 * @param component - The process writing
 * @param sink - Where rows go
 */
function storeStream(component: CreateLoggerOptions["component"], sink: LogSink): DestinationStream {
  return {
    write(line: string) {
      try {
        const parsed: unknown = JSON.parse(line);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
        const fields = parsed as Record<string, unknown>;
        const level = typeof fields.level === "number" ? logLevelOf(fields.level) : null;
        if (!level) return;
        const msg = typeof fields.msg === "string" ? fields.msg : "";
        if (UNSTORED.has(msg)) return;
        const ids = { requestId: null, generationJobId: null, courseRequestId: null, learnerId: null, pipelineEventId: null } as Record<string, string | null>;
        const context: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(fields)) {
          if (PINO_FIELDS.has(key)) continue;
          const column = ID_COLUMNS[key as keyof typeof ID_COLUMNS];
          if (column) {
            // `requestId` wins over Fastify's `reqId` when a line has both.
            if (ids[column] === null || key !== "reqId") ids[column] = value === null || value === undefined ? null : value as string;
            continue;
          }
          context[key] = value;
        }
        const err = fields.err as { message?: unknown } | undefined;
        const message = msg !== "" ? msg : typeof err?.message === "string" && err.message !== "" ? err.message : "(no message)";
        sink.push({
          loggedAt: typeof fields.time === "number" ? new Date(fields.time) : new Date(),
          component,
          level,
          message,
          context: Object.keys(context).length ? context : null,
          requestId: ids.requestId ?? null,
          generationJobId: ids.generationJobId ?? null,
          courseRequestId: ids.courseRequestId ?? null,
          learnerId: ids.learnerId ?? null,
          pipelineEventId: ids.pipelineEventId ?? null,
        });
      } catch {
        // An unreadable line stays on stdout only.
      }
    },
  };
}
