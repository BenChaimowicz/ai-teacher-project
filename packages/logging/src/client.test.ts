import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { CLIENT_LOG_LIMITS, TRUNCATION_MARKER, type ClientLogBatch } from "@senoy/db/logs";
import {
  capUtf8,
  createClientLogMinuteCap,
  createClientLogShipper,
  errorDetails,
  installClientLogHandlers,
  pathOnly,
  type ClientLogTarget,
} from "./client.ts";

/** Every call the shipper made to its fetch, with the batch it sent. */
function recordingFetch(behaviour: "ok" | "reject" | "throw" = "ok") {
  const calls: { url: string; init: RequestInit; batch: ClientLogBatch }[] = [];
  const fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init, batch: JSON.parse(String(init.body)) as ClientLogBatch });
    if (behaviour === "throw") throw new TypeError("Failed to fetch");
    if (behaviour === "reject") return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof globalThis.fetch;
  return { calls, fetch };
}

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

test("Events wait flushDelayMs after the first one, then go as one keepalive JSON POST; identical ones collapse into a count", () => {
  const { calls, fetch } = recordingFetch();
  const shipper = createClientLogShipper({ endpoint: "/api/client-logs", fetch });
  shipper.report({ kind: "uncaught_error", message: "boom", page: "/study/1?token=secret#x" });
  shipper.report({ kind: "uncaught_error", message: "boom", page: "/study/1" });
  shipper.report({ kind: "uncaught_error", message: "boom", page: "/study/1" });
  shipper.report({ kind: "unhandled_rejection", message: "nope", page: "/" });
  mock.timers.tick(CLIENT_LOG_LIMITS.flushDelayMs - 1);
  assert.equal(calls.length, 0, "Nothing is sent before the delay.");
  mock.timers.tick(1);
  assert.equal(calls.length, 1);
  const [{ url, init, batch }] = calls as [(typeof calls)[number]];
  assert.equal(url, "/api/client-logs");
  assert.equal(init.method, "POST");
  assert.equal(init.keepalive, true);
  assert.equal(init.credentials, "same-origin");
  assert.deepEqual(init.headers, { "content-type": "application/json" });
  assert.equal(batch.events.length, 2);
  assert.equal(batch.events[0]!.count, 3);
  assert.equal(batch.events[0]!.page, "/study/1", "The query string and hash never leave the browser.");
  assert.equal(batch.events[1]!.count, undefined);
  assert.ok(!Number.isNaN(Date.parse(batch.events[0]!.time)));
});

test("maxEventsPerBatch queued events go at once; past maxEventsPerPageLoad new events are dropped", () => {
  const { calls, fetch } = recordingFetch();
  const shipper = createClientLogShipper({ endpoint: "/e", fetch });
  for (let i = 0; i < CLIENT_LOG_LIMITS.maxEventsPerBatch; i += 1) shipper.report({ kind: "uncaught_error", message: `e${i}`, page: "/" });
  assert.equal(calls.length, 1, "A full batch does not wait for the timer.");
  assert.equal(calls[0]!.batch.events.length, CLIENT_LOG_LIMITS.maxEventsPerBatch);

  for (let i = CLIENT_LOG_LIMITS.maxEventsPerBatch; i < CLIENT_LOG_LIMITS.maxEventsPerPageLoad + 10; i += 1) {
    shipper.report({ kind: "uncaught_error", message: `e${i}`, page: "/" });
  }
  shipper.flush();
  const sent = calls.flatMap((call) => call.batch.events);
  assert.equal(sent.length, CLIENT_LOG_LIMITS.maxEventsPerPageLoad);
  assert.equal(sent.at(-1)!.message, `e${CLIENT_LOG_LIMITS.maxEventsPerPageLoad - 1}`);
});

test("Messages and stacks are capped in the browser, and a queue larger than maxBodyBytes goes in several batches", () => {
  const { calls, fetch } = recordingFetch();
  const shipper = createClientLogShipper({ endpoint: "/e", fetch });
  const huge = "é".repeat(50_000);
  for (let i = 0; i < 10; i += 1) {
    shipper.report({ kind: "error_boundary", message: `${i}${huge}`, stack: huge, componentStack: huge, page: "/" });
  }
  shipper.flush();
  assert.ok(calls.length > 1, "Ten events of about 10 KB each cannot go in one 64 KB body.");
  const encoder = new TextEncoder();
  for (const call of calls) assert.ok(encoder.encode(String(call.init.body)).length <= CLIENT_LOG_LIMITS.maxBodyBytes);
  const events = calls.flatMap((call) => call.batch.events);
  assert.equal(events.length, 10);
  assert.ok(encoder.encode(events[0]!.stack!).length <= CLIENT_LOG_LIMITS.maxStackBytes);
  assert.ok(events[0]!.message.endsWith(TRUNCATION_MARKER));
});

test("The shipper never throws, never reports its own failures, and ignores reports made while it is sending", async () => {
  for (const behaviour of ["throw", "reject"] as const) {
    const { calls, fetch } = recordingFetch(behaviour);
    const shipper = createClientLogShipper({ endpoint: "/e", fetch });
    shipper.report({ kind: "uncaught_error", message: "boom", page: "/" });
    assert.doesNotThrow(() => shipper.flush());
    await new Promise((resolve) => setImmediate(resolve));
    shipper.flush();
    assert.equal(calls.length, 1, `A ${behaviour} is not retried or reported.`);
  }

  let shipper: ReturnType<typeof createClientLogShipper> | null = null;
  const calls: ClientLogBatch[] = [];
  const reentrant = ((_url: string, init: RequestInit) => {
    calls.push(JSON.parse(String(init.body)) as ClientLogBatch);
    shipper!.report({ kind: "uncaught_error", message: "raised while shipping", page: "/" });
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof globalThis.fetch;
  shipper = createClientLogShipper({ endpoint: "/e", fetch: reentrant });
  shipper.report({ kind: "uncaught_error", message: "first", page: "/" });
  shipper.flush();
  mock.timers.tick(CLIENT_LOG_LIMITS.flushDelayMs);
  shipper.flush();
  assert.deepEqual(calls.map((batch) => batch.events.map((event) => event.message)), [["first"]]);

  const broken = createClientLogShipper({ endpoint: "/e", fetch: recordingFetch().fetch });
  assert.doesNotThrow(() => broken.report(null as never));
  assert.doesNotThrow(() => broken.report({ kind: "not_a_kind" as never, message: "x" }));
});

test("The window handlers report uncaught errors and unhandled rejections, flush on pagehide and when hidden, and come off", () => {
  const { calls, fetch } = recordingFetch();
  const shipper = createClientLogShipper({ endpoint: "/e", fetch });
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const target: ClientLogTarget = Object.assign(new EventTarget(), { document });
  const uninstall = installClientLogHandlers(shipper, target);

  const error = new Error("render failed");
  target.dispatchEvent(Object.assign(new Event("error"), { message: "Uncaught Error: render failed", error }));
  target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: "plain string reason" }));
  target.dispatchEvent(new Event("pagehide"));
  assert.equal(calls.length, 1);
  const [uncaught, rejection] = calls[0]!.batch.events;
  assert.equal(uncaught!.kind, "uncaught_error");
  assert.equal(uncaught!.message, "render failed");
  assert.equal(uncaught!.stack, error.stack);
  assert.equal(rejection!.kind, "unhandled_rejection");
  assert.equal(rejection!.message, "plain string reason");

  target.dispatchEvent(Object.assign(new Event("error"), { message: "Script error.", error: null }));
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls.length, 1, "Turning visible sends nothing.");
  document.visibilityState = "hidden";
  document.dispatchEvent(new Event("visibilitychange"));
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.batch.events[0]!.message, "Script error.");

  uninstall();
  target.dispatchEvent(Object.assign(new Event("error"), { message: "after", error: null }));
  target.dispatchEvent(new Event("pagehide"));
  assert.equal(calls.length, 2);
});

test("capUtf8, pathOnly and errorDetails", () => {
  assert.equal(capUtf8("short", 10), "short");
  const cut = capUtf8("ab€".repeat(100), 40);
  assert.ok(new TextEncoder().encode(cut).length <= 40);
  assert.ok(cut.endsWith(TRUNCATION_MARKER));
  assert.ok(!cut.includes("�"), "No character is split.");
  assert.equal(pathOnly("/a/b?c=d#e"), "/a/b");
  assert.equal(pathOnly("/a#b?c"), "/a");
  assert.equal(errorDetails(new Error("x")).message, "x");
  assert.equal(errorDetails({ code: 7 }).message, '{"code":7}');
  assert.equal(errorDetails("").message, "(no message)");
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assert.equal(errorDetails(cyclic).message, "(unreadable error)");
});

test("The minute cap allows perMinute events a minute, and reports drops at most once a minute", () => {
  const cap = createClientLogMinuteCap(2);
  const at = (seconds: number) => new Date(Date.UTC(2026, 10, 4, 10, 0, seconds));
  assert.equal(cap.dropsToReport(at(0)), 0);
  assert.deepEqual([cap.allow(at(0)), cap.allow(at(1)), cap.allow(at(2)), cap.allow(at(3))], [true, true, false, false]);
  assert.equal(cap.dropsToReport(at(3)), 2);
  assert.equal(cap.allow(at(4)), false);
  assert.equal(cap.dropsToReport(at(4)), 0, "A second report in the same minute waits.");
  assert.equal(cap.allow(at(60)), true, "A new minute starts afresh.");
  assert.equal(cap.dropsToReport(at(63)), 1);
});
