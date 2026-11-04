import { CLIENT_LOG_LIMITS } from "@senoy/db/logs";
import type { LogSink } from "@senoy/logging";
import { acceptClientLogBatch, createClientLogMinuteCap, type ClientLogAcceptResult } from "@senoy/logging/client";

/**
 * The Usage Console's own browser errors (ADR 0029). Its screens send a `ClientLogBatch` to `POST /api/ops/client-logs`
 * on the console's server, never to the api: the api would need CORS and a sign-in rule the console does not have.
 * The route in `app.ts` refuses writes that did not come from this machine, then hands the body here.
 */

export type { ClientLogAcceptResult };

/** Takes one batch from the console's screens. */
export type ClientLogIngest = {
  /**
   * Validates and caps one batch (`CLIENT_LOG_LIMITS`), and pushes each valid event to the sink as component
   * `console`, with a level the server sets (`clientLogLevel`). Synchronous; never throws.
   * @param body - The parsed JSON body, unchecked
   * @returns What happened to the batch's events
   */
  accept(body: unknown): ClientLogAcceptResult;
};

/** What the ingest needs. */
export type ClientLogIngestOptions = {
  /** The console server's one Log Entry sink. */
  sink: LogSink;
  /** The current instant, injected for tests; defaults to the wall clock. */
  now?: () => Date;
};

/**
 * The ingest for the console's own screens: the same validation and rows as `POST /api/client-logs`, but component
 * `console`, no Learner, no user agent (the route hands over the body only), no per-IP limit (the route is loopback
 * only), and a process-wide cap of `consoleEventsPerMinute` stored events. Past the cap, events are dropped and, at
 * most once a minute, one `warn` row from component `console` says how many.
 * @param options - The sink and the clock
 * @returns The ingest
 */
export function createConsoleClientLogIngest(options: ClientLogIngestOptions): ClientLogIngest {
  const now = options.now ?? (() => new Date());
  const cap = createClientLogMinuteCap(CLIENT_LOG_LIMITS.consoleEventsPerMinute);
  return {
    accept(body) {
      try {
        const at = now();
        const result = acceptClientLogBatch(body, { sink: options.sink, component: "console", now: at, learnerId: null, cap });
        const dropped = cap.dropsToReport(at);
        if (dropped > 0) {
          options.sink.push({
            loggedAt: at,
            component: "console",
            level: "warn",
            message: `[client-logs: accept] Dropped ${dropped} console client log events || reason=over the per-minute cap`,
            context: null,
            requestId: null,
            generationJobId: null,
            courseRequestId: null,
            learnerId: null,
            pipelineEventId: null,
          });
        }
        return result;
      } catch {
        return { accepted: 0, dropped: 0 };
      }
    },
  };
}
