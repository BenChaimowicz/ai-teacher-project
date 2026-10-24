import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildConsoleApp } from "./app.ts";
import type { OpsStore } from "./ops-store.ts";

const KEY = "operator-secret";
const NOW = new Date("2026-10-24T12:00:00.000Z");
const ID = "0b8c2a52-7a52-4c3e-9a3c-2f1e5b0d9a11";

/**
 * A store that records what each route asked for and answers with empty results.
 * @param overrides - Methods to replace
 * @returns The fake and the log of calls
 */
function fakeStore(overrides: Partial<OpsStore> = {}) {
  const calls: { method: string; arg: unknown }[] = [];
  const page = { rows: [], total: 0 };
  const record = <T>(method: string, value: T) => async (arg: unknown) => {
    calls.push({ method, arg });
    return value;
  };
  const store: OpsStore = {
    summary: record("summary", {} as never),
    listUsageRecords: record("listUsageRecords", page),
    getUsageRecord: record("getUsageRecord", null),
    listPipelineEvents: record("listPipelineEvents", page),
    getPipelineEvent: record("getPipelineEvent", null),
    listCourseRequests: record("listCourseRequests", page),
    getCourseRequest: record("getCourseRequest", null),
    listFailures: record("listFailures", []),
    listProductEvents: record("listProductEvents", page),
    listApiRequests: record("listApiRequests", page),
    listApiRoutes: record("listApiRoutes", []),
    ...overrides,
  };
  return { store, calls };
}

describe("Operator gate", () => {
  it("rejects /api/ops/* without the key, or with a wrong one, when OPERATOR_KEY is set", async () => {
    const app = buildConsoleApp(fakeStore().store, { operatorKey: KEY });
    const missing = await app.inject({ method: "GET", url: "/api/ops/summary" });
    assert.equal(missing.statusCode, 401);
    assert.equal(typeof missing.json().error, "string");
    const wrong = await app.inject({ method: "GET", url: "/api/ops/usage-records", headers: { "x-operator-key": "nope" } });
    assert.equal(wrong.statusCode, 401);
    const prefix = await app.inject({ method: "GET", url: "/api/ops/failures", headers: { "x-operator-key": KEY.slice(0, 5) } });
    assert.equal(prefix.statusCode, 401, "A prefix of the key is not the key.");
  });

  it("lets the right key through", async () => {
    const app = buildConsoleApp(fakeStore().store, { operatorKey: KEY });
    const response = await app.inject({ method: "GET", url: "/api/ops/api-routes", headers: { "x-operator-key": KEY } });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), []);
  });

  it("is open when OPERATOR_KEY is unset or empty", async () => {
    for (const operatorKey of [undefined, ""]) {
      const app = buildConsoleApp(fakeStore().store, { operatorKey });
      assert.equal((await app.inject({ method: "GET", url: "/api/ops/failures" })).statusCode, 200);
    }
  });

  it("answers health without the key and says whether the gate is on", async () => {
    const gated = buildConsoleApp(fakeStore().store, { operatorKey: KEY });
    const health = await gated.inject({ method: "GET", url: "/api/ops/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { ok: true, gated: true });
    const open = buildConsoleApp(fakeStore().store);
    assert.deepEqual((await open.inject({ method: "GET", url: "/api/ops/health" })).json(), { ok: true, gated: false });
  });
});

describe("Query validation", () => {
  const app = buildConsoleApp(fakeStore().store, { now: () => NOW });
  const bad = [
    "/api/ops/usage-records?vendor=anthropic",
    "/api/ops/usage-records?outcome=meh",
    "/api/ops/usage-records?sort=tokens",
    "/api/ops/usage-records?courseRequestId=not-a-uuid",
    "/api/ops/usage-records?pipelineEventId=123",
    "/api/ops/usage-records?limit=0",
    "/api/ops/usage-records?limit=ten",
    "/api/ops/usage-records?offset=-1",
    "/api/ops/usage-records?vendor=you&vendor=parallel",
    "/api/ops/summary?from=yesterday",
    "/api/ops/summary?from=2026-10-24T00:00:00Z&to=2026-10-23T00:00:00Z",
    "/api/ops/pipeline-events?status=done",
    "/api/ops/pipeline-events?kind=lesson",
    "/api/ops/product-events?kind=clicked",
    "/api/ops/api-requests?errorsOnly=maybe",
    "/api/ops/usage-records/abc",
    "/api/ops/pipeline-events/abc",
    "/api/ops/course-requests/abc",
  ];
  for (const url of bad) {
    it(`400s ${url}`, async () => {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 400);
      assert.equal(typeof response.json().error, "string");
    });
  }

  it("passes checked filters with defaults to the store", async () => {
    const { store, calls } = fakeStore();
    const local = buildConsoleApp(store, { now: () => NOW });
    const response = await local.inject({
      method: "GET",
      url: `/api/ops/usage-records?outcome=failed&vendor=openrouter&courseRequestId=${ID.toUpperCase()}&limit=9999&q=%20gpt%20`,
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(calls[0], {
      method: "listUsageRecords",
      arg: {
        from: "2026-10-17T12:00:00.000Z",
        to: "2026-10-24T12:00:00.000Z",
        limit: 500,
        offset: 0,
        vendor: "openrouter",
        role: undefined,
        modelId: undefined,
        outcome: "failed",
        pipelineKind: undefined,
        pipelineEventId: undefined,
        courseRequestId: ID,
        q: "gpt",
        sort: "createdAt",
      },
    });
  });
});

describe("Responses", () => {
  it("404s a detail id that does not exist", async () => {
    const app = buildConsoleApp(fakeStore().store);
    for (const path of ["usage-records", "pipeline-events", "course-requests"]) {
      const response = await app.inject({ method: "GET", url: `/api/ops/${path}/${ID}` });
      assert.equal(response.statusCode, 404);
    }
  });

  it("500s without leaking the database error", async () => {
    const { store } = fakeStore({
      listFailures: async () => {
        throw new Error('relation "usage_records" does not exist');
      },
    });
    const app = buildConsoleApp(store);
    const response = await app.inject({ method: "GET", url: "/api/ops/failures" });
    assert.equal(response.statusCode, 500);
    assert.doesNotMatch(response.body, /relation|usage_records/);
  });
});
