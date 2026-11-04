import type { LogSink } from "@senoy/logging";

/**
 * The Usage Console's own browser errors (ADR 0029). Its screens send a `ClientLogBatch` to `POST /api/ops/client-logs`
 * on the console's server, never to the api: the api would need CORS and a sign-in rule the console does not have.
 * The route in `app.ts` refuses writes that did not come from this machine, then hands the body here.
 */

/** How many events of one batch were queued and how many were dropped (invalid, over a cap). */
export type ClientLogAcceptResult = { accepted: number; dropped: number };

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
 * The ingest for the console's own screens.
 * @param options - The sink and the clock
 * @returns The ingest
 */
export function createConsoleClientLogIngest(options: ClientLogIngestOptions): ClientLogIngest {
  // Stub (SEN-116): job 03 validates, caps, and pushes each event to `options.sink`.
  void options;
  return {
    accept() {
      return { accepted: 0, dropped: 0 };
    },
  };
}
