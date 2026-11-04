import {
  CLIENT_LOG_KINDS,
  CLIENT_LOG_LIMITS,
  clientLogLevel,
  LOG_MESSAGE_MAX_BYTES,
  TRUNCATION_MARKER,
  type ClientLogApiCall,
  type ClientLogEvent,
  type ClientLogKind,
} from "@senoy/db/logs";
import type { LogEntryRow, LogSink } from "./types.ts";

/**
 * Client logs (ADR 0029), both ends of the wire, so the web app, the Usage Console's screens, the api and the console's
 * server share one copy:
 * - The browser side: `createClientLogShipper` queues events, collapses identical ones, and sends them as one
 *   `ClientLogBatch` with `fetch(…, { keepalive: true })` and a JSON body, debounced by `CLIENT_LOG_LIMITS.flushDelayMs`
 *   and flushed when the page is hidden. `installClientLogHandlers` hooks it to `window`. It never reports its own
 *   failures, so it cannot loop.
 * - The server side: `acceptClientLogBatch` validates and caps one batch and pushes one Log Entry row per kept event,
 *   with the component and level the server sets. `POST /api/client-logs` (component `web`) and the console's
 *   `POST /api/ops/client-logs` (component `console`) both call it.
 * Imports nothing from Node and no value from the server entry: it is bundled into both browsers.
 */

// ---------------------------------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------------------------------

/** A UUID in any version, as Postgres stores it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Encodes text as UTF-8 to measure it; one instance serves every call. */
const encoder = new TextEncoder();

/**
 * The size of a text in UTF-8 bytes.
 * @param text - Any text
 * @returns Its byte length
 */
function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

/**
 * Cuts a text to at most `maxBytes` UTF-8 bytes, ending it with `TRUNCATION_MARKER` when it was cut. Never splits a
 * character.
 * @param text - Any text
 * @param maxBytes - The most bytes kept, marker included
 * @returns The text, or its start plus the marker
 */
export function capUtf8(text: string, maxBytes: number): string {
  if (utf8Bytes(text) <= maxBytes) return text;
  const room = maxBytes - utf8Bytes(TRUNCATION_MARKER);
  let kept = "";
  let used = 0;
  for (const char of text) {
    const size = utf8Bytes(char);
    if (used + size > room) break;
    kept += char;
    used += size;
  }
  return kept + TRUNCATION_MARKER;
}

/**
 * A path without its query string or hash, so no token or email in a URL reaches a Log Entry.
 * @param path - A path, possibly with `?…` or `#…`
 * @returns The path alone
 */
export function pathOnly(path: string): string {
  const cut = path.search(/[?#]/);
  return cut === -1 ? path : path.slice(0, cut);
}

/**
 * The message and stack of anything thrown or rejected with. Never throws.
 * @param value - An `Error`, a string, or anything else
 * @returns A non-empty message, and the stack when there is one
 */
export function errorDetails(value: unknown): { message: string; stack: string | null } {
  try {
    if (value instanceof Error) {
      return { message: value.message || value.name || "(no message)", stack: typeof value.stack === "string" ? value.stack : null };
    }
    if (typeof value === "string") return { message: value || "(no message)", stack: null };
    const json = JSON.stringify(value);
    return { message: json && json !== "{}" ? json : String(value), stack: null };
  } catch {
    return { message: "(unreadable error)", stack: null };
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Browser side
// ---------------------------------------------------------------------------------------------------------------------

/** How one app's shipper is set up. */
export type ClientLogShipperOptions = {
  /** `/api/client-logs` (web app) or `/api/ops/client-logs` (Usage Console). */
  endpoint: string;
  /** Injected for tests; defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
};

/** What a caller reports. `time` and `page` are filled in when left out; `count` is the shipper's to set. */
export type ClientLogReport = Omit<ClientLogEvent, "time" | "page" | "count"> & Partial<Pick<ClientLogEvent, "time" | "page">>;

/** A running shipper. */
export type ClientLogShipper = {
  /**
   * Queues one event; never throws. An event with the same kind and message as a queued one raises that one's `count`
   * instead. Past `CLIENT_LOG_LIMITS.maxEventsPerPageLoad` new events are dropped.
   * @param event - The event
   */
  report(event: ClientLogReport): void;
  /** Sends what is queued now, in as many batches as the body limit needs; never throws, never waits. */
  flush(): void;
};

/** `{"events":[]}`: the bytes of a batch around its events. */
const BATCH_OVERHEAD_BYTES = utf8Bytes(JSON.stringify({ events: [] }));

/**
 * The page the browser is on, path only; empty outside a browser.
 * @returns `location.pathname`, or ""
 */
function currentPage(): string {
  const location = (globalThis as { location?: { pathname?: unknown } }).location;
  return typeof location?.pathname === "string" ? location.pathname : "";
}

/**
 * One event as it is sent: the message and stacks capped, the page and path stripped of query and hash, so one event
 * always fits a batch.
 * @param event - What the caller reported
 * @returns The event to queue
 */
function toSendable(event: ClientLogReport): ClientLogEvent {
  const message = capUtf8(typeof event.message === "string" && event.message ? event.message : "(no message)", LOG_MESSAGE_MAX_BYTES);
  const sendable: ClientLogEvent = {
    kind: event.kind,
    message,
    time: event.time ?? new Date().toISOString(),
    page: pathOnly(event.page ?? currentPage()),
  };
  if (typeof event.stack === "string") sendable.stack = capUtf8(event.stack, CLIENT_LOG_LIMITS.maxStackBytes);
  if (typeof event.componentStack === "string") {
    sendable.componentStack = capUtf8(event.componentStack, CLIENT_LOG_LIMITS.maxStackBytes);
  }
  if (event.api) sendable.api = { ...event.api, path: pathOnly(event.api.path) };
  return sendable;
}

/**
 * Creates the shipper for one app. Sends `flushDelayMs` after the first queued event, or at once when
 * `maxEventsPerBatch` are queued. Each send is `fetch(endpoint, { method: "POST", keepalive: true, credentials:
 * "same-origin" })` with a JSON body of at most `maxBodyBytes`; the reply is ignored and nothing is retried.
 * @param options - Endpoint and fetch
 * @returns The shipper
 */
export function createClientLogShipper(options: ClientLogShipperOptions): ClientLogShipper {
  const queue: ClientLogEvent[] = [];
  let queuedThisPageLoad = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** True while the shipper's own code runs, so an error it causes is never shipped. */
  let busy = false;

  /** Posts one batch; failures are swallowed, never reported. */
  function send(events: ClientLogEvent[]) {
    try {
      const post = options.fetch ?? globalThis.fetch;
      const sent = post(options.endpoint, {
        method: "POST",
        keepalive: true,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ events }),
      });
      void Promise.resolve(sent).catch(() => undefined);
    } catch {
      // A client log that cannot be sent is lost on purpose: reporting it could loop.
    }
  }

  /** Splits the queue into batches within the count and body limits, and sends each. */
  function sendQueued() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    while (queue.length > 0) {
      const batch: ClientLogEvent[] = [];
      let bytes = BATCH_OVERHEAD_BYTES;
      while (queue.length > 0 && batch.length < CLIENT_LOG_LIMITS.maxEventsPerBatch) {
        const size = utf8Bytes(JSON.stringify(queue[0])) + (batch.length > 0 ? 1 : 0);
        if (bytes + size > CLIENT_LOG_LIMITS.maxBodyBytes) {
          // An event too large even for an empty batch can never be sent; drop it rather than block the rest.
          if (batch.length === 0) queue.shift();
          break;
        }
        batch.push(queue.shift()!);
        bytes += size;
      }
      if (batch.length > 0) send(batch);
    }
  }

  /** Sends what is queued now, unless the shipper's own code is already running. */
  function flush() {
    if (busy) return;
    busy = true;
    try {
      sendQueued();
    } catch {
      // Never throws into the page.
    } finally {
      busy = false;
    }
  }

  /** Queues one event, collapsing it into a queued twin; see `ClientLogShipper.report`. */
  function report(event: ClientLogReport) {
    if (busy) return;
    busy = true;
    try {
      if (!event || !CLIENT_LOG_KINDS.includes(event.kind)) return;
      const sendable = toSendable(event);
      const same = queue.find((queued) => queued.kind === sendable.kind && queued.message === sendable.message);
      if (same) {
        same.count = (same.count ?? 1) + 1;
        return;
      }
      if (queuedThisPageLoad >= CLIENT_LOG_LIMITS.maxEventsPerPageLoad) return;
      queuedThisPageLoad += 1;
      queue.push(sendable);
      if (queue.length >= CLIENT_LOG_LIMITS.maxEventsPerBatch) sendQueued();
      else if (timer === null) timer = setTimeout(flush, CLIENT_LOG_LIMITS.flushDelayMs);
    } catch {
      // Never throws into the page.
    } finally {
      busy = false;
    }
  }

  return { report, flush };
}

/** The part of `window` the handlers listen on. `document` carries `visibilitychange`. */
export type ClientLogTarget = EventTarget & { document?: EventTarget & { visibilityState?: string } };

/**
 * Reports `window` `error` events (`uncaught_error`) and `unhandledrejection` events (`unhandled_rejection`), and
 * flushes on `pagehide` and when the page turns hidden. Call once per page load, before the app renders.
 * @param shipper - The app's shipper
 * @param target - `window`; tests pass a stand-in
 * @returns A function that removes every handler
 */
export function installClientLogHandlers(shipper: ClientLogShipper, target: ClientLogTarget = globalThis as unknown as ClientLogTarget): () => void {
  const document = target.document;

  /** A script error that reached `window`. */
  const onError = (event: Event) => {
    const { message: eventMessage, error } = event as Event & { message?: unknown; error?: unknown };
    const details = error === undefined || error === null ? errorDetails(eventMessage) : errorDetails(error);
    shipper.report({ kind: "uncaught_error", message: details.message, stack: details.stack });
  };
  /** A promise rejected with no handler. */
  const onRejection = (event: Event) => {
    const details = errorDetails((event as Event & { reason?: unknown }).reason);
    shipper.report({ kind: "unhandled_rejection", message: details.message, stack: details.stack });
  };
  /** The page is going away: send what is queued while `keepalive` can still carry it. */
  const onPageHide = () => shipper.flush();
  /** The tab was hidden; it may never come back, so send now. */
  const onVisibilityChange = () => {
    if (document?.visibilityState === "hidden") shipper.flush();
  };

  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  target.addEventListener("pagehide", onPageHide);
  document?.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
    target.removeEventListener("pagehide", onPageHide);
    document?.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Server side
// ---------------------------------------------------------------------------------------------------------------------

/** A fixed one-minute window shared by every caller of one route: how many events it still stores this minute. */
export type ClientLogMinuteCap = {
  /**
   * Takes one place in the current minute.
   * @param now - The current instant
   * @returns False when the minute's cap is used up; the event is then dropped and counted
   */
  allow(now: Date): boolean;
  /**
   * The events dropped since the last report, at most once a minute, then zero again.
   * @param now - The current instant
   * @returns How many to report, or 0 when there are none or the last report was less than a minute ago
   */
  dropsToReport(now: Date): number;
};

/** One minute, the window of every client-log cap. */
const MINUTE_MS = 60_000;

/**
 * A process-wide per-minute cap on stored client-log events (`apiEventsPerMinute`, `consoleEventsPerMinute`).
 * @param perMinute - Events stored per minute at most
 * @returns The cap
 */
export function createClientLogMinuteCap(perMinute: number): ClientLogMinuteCap {
  let windowStart = Number.NEGATIVE_INFINITY;
  let used = 0;
  let unreported = 0;
  let lastReport = Number.NEGATIVE_INFINITY;
  return {
    allow(now) {
      const at = now.getTime();
      if (at - windowStart >= MINUTE_MS) {
        windowStart = at;
        used = 0;
      }
      if (used < perMinute) {
        used += 1;
        return true;
      }
      unreported += 1;
      return false;
    },
    dropsToReport(now) {
      const at = now.getTime();
      if (unreported === 0 || at - lastReport < MINUTE_MS) return 0;
      const dropped = unreported;
      unreported = 0;
      lastReport = at;
      return dropped;
    },
  };
}

/** How many events of one batch were queued and how many were dropped (invalid, past a cap). */
export type ClientLogAcceptResult = { accepted: number; dropped: number };

/** Who stores a batch, and what the server knows that the browser does not say. */
export type AcceptClientLogBatchOptions = {
  /** Where each kept event's row goes. */
  sink: Pick<LogSink, "push">;
  /** `web` for `POST /api/client-logs`, `console` for the console's own screens. Never read from the body. */
  component: "web" | "console";
  /** The instant the server got the batch; every row's `loggedAt`. */
  now: Date;
  /** The signed-in Learner, or null. */
  learnerId: string | null;
  /** The request's `User-Agent`, when the route has it; cut to 256 characters. */
  userAgent?: string | null;
  /** The route's process-wide per-minute cap. */
  cap: ClientLogMinuteCap;
};

/** Longest `User-Agent` kept in a client Log Entry's context, in characters. */
const USER_AGENT_MAX_CHARS = 256;

/** HTTP method names: letters only. */
const METHOD = /^[A-Z]{1,16}$/;

/**
 * A plain object, or null.
 * @param value - Anything from the parsed body
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The failed call of an event, when it is well formed: a method, a path, and an integer status from 0 to 599.
 * @param value - The event's `api` field
 * @returns The call with its path stripped, or null
 */
function readApiCall(value: unknown): ClientLogApiCall | null {
  const api = asRecord(value);
  if (!api) return null;
  const method = typeof api.method === "string" ? api.method.toUpperCase() : "";
  const { path, status } = api;
  if (!METHOD.test(method) || typeof path !== "string" || !path) return null;
  if (typeof status !== "number" || !Number.isInteger(status) || status < 0 || status > 599) return null;
  const requestId = typeof api.requestId === "string" && UUID.test(api.requestId) ? api.requestId : null;
  return { method, path: pathOnly(path), status, requestId };
}

/**
 * One event as a Log Entry row, or null when it fails validation (`ClientLogEvent`): a known kind, a non-empty
 * message, an ISO time, a page, and for an `api_failure` a well-formed call. Optional string fields that are not
 * strings are left out; stacks are cut to `maxStackBytes`.
 * @param value - One element of `events`
 * @param options - Component, Learner, user agent and time
 */
function readEvent(value: unknown, options: AcceptClientLogBatchOptions): LogEntryRow | null {
  const event = asRecord(value);
  if (!event) return null;
  const { kind, message, time, page } = event;
  if (typeof kind !== "string" || !(CLIENT_LOG_KINDS as readonly string[]).includes(kind)) return null;
  if (typeof message !== "string" || !message.trim()) return null;
  if (typeof time !== "string" || Number.isNaN(Date.parse(time))) return null;
  if (typeof page !== "string") return null;
  const api = readApiCall(event.api);
  if (kind === "api_failure" && !api) return null;

  const context: Record<string, unknown> = { kind, page: pathOnly(page), clientTime: new Date(time).toISOString() };
  if (typeof event.stack === "string") context.stack = capUtf8(event.stack, CLIENT_LOG_LIMITS.maxStackBytes);
  if (typeof event.componentStack === "string") {
    context.componentStack = capUtf8(event.componentStack, CLIENT_LOG_LIMITS.maxStackBytes);
  }
  if (api) context.api = { method: api.method, path: api.path, status: api.status };
  if (typeof event.count === "number" && Number.isInteger(event.count) && event.count >= 1) context.count = event.count;
  if (typeof options.userAgent === "string") context.userAgent = options.userAgent.slice(0, USER_AGENT_MAX_CHARS);

  return {
    loggedAt: options.now,
    component: options.component,
    level: clientLogLevel({ kind: kind as ClientLogKind, api }),
    message,
    context,
    requestId: api?.requestId ?? null,
    generationJobId: null,
    courseRequestId: null,
    learnerId: options.learnerId,
    pipelineEventId: null,
  };
}

/**
 * Validates and caps one `ClientLogBatch` from a browser and pushes one row per kept event to the sink. Events past
 * `maxEventsPerBatch`, events that fail validation, and events over the per-minute cap are dropped and counted. The
 * component, level and time are the server's. Synchronous; never throws.
 * @param body - The parsed JSON body, unchecked
 * @param options - Sink, component, time, Learner, user agent and cap
 * @returns How many events were queued and how many dropped
 */
export function acceptClientLogBatch(body: unknown, options: AcceptClientLogBatchOptions): ClientLogAcceptResult {
  const result: ClientLogAcceptResult = { accepted: 0, dropped: 0 };
  try {
    const events = asRecord(body)?.events;
    if (!Array.isArray(events)) return result;
    result.dropped += Math.max(0, events.length - CLIENT_LOG_LIMITS.maxEventsPerBatch);
    for (const value of events.slice(0, CLIENT_LOG_LIMITS.maxEventsPerBatch)) {
      const row = readEvent(value, options);
      if (!row || !options.cap.allow(options.now)) {
        result.dropped += 1;
        continue;
      }
      options.sink.push(row);
      result.accepted += 1;
    }
  } catch {
    // Never throws into the route; whatever was pushed stays pushed.
  }
  return result;
}
