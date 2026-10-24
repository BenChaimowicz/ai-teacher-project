import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildConsoleApp } from "./app.ts";
import type { BillingService } from "./billing.ts";
import type { OpsStore } from "./ops-store.ts";

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

describe("Health", () => {
  it("answers ok", async () => {
    const app = buildConsoleApp(fakeStore().store);
    assert.deepEqual((await app.inject({ method: "GET", url: "/api/ops/health" })).json(), { ok: true });
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
        provider: undefined,
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

describe("Billing check", () => {
  /** A billing service that records the ranges it was asked for. */
  function fakeBilling() {
    const calls: { method: string; range: unknown }[] = [];
    const body = { vendors: [], recordingStartedAt: null, snapshotEveryMs: 900_000 };
    const billing: BillingService = {
      billing: async (range) => (calls.push({ method: "billing", range }), body),
      refresh: async (range) => (calls.push({ method: "refresh", range }), body),
      takeSnapshots: async () => [],
      start: () => undefined,
      stop: () => undefined,
    };
    return { billing, calls };
  }

  it("answers GET /billing and POST /billing/refresh for the requested range", async () => {
    const { billing, calls } = fakeBilling();
    const app = buildConsoleApp(fakeStore().store, { now: () => NOW, billing });
    const range = "from=2026-10-20T00:00:00.000Z&to=2026-10-24T00:00:00.000Z";
    assert.equal((await app.inject({ method: "GET", url: "/api/ops/billing" })).statusCode, 200);
    const refreshed = await app.inject({ method: "POST", url: `/api/ops/billing/refresh?${range}` });
    assert.equal(refreshed.json().snapshotEveryMs, 900_000);
    assert.deepEqual(calls, [
      { method: "billing", range: { from: "2026-10-17T12:00:00.000Z", to: "2026-10-24T12:00:00.000Z" } },
      { method: "refresh", range: { from: "2026-10-20T00:00:00.000Z", to: "2026-10-24T00:00:00.000Z" } },
    ]);
  });

  it("404s without a billing service and 400s a bad range", async () => {
    assert.equal((await buildConsoleApp(fakeStore().store).inject({ method: "GET", url: "/api/ops/billing" })).statusCode, 404);
    const app = buildConsoleApp(fakeStore().store, { billing: fakeBilling().billing });
    assert.equal((await app.inject({ method: "POST", url: "/api/ops/billing/refresh?from=nope" })).statusCode, 400);
  });
});
