import pino, { type DestinationStream, type LevelWithSilent, type Logger, type LoggerOptions } from "pino";
import type { LogComponent } from "@senoy/db/logs";
import type { LogCorrelation, LogSink } from "./types.ts";

/**
 * The one logger setup the api and the worker share (ADR 0029). Every line goes to stdout as Pino JSON, as before;
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
  /** The process writing. Browser lines (`web`, `console`) never go through a logger; their routes push rows. */
  component: Extract<LogComponent, "api" | "worker">;
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
  // Stub (SEN-116): job 02 adds the correlation mixin, redaction, and the stream that feeds the sink. Until then this
  // is the plain stdout logger the processes had before.
  const settings: LoggerOptions = {
    name: options.component,
    level: options.stdoutLevel ?? process.env.LOG_LEVEL ?? "info",
    serializers: options.serializers,
  };
  return options.stdout ? pino(settings, options.stdout) : pino(settings);
}
