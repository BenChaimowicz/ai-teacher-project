import type { ClientLogEvent } from "@senoy/db/logs";

/**
 * The browser side of client logs (ADR 0029), shared by the web app and the Usage Console's screens: queues events,
 * collapses identical ones, and sends them as one `ClientLogBatch` with `fetch(…, { keepalive: true })` and a JSON body,
 * debounced by `CLIENT_LOG_LIMITS.flushDelayMs` and flushed when the page is hidden. It keeps to `CLIENT_LOG_LIMITS`, and
 * never reports its own failures, so it cannot loop. Imports nothing from Node: it is bundled into both browsers.
 */

/** How one app's shipper is set up. */
export type ClientLogShipperOptions = {
  /** `/api/client-logs` (web app) or `/api/ops/client-logs` (Usage Console). */
  endpoint: string;
  /** Injected for tests; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
};

/** A running shipper. */
export type ClientLogShipper = {
  /**
   * Queues one event; never throws. `time` and `page` are filled in when left out.
   * @param event - The event
   */
  report(event: Omit<ClientLogEvent, "time" | "page"> & Partial<Pick<ClientLogEvent, "time" | "page">>): void;
  /** Sends what is queued now; never throws. */
  flush(): void;
};

/**
 * Creates the shipper for one app.
 * @param options - Endpoint and fetch
 * @returns The shipper
 */
export function createClientLogShipper(options: ClientLogShipperOptions): ClientLogShipper {
  // Stub (SEN-116): job 03 implements it and may reshape this API; it owns every caller.
  void options;
  return { report() {}, flush() {} };
}
