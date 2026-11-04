import assert from "node:assert/strict";
import { test } from "node:test";
import { createBatchedLogSink } from "./sink.ts";
import type { LogEntryRow } from "./types.ts";

/**
 * The promises every `LogSink` keeps to the code that logs (ADR 0029, spec line 10). They hold for any implementation,
 * so they stay green while the sink changes.
 */

/** One plain row. */
function row(message: string): LogEntryRow {
  return {
    loggedAt: new Date(), component: "api", level: "info", message, context: null,
    requestId: null, generationJobId: null, courseRequestId: null, learnerId: null, pipelineEventId: null,
  };
}

test("push never throws, before the sink has a writer and after", () => {
  const sink = createBatchedLogSink({ report: () => {} });
  assert.doesNotThrow(() => sink.push(row("before start")));
  sink.start(async () => {});
  assert.doesNotThrow(() => sink.push(row("after start")));
  return sink.close();
});

test("flush and close resolve when the writer throws", async () => {
  const sink = createBatchedLogSink({ report: () => {} });
  sink.start(async () => {
    throw new Error("database down");
  });
  sink.push(row("lost"));
  await sink.flush();
  await sink.close();
});

test("flush and close resolve within the timeouts when the writer never settles", async () => {
  const sink = createBatchedLogSink({ report: () => {}, writeTimeoutMs: 50, closeTimeoutMs: 50, flushIntervalMs: 10 });
  sink.start(() => new Promise<void>(() => {}));
  sink.push(row("stuck"));
  const started = Date.now();
  await sink.flush();
  await sink.close();
  assert.ok(Date.now() - started < 1_000, "A hung writer held up flush or close.");
});
