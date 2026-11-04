import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_LOG_LIMITS } from "@senoy/db/logs";
import type { LogEntryRow, LogSink } from "@senoy/logging";
import { createConsoleClientLogIngest } from "./client-logs.ts";

const NOW = new Date("2026-11-04T10:15:03.000Z");

/** A sink that keeps what it is given. */
function fakeSink() {
  const rows: LogEntryRow[] = [];
  const sink: LogSink = { push: (row) => void rows.push(row), flush: async () => {}, close: async () => {} };
  return { rows, sink };
}

/** A valid event. */
function event(overrides: Record<string, unknown> = {}) {
  return { kind: "uncaught_error", message: "boom", time: "2026-11-04T10:15:02.120Z", page: "/logs", ...overrides };
}

test("Each valid event becomes one console row with no Learner; the component and level are the server's", () => {
  const { rows, sink } = fakeSink();
  const ingest = createConsoleClientLogIngest({ sink, now: () => NOW });
  const result = ingest.accept({
    events: [
      event({ component: "api", level: "fatal", learnerId: "51aa0000-0000-4000-8000-000000000000", page: "/logs?jobId=x" }),
      event({ kind: "error_boundary", message: "render", componentStack: "\n in Logs" }),
      event({ kind: "nope" }),
    ],
  });
  assert.deepEqual(result, { accepted: 2, dropped: 1 });
  assert.deepEqual(rows.map((row) => [row.component, row.level, row.learnerId, row.loggedAt]), [
    ["console", "error", null, NOW],
    ["console", "error", null, NOW],
  ]);
  assert.deepEqual(rows[0]!.context, { kind: "uncaught_error", page: "/logs", clientTime: "2026-11-04T10:15:02.120Z" });
  assert.equal(rows[1]!.context!.componentStack, "\n in Logs");
});

test("accept never throws, whatever the body", () => {
  const { rows, sink } = fakeSink();
  const ingest = createConsoleClientLogIngest({ sink, now: () => NOW });
  for (const body of [undefined, null, "boom", 7, [], {}, { events: "no" }, { events: [null, 1, "x", []] }]) {
    assert.doesNotThrow(() => ingest.accept(body));
  }
  const throwing: LogSink = { push: () => { throw new Error("sink broke"); }, flush: async () => {}, close: async () => {} };
  assert.doesNotThrow(() => createConsoleClientLogIngest({ sink: throwing }).accept({ events: [event()] }));
  assert.equal(rows.length, 0);
});

test("Past consoleEventsPerMinute stored events the rest are dropped, and one console warn row a minute says how many", () => {
  const { rows, sink } = fakeSink();
  let now = NOW;
  const ingest = createConsoleClientLogIngest({ sink, now: () => now });
  const batch = { events: Array.from({ length: CLIENT_LOG_LIMITS.maxEventsPerBatch }, (_, i) => event({ message: `e${i}` })) };
  const perMinute = CLIENT_LOG_LIMITS.consoleEventsPerMinute;
  for (let i = 0; i < perMinute / CLIENT_LOG_LIMITS.maxEventsPerBatch; i += 1) ingest.accept(batch);
  assert.equal(rows.length, perMinute);
  assert.deepEqual(ingest.accept(batch), { accepted: 0, dropped: CLIENT_LOG_LIMITS.maxEventsPerBatch });
  assert.deepEqual(ingest.accept(batch), { accepted: 0, dropped: CLIENT_LOG_LIMITS.maxEventsPerBatch });
  const warns = rows.filter((row) => row.level === "warn");
  assert.deepEqual(warns.map((row) => [row.component, row.message]), [
    ["console", `[client-logs: accept] Dropped ${CLIENT_LOG_LIMITS.maxEventsPerBatch} console client log events || reason=over the per-minute cap`],
  ]);

  now = new Date(NOW.getTime() + 60_000);
  assert.deepEqual(ingest.accept({ events: [event()] }), { accepted: 1, dropped: 0 });
  assert.equal(rows.filter((row) => row.level === "warn").length, 2, "The drops held back last minute are reported now.");
});
