import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { createBatchedLogSink } from "./sink.ts";
import type { LogEntryRow } from "./types.ts";

/**
 * The batched sink (ADR 0029, spec line 10): batching, the buffer cap, a writer that throws or hangs, and the notice
 * row after drops. The promises any sink keeps are in `contract.test.ts`.
 */

const UUID = "7d2e1c3a-4b5f-4c6d-8e9f-0a1b2c3d4e5f";

/**
 * One plain row.
 * @param message - Its message
 * @param more - Fields to change
 */
function row(message: string, more: Partial<LogEntryRow> = {}): LogEntryRow {
  return {
    loggedAt: new Date(), component: "api", level: "info", message, context: null,
    requestId: null, generationJobId: null, courseRequestId: null, learnerId: null, pipelineEventId: null, ...more,
  };
}

/** A writer that records every batch it is given. */
function recordingWriter() {
  const batches: LogEntryRow[][] = [];
  return { batches, write: async (rows: LogEntryRow[]) => void batches.push(rows) };
}

test("Rows wait until the sink is started, then go out in batches of batchSize", async () => {
  const writer = recordingWriter();
  const sink = createBatchedLogSink({ batchSize: 2, report: () => {} });
  for (const message of ["a", "b", "c", "d", "e"]) sink.push(row(message));
  await sink.flush();
  assert.equal(writer.batches.length, 0, "Nothing is written before start.");
  sink.start(writer.write);
  await sink.flush();
  assert.deepEqual(writer.batches.map((batch) => batch.map((stored) => stored.message)), [["a", "b"], ["c", "d"], ["e"]]);
  await sink.close();
});

test("A full batch is written at once, without waiting for the timer", async () => {
  const writer = recordingWriter();
  const sink = createBatchedLogSink({ batchSize: 3, flushIntervalMs: 60_000, report: () => {} });
  sink.start(writer.write);
  sink.push(row("1"));
  sink.push(row("2"));
  await sleep(10);
  assert.equal(writer.batches.length, 0, "A part batch waits for the timer.");
  sink.push(row("3"));
  await sleep(10);
  assert.equal(writer.batches.length, 1);
  await sink.close();
});

test("The timer writes a part batch every flushIntervalMs", async () => {
  const writer = recordingWriter();
  const sink = createBatchedLogSink({ batchSize: 100, flushIntervalMs: 20, report: () => {} });
  sink.start(writer.write);
  sink.push(row("lonely"));
  await sleep(80);
  assert.deepEqual(writer.batches.map((batch) => batch.length), [1]);
  await sink.close();
});

test("Only one insert is in flight at a time", async () => {
  let inFlight = 0;
  let most = 0;
  const sink = createBatchedLogSink({ batchSize: 1, report: () => {} });
  sink.start(async () => {
    inFlight += 1;
    most = Math.max(most, inFlight);
    await sleep(5);
    inFlight -= 1;
  });
  for (let index = 0; index < 5; index += 1) sink.push(row(String(index)));
  await sink.flush();
  assert.equal(most, 1);
  await sink.close();
});

test("A full buffer drops new rows, and the next good write is followed by one warn row saying so", async () => {
  const writer = recordingWriter();
  const reports: string[] = [];
  const sink = createBatchedLogSink({ maxBuffered: 2, batchSize: 10, report: (line) => reports.push(line) });
  for (const message of ["kept 1", "kept 2", "lost 1", "lost 2", "lost 3"]) sink.push(row(message));
  sink.start(writer.write);
  await sink.flush();
  const stored = writer.batches.flat();
  assert.deepEqual(stored.map((entry) => entry.message), ["kept 1", "kept 2", "Dropped 3 Log Entries || reason=buffer full"]);
  assert.equal(stored[2]!.level, "warn");
  assert.equal(stored[2]!.component, "api", "The notice comes from the component whose rows were lost.");
  assert.equal(reports.length, 1, "A run of drops is reported to stderr once, not per row.");
  await sink.close();
});

test("A writer that throws drops its batch, reports it, and the notice follows the next good write", async () => {
  const reports: string[] = [];
  const stored: LogEntryRow[] = [];
  let fail = true;
  const sink = createBatchedLogSink({ report: (line) => reports.push(line) });
  sink.start(async (rows) => {
    if (fail) throw new Error("database down");
    stored.push(...rows);
  });
  sink.push(row("lost"));
  sink.push(row("lost too"));
  await sink.flush();
  assert.equal(stored.length, 0);
  assert.match(reports[0]!, /\[sink\.ts: writeBatch\] .* rows=2 \|\| database down/);
  fail = false;
  sink.push(row("back"));
  await sink.flush();
  assert.deepEqual(stored.map((entry) => entry.message), ["back", "Dropped 2 Log Entries || reason=write failed"]);
  await sink.close();
});

test("A writer that hangs times out, its rows are dropped, and later batches still go out", async () => {
  const reports: string[] = [];
  const stored: LogEntryRow[] = [];
  let hang = true;
  const sink = createBatchedLogSink({ writeTimeoutMs: 30, report: (line) => reports.push(line) });
  sink.start((rows) => {
    if (hang) return new Promise<void>(() => {});
    stored.push(...rows);
    return Promise.resolve();
  });
  sink.push(row("stuck"));
  await sink.flush();
  assert.match(reports[0]!, /did not settle in time/);
  hang = false;
  sink.push(row("next"));
  await sink.flush();
  assert.deepEqual(stored.map((entry) => entry.message), ["next", "Dropped 1 Log Entries || reason=write timed out"]);
  await sink.close();
});

test("A writer that throws synchronously is a failed write, not a thrown push or flush", async () => {
  const reports: string[] = [];
  const sink = createBatchedLogSink({ report: (line) => reports.push(line) });
  sink.start(() => {
    throw new Error("sync boom");
  });
  sink.push(row("x"));
  await sink.flush();
  assert.match(reports[0]!, /sync boom/);
  await sink.close();
});

test("A row with a component or level the enums do not have is dropped, never sent to the writer", async () => {
  const writer = recordingWriter();
  const sink = createBatchedLogSink({ report: () => {} });
  sink.start(writer.write);
  sink.push(row("bad level", { level: "debug" as never }));
  sink.push(row("bad component", { component: "cron" as never }));
  sink.push(row("good"));
  await sink.flush();
  assert.deepEqual(writer.batches.flat().map((entry) => entry.message), ["good", "Dropped 1 Log Entries || reason=invalid component or level"]);
  await sink.close();
});

test("Rows are made storable on push: bad ids move to the context, secrets and emails go", async () => {
  const writer = recordingWriter();
  const sink = createBatchedLogSink({ report: () => {} });
  sink.start(writer.write);
  sink.push(row("signed in ben@example.com", { requestId: "not-a-uuid", learnerId: UUID, context: { password: "hunter2" } }));
  await sink.flush();
  const [stored] = writer.batches.flat();
  assert.equal(stored!.message, "signed in [email]");
  assert.equal(stored!.requestId, null);
  assert.equal(stored!.learnerId, UUID);
  assert.deepEqual(stored!.context, { password: "[Redacted]", invalidIds: { requestId: "not-a-uuid" } });
  await sink.close();
});

test("A reporter that throws does not break push or flush", async () => {
  const sink = createBatchedLogSink({ maxBuffered: 0, report: () => {
    throw new Error("stderr closed");
  } });
  assert.doesNotThrow(() => sink.push(row("dropped")));
  sink.start(async () => {
    throw new Error("down");
  });
  await sink.flush();
  await sink.close();
});

test("close writes what is queued", async () => {
  const writer = recordingWriter();
  const sink = createBatchedLogSink({ flushIntervalMs: 60_000, report: () => {} });
  sink.start(writer.write);
  sink.push(row("last words"));
  await sink.close();
  assert.deepEqual(writer.batches.flat().map((entry) => entry.message), ["last words"]);
});
