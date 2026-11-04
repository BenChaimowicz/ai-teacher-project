import assert from "node:assert/strict";
import { test } from "node:test";
import Fastify from "fastify";
import { generationJobs, type Transaction } from "@senoy/db";
import { createLogger, type LogEntryRow, type LogSink } from "@senoy/logging";
import { enqueueJob } from "../lib/generation-job.ts";
import { currentLogCorrelation, installUsageTracking, runInRequestContext, withClaim, type ApiRequestRow, type UsageSink } from "../lib/usage-tracking.ts";
import apiRequestsPlugin, { isRecordedApiPath } from "../plugins/api-requests.ts";
import requestContextPlugin, { REQUEST_ID_HEADER, REQUEST_ID_OPTIONS } from "../plugins/request-context.ts";
import { fakeDb } from "./fake-db.ts";

/**
 * The request id (ADR 0029, spec line 9): one uuid per API request, on its reply, its log lines, its API Request row,
 * and the Generation job it queues, and from there on the worker's lines for that job's run.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LEARNER = "51aa0f3c-1d2e-4f5a-9b8c-7d6e5f4a3b2c";

/** A sink that keeps every pushed row. */
function memorySink(): LogSink & { rows: LogEntryRow[] } {
  const rows: LogEntryRow[] = [];
  return { rows, push: (row) => void rows.push(row), flush: async () => {}, close: async () => {} };
}

/**
 * The API's logger and request-id setup, with a stand-in sign-in that loads a Learner when the `x-learner` header says so.
 * @param sink - Where Log Entries go
 */
async function appWithRequestIds(sink: LogSink) {
  const app = Fastify({
    ...REQUEST_ID_OPTIONS,
    loggerInstance: createLogger({ component: "api", sink, stdoutLevel: "silent", context: currentLogCorrelation }),
  });
  await app.register(requestContextPlugin);
  app.addHook("onRequest", async (request) => {
    if (request.headers["x-learner"]) request.currentLearner = { id: String(request.headers["x-learner"]) } as never;
  });
  app.get("/api/where", async (request) => {
    request.log.info("in the handler");
    app.log.info("through the app logger");
    return { id: request.id, ids: currentLogCorrelation() };
  });
  app.post("/api/where", async (request) => ({ id: request.id, ids: currentLogCorrelation(), body: request.body }));
  return app;
}

test("Every request gets a fresh uuid, echoed in x-request-id; a caller's own id is never used", async () => {
  const app = await appWithRequestIds(memorySink());
  try {
    const first = await app.inject({ method: "GET", url: "/api/where", headers: { [REQUEST_ID_HEADER]: "caller-chosen" } });
    const second = await app.inject({ method: "GET", url: "/api/where" });
    const id = first.headers[REQUEST_ID_HEADER] as string;
    assert.match(id, UUID);
    assert.equal(first.json().id, id);
    assert.notEqual(second.headers[REQUEST_ID_HEADER], id);
    const missing = await app.inject({ method: "GET", url: "/api/nowhere" });
    assert.match(String(missing.headers[REQUEST_ID_HEADER]), UUID, "A 404 carries one too.");
  } finally {
    await app.close();
  }
});

test("The handler runs in the request's context, with the Learner once signed in, after a body is parsed too", async () => {
  const app = await appWithRequestIds(memorySink());
  try {
    const signedIn = await app.inject({ method: "GET", url: "/api/where", headers: { "x-learner": LEARNER } });
    assert.deepEqual(signedIn.json().ids, { requestId: signedIn.json().id, jobId: null, courseRequestId: null, learnerId: LEARNER, pipelineEventId: null });
    const posted = await app.inject({ method: "POST", url: "/api/where", payload: { a: 1 } });
    assert.equal(posted.json().ids.requestId, posted.json().id);
    assert.equal(posted.json().ids.learnerId, null);
  } finally {
    await app.close();
  }
});

test("A request's log lines are stored with its request id and Learner; Fastify's per-request lines are not", async () => {
  const sink = memorySink();
  const app = await appWithRequestIds(sink);
  try {
    const reply = await app.inject({ method: "GET", url: "/api/where", headers: { "x-learner": LEARNER } });
    const id = reply.headers[REQUEST_ID_HEADER];
    const lines = sink.rows.filter((row) => row.requestId === id);
    assert.deepEqual(lines.map((row) => row.message), ["in the handler", "through the app logger"]);
    assert.ok(lines.every((row) => row.learnerId === LEARNER && row.component === "api"));
    assert.equal(sink.rows.some((row) => row.message === "incoming request" || row.message === "request completed"), false);
  } finally {
    await app.close();
  }
});

test("The API Request row stores the request id; client-log posts are not API Requests", async () => {
  const recorded: ApiRequestRow[] = [];
  const sink = { insertApiRequest: async (row: ApiRequestRow) => void recorded.push(row) } as unknown as UsageSink;
  const uninstall = installUsageTracking({ sink, log: { error: () => {} } });
  const app = Fastify(REQUEST_ID_OPTIONS);
  await app.register(requestContextPlugin);
  await app.register(apiRequestsPlugin);
  app.get("/api/where", async () => ({ ok: true }));
  try {
    const reply = await app.inject({ method: "GET", url: "/api/where" });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(recorded[0]!.requestId, reply.headers[REQUEST_ID_HEADER]);
    assert.equal(isRecordedApiPath("/api/client-logs"), false);
    assert.equal(isRecordedApiPath("/api/client-logs?x=1"), false);
    assert.equal(isRecordedApiPath("/api/course-requests"), true);
  } finally {
    uninstall();
    await app.close();
  }
});

test("A queued job stores the request that queued it, and a later queue replaces it; the claimed run carries it", async () => {
  const { db, rows } = fakeDb([generationJobs]);
  const job = { courseRequestId: "3f0c0f3c-1d2e-4f5a-9b8c-7d6e5f4a3b2c", learnerId: LEARNER, kind: "blueprint" as const };
  await runInRequestContext("request-1", () => enqueueJob(db as unknown as Transaction, job));
  assert.equal((rows.get(generationJobs)![0] as { requestId: string }).requestId, "request-1");
  await runInRequestContext("request-2", () => enqueueJob(db as unknown as Transaction, job));
  assert.equal(rows.get(generationJobs)!.length, 1);
  assert.equal((rows.get(generationJobs)![0] as { requestId: string }).requestId, "request-2", "Like owner, the last queue wins.");

  // A worker's run re-queueing a Blueprint keeps the chain: the run's context carries its job's request id.
  const claim = { claimToken: "c", jobId: "j", requestId: "request-2", courseRequestId: job.courseRequestId, learnerId: LEARNER };
  await withClaim(claim, () => enqueueJob(db as unknown as Transaction, job));
  assert.equal((rows.get(generationJobs)![0] as { requestId: string }).requestId, "request-2");
  await enqueueJob(db as unknown as Transaction, job);
  assert.equal((rows.get(generationJobs)![0] as { requestId: string | null }).requestId, null, "Outside any request there is none.");
});
