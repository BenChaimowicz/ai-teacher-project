import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import { createLogger } from "./logger.ts";
import type { LogCorrelation, LogEntryRow, LogSink } from "./types.ts";

/** The shared logger setup (ADR 0029, spec line 6): what reaches stdout, what reaches the sink, and with which ids. */

const REQUEST = "7d2e1c3a-4b5f-4c6d-8e9f-0a1b2c3d4e5f";
const JOB = "a90f1c3a-4b5f-4c6d-8e9f-0a1b2c3d4e5f";
const EVENT = "c4d81c3a-4b5f-4c6d-8e9f-0a1b2c3d4e5f";

/** A sink that keeps every pushed row. */
function memorySink(): LogSink & { rows: LogEntryRow[] } {
  const rows: LogEntryRow[] = [];
  return { rows, push: (row) => void rows.push(row), flush: async () => {}, close: async () => {} };
}

/** A stdout stand-in that keeps every line, parsed. */
function memoryStdout() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({ write(chunk, _encoding, done) {
    lines.push(JSON.parse(String(chunk)));
    done();
  } });
  return { lines, stream };
}

test("info and above reach the sink; debug reaches stdout only when asked for", () => {
  const sink = memorySink();
  const stdout = memoryStdout();
  const log = createLogger({ component: "worker", sink, stdoutLevel: "debug", stdout: stdout.stream });
  log.debug("chasing");
  log.info("ready");
  log.warn("slow");
  log.error("broke");
  assert.deepEqual(stdout.lines.map((line) => line.msg), ["chasing", "ready", "slow", "broke"]);
  assert.deepEqual(sink.rows.map((row) => [row.level, row.message]), [["info", "ready"], ["warn", "slow"], ["error", "broke"]]);
  assert.ok(sink.rows.every((row) => row.component === "worker"));
});

test("The Usage Console's server logs as component console, and its per-request lines are not stored", () => {
  const sink = memorySink();
  const log = createLogger({ component: "console", sink, stdoutLevel: "silent" });
  log.info("incoming request");
  log.warn("billing check failed");
  assert.deepEqual(sink.rows.map((row) => [row.component, row.message]), [["console", "billing check failed"]]);
});

test("The sink takes info even when stdout is set to warn or silent", () => {
  const sink = memorySink();
  const stdout = memoryStdout();
  createLogger({ component: "api", sink, stdoutLevel: "warn", stdout: stdout.stream }).info("stored only");
  createLogger({ component: "api", sink, stdoutLevel: "silent" }).info("also stored");
  assert.equal(stdout.lines.length, 0);
  assert.deepEqual(sink.rows.map((row) => row.message), ["stored only", "also stored"]);
});

test("The ids of the running code go on every line and into the row's columns", () => {
  const sink = memorySink();
  const stdout = memoryStdout();
  let ids: LogCorrelation | undefined = { requestId: REQUEST, jobId: JOB, courseRequestId: null, pipelineEventId: EVENT };
  const log = createLogger({ component: "worker", sink, stdout: stdout.stream, context: () => ids });
  log.info({ lesson: 3 }, "writing");
  ids = undefined;
  log.info("idle");
  assert.equal(stdout.lines[0]!.requestId, REQUEST);
  assert.equal(stdout.lines[0]!.jobId, JOB);
  assert.equal("courseRequestId" in stdout.lines[0]!, false, "Unset ids are left off the line.");
  const [writing, idle] = sink.rows;
  assert.equal(writing!.requestId, REQUEST);
  assert.equal(writing!.generationJobId, JOB);
  assert.equal(writing!.pipelineEventId, EVENT);
  assert.equal(writing!.courseRequestId, null);
  assert.deepEqual(writing!.context, { hostname: writing!.context!.hostname, name: "worker", lesson: 3 },
    "The ids are columns, not context; Pino's own time, level, msg and pid are dropped.");
  assert.equal(idle!.requestId, null);
});

test("A child bound to requestId (Fastify's request logger) does not carry it twice", () => {
  const sink = memorySink();
  const lines: string[] = [];
  const stream = new Writable({ write(chunk, _encoding, done) {
    lines.push(String(chunk));
    done();
  } });
  const log = createLogger({ component: "api", sink, stdout: stream, context: () => ({ requestId: REQUEST }) });
  log.child({ requestId: REQUEST }).info("in a request");
  assert.equal(lines[0]!.split("\"requestId\"").length - 1, 1);
  assert.equal(sink.rows[0]!.requestId, REQUEST);
});

test("Fastify's reqId label counts as the request id", () => {
  const sink = memorySink();
  createLogger({ component: "api", sink, stdoutLevel: "silent" }).child({ reqId: REQUEST }).info("old label");
  assert.equal(sink.rows[0]!.requestId, REQUEST);
  assert.equal(sink.rows[0]!.context && "reqId" in sink.rows[0]!.context, false);
});

test("Fastify's per-request lines are not stored, and stay on stdout", () => {
  const sink = memorySink();
  const stdout = memoryStdout();
  const log = createLogger({ component: "api", sink, stdout: stdout.stream });
  log.info({ req: { method: "GET" } }, "incoming request");
  log.info({ res: { statusCode: 200 } }, "request completed");
  log.info("Server listening at http://127.0.0.1:3000");
  assert.equal(stdout.lines.length, 3);
  assert.deepEqual(sink.rows.map((row) => row.message), ["Server listening at http://127.0.0.1:3000"]);
});

test("An error logged without a message is stored under the error's message, with its err context", () => {
  const sink = memorySink();
  const log = createLogger({ component: "worker", sink, stdoutLevel: "silent" });
  log.error({ err: new Error("lesson 3 failed") });
  log.error({ detail: 1 });
  assert.equal(sink.rows[0]!.message, "lesson 3 failed");
  assert.equal((sink.rows[0]!.context!.err as { type: string }).type, "Error");
  assert.equal(sink.rows[1]!.message, "(no message)");
});

test("Secrets are redacted on stdout and in the stored line", () => {
  const sink = memorySink();
  const stdout = memoryStdout();
  createLogger({ component: "api", sink, stdout: stdout.stream }).info({ req: { headers: { cookie: "kn_at=secret" } } }, "with cookie");
  assert.equal((stdout.lines[0]!.req as { headers: { cookie: string } }).headers.cookie, "[Redacted]");
  assert.equal(JSON.stringify(sink.rows[0]!.context).includes("secret"), false);
});

test("A context reader that throws costs only the ids, never the line", () => {
  const sink = memorySink();
  const log = createLogger({ component: "api", sink, stdoutLevel: "silent", context: () => {
    throw new Error("no store");
  } });
  assert.doesNotThrow(() => log.info("still logged"));
  assert.equal(sink.rows[0]!.message, "still logged");
});

test("A sink whose push throws never throws into the code that logged", () => {
  const sink: LogSink = { push: () => {
    throw new Error("broken sink");
  }, flush: async () => {}, close: async () => {} };
  const log = createLogger({ component: "api", sink, stdoutLevel: "silent" });
  assert.doesNotThrow(() => log.error("fine"));
});
