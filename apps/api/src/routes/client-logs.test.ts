import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { test } from "node:test";
import Fastify from "fastify";
import { CLIENT_LOG_LIMITS, TRUNCATION_MARKER } from "@senoy/db/logs";
import type { LogEntryRow, LogSink } from "@senoy/logging";
import { CLIENT_LOG_NOT_JSON_ERROR, clientLogRoutes } from "./client-logs.ts";

const NOW = new Date("2026-11-04T10:15:03.000Z");

/** A sink that keeps what it is given. */
function fakeSink() {
  const rows: LogEntryRow[] = [];
  const sink: LogSink = { push: (row) => void rows.push(row), flush: async () => {}, close: async () => {} };
  return { rows, sink };
}

/**
 * The route over a fake sink, with a stand-in for the current-Learner plugin: an `x-test-learner` header signs the
 * request in as that Learner id. The API's own log lines are kept in `lines`.
 */
async function testApp(clock: () => Date = () => NOW) {
  const { rows, sink } = fakeSink();
  const lines: { level: number; msg: string }[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(JSON.parse(String(chunk)) as { level: number; msg: string });
      done();
    },
  });
  const app = Fastify({ logger: { level: "warn", stream } });
  app.addHook("onRequest", (request, _reply, done) => {
    const learnerId = request.headers["x-test-learner"];
    if (typeof learnerId === "string") request.currentLearner = { id: learnerId } as typeof request.currentLearner;
    done();
  });
  await app.register(clientLogRoutes, { sink, now: clock });
  await app.ready();
  /** Posts one batch. */
  const post = (events: unknown[], headers: Record<string, string> = {}, remoteAddress = "203.0.113.7") =>
    app.inject({ method: "POST", url: "/api/client-logs", payload: { events }, headers, remoteAddress });
  return { app, rows, lines, post };
}

/** A valid event of the given kind. */
function event(overrides: Record<string, unknown> = {}) {
  return { kind: "uncaught_error", message: "boom", time: "2026-11-04T10:15:02.120Z", page: "/study/1", ...overrides };
}

test("Each valid event becomes one web row: the server sets component, level and time, and the api request id is kept", async () => {
  const { app, rows, post } = await testApp();
  try {
    const requestId = randomUUID();
    const response = await post(
      [
        event({ component: "api", level: "fatal", stack: "Error: boom\n at x", page: "/study/1?token=abc#top", count: 3 }),
        event({ kind: "error_boundary", message: "render", componentStack: "\n in Study" }),
        event({ kind: "api_failure", message: "POST /api/x failed: 502", api: { method: "post", path: "/api/x?y=1", status: 502, requestId } }),
        event({ kind: "api_failure", message: "GET /api/y failed: no reply", api: { method: "GET", path: "/api/y", status: 0, requestId: null } }),
        event({ kind: "unhandled_rejection", message: "nope" }),
      ],
      { "user-agent": `Mozilla/5.0 ${"x".repeat(400)}` },
    );
    assert.equal(response.statusCode, 204);
    assert.equal(response.body, "");
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.equal(row.component, "web", "The component is never read from the body.");
      assert.equal(row.loggedAt, NOW);
      assert.equal(row.learnerId, null, "Signed out: no Learner.");
      assert.equal(row.generationJobId, null);
      assert.equal(row.courseRequestId, null);
      assert.equal(row.pipelineEventId, null);
      assert.equal((row.context!.userAgent as string).length, 256);
    }
    assert.deepEqual(rows.map((row) => row.level), ["error", "error", "error", "warn", "error"]);
    assert.deepEqual({ ...rows[0]!.context, userAgent: undefined }, {
      kind: "uncaught_error", page: "/study/1", clientTime: "2026-11-04T10:15:02.120Z", stack: "Error: boom\n at x", count: 3, userAgent: undefined,
    });
    assert.equal(rows[1]!.context!.componentStack, "\n in Study");
    assert.equal(rows[2]!.requestId, requestId);
    assert.deepEqual(rows[2]!.context!.api, { method: "POST", path: "/api/x", status: 502 });
    assert.equal(rows[3]!.requestId, null);
  } finally {
    await app.close();
  }
});

test("A signed-in Learner is attached; a signed-out browser is accepted too", async () => {
  const { app, rows, post } = await testApp();
  try {
    const learnerId = randomUUID();
    assert.equal((await post([event()], { "x-test-learner": learnerId })).statusCode, 204);
    assert.equal((await post([event()])).statusCode, 204);
    assert.deepEqual(rows.map((row) => row.learnerId), [learnerId, null]);
  } finally {
    await app.close();
  }
});

test("Invalid events are dropped, a non-string optional field is left out, and stacks are capped", async () => {
  const { app, rows, post } = await testApp();
  try {
    const response = await post([
      event({ kind: "console_log" }),
      event({ message: "   " }),
      event({ message: 7 }),
      event({ time: "yesterday" }),
      event({ page: null }),
      event({ kind: "api_failure" }),
      event({ kind: "api_failure", api: { method: "GET", path: "/api/x", status: 999 } }),
      "not an event",
      event({ message: "kept", stack: { evil: true }, componentStack: 12, count: 0, api: { method: "GET", path: "/x", status: 500, requestId: "not-a-uuid" } }),
      event({ message: "long stack", stack: "s".repeat(CLIENT_LOG_LIMITS.maxStackBytes * 2) }),
    ]);
    assert.equal(response.statusCode, 204);
    assert.deepEqual(rows.map((row) => row.message), ["kept", "long stack"]);
    const kept = rows[0]!;
    assert.equal(kept.context!.stack, undefined);
    assert.equal(kept.context!.componentStack, undefined);
    assert.equal(kept.context!.count, undefined);
    assert.equal(kept.requestId, null, "A request id that is not a UUID is not stored.");
    const stack = rows[1]!.context!.stack as string;
    assert.ok(Buffer.byteLength(stack) <= CLIENT_LOG_LIMITS.maxStackBytes && stack.endsWith(TRUNCATION_MARKER));
  } finally {
    await app.close();
  }
});

test("Only the first maxEventsPerBatch events of a batch are kept", async () => {
  const { app, rows, post } = await testApp();
  try {
    const events = Array.from({ length: CLIENT_LOG_LIMITS.maxEventsPerBatch + 5 }, (_, i) => event({ message: `e${i}` }));
    assert.equal((await post(events)).statusCode, 204);
    assert.equal(rows.length, CLIENT_LOG_LIMITS.maxEventsPerBatch);
    assert.equal(rows.at(-1)!.message, `e${CLIENT_LOG_LIMITS.maxEventsPerBatch - 1}`);
  } finally {
    await app.close();
  }
});

test("Past apiEventsPerMinute stored events, the rest are dropped and one warn line an hour says how many", async () => {
  let now = NOW;
  const { app, rows, lines, post } = await testApp(() => now);
  try {
    const batch = Array.from({ length: CLIENT_LOG_LIMITS.maxEventsPerBatch }, (_, i) => event({ message: `e${i}` }));
    for (let i = 0; i < 4; i += 1) await post(batch, {}, `198.51.100.${i}`);
    assert.equal(rows.length, CLIENT_LOG_LIMITS.apiEventsPerMinute);
    const warns = lines.filter((line) => line.level === 40);
    assert.deepEqual(warns.map((line) => line.msg), [
      "[client-logs: POST /api/client-logs] Dropped 20 web client log events || reason=over the per-minute or daily cap",
    ]);

    now = new Date(NOW.getTime() + 60_000);
    await post([event()], {}, "198.51.100.9");
    assert.equal(rows.length, CLIENT_LOG_LIMITS.apiEventsPerMinute + 1, "A new minute stores again.");
  } finally {
    await app.close();
  }
});

test("One IP gets apiBatchesPerIpPerMinute batches a minute, then 429; another IP is not held up", async () => {
  const { app, post } = await testApp();
  try {
    for (let i = 0; i < CLIENT_LOG_LIMITS.apiBatchesPerIpPerMinute; i += 1) assert.equal((await post([])).statusCode, 204);
    assert.equal((await post([])).statusCode, 429);
    assert.equal((await post([], {}, "192.0.2.1")).statusCode, 204);
  } finally {
    await app.close();
  }
});

test("Over maxBodyBytes is 413, a body that is not JSON is 415, and JSON that is not a batch is a quiet 204", async () => {
  const { app, rows } = await testApp();
  try {
    const tooBig = await app.inject({
      method: "POST", url: "/api/client-logs", payload: { events: [event({ message: "x".repeat(CLIENT_LOG_LIMITS.maxBodyBytes) })] },
    });
    assert.equal(tooBig.statusCode, 413);
    const text = await app.inject({ method: "POST", url: "/api/client-logs", payload: "boom", headers: { "content-type": "text/plain" } });
    assert.equal(text.statusCode, 415);
    assert.deepEqual(text.json(), { error: CLIENT_LOG_NOT_JSON_ERROR });
    for (const payload of ["[1,2]", "7", '{"events":"no"}', "null"]) {
      const response = await app.inject({ method: "POST", url: "/api/client-logs", payload, headers: { "content-type": "application/json" } });
      assert.equal(response.statusCode, 204, payload);
    }
    assert.equal(rows.length, 0);
  } finally {
    await app.close();
  }
});
