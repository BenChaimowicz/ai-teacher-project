import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SqlRow } from "./format.ts";
import { createOpsStore, usageRecordListQuery } from "./ops-store.ts";
import { parseUsageRecordQuery } from "./query.ts";

const dialect = new PgDialect();
const NOW = new Date("2026-10-24T12:00:00.000Z");
const RANGE = { from: "2026-10-17T12:00:00.000Z", to: "2026-10-24T12:00:00.000Z" };
const ID = "0b8c2a52-7a52-4c3e-9a3c-2f1e5b0d9a11";

/**
 * A SQL runner that renders each query, keeps it, and answers from `answer`.
 * @param answer - Rows to return for a rendered query (default none)
 * @returns The runner and the rendered queries
 */
function fakeRunner(answer: (text: string) => SqlRow[] = () => []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const run = async (query: SQL) => {
    const rendered = dialect.sqlToQuery(query);
    queries.push(rendered);
    return answer(rendered.sql);
  };
  return { run, queries };
}

describe("Usage Record list SQL", () => {
  it("never selects the payload columns", () => {
    const { sql: text } = dialect.sqlToQuery(usageRecordListQuery(parseUsageRecordQuery({}, NOW)));
    assert.doesNotMatch(text, /u\.request|u\.response\b/);
  });

  it("binds every filter value as a parameter", () => {
    const filter = parseUsageRecordQuery(
      { vendor: "you", outcome: "failed", q: "it's 100%", pipelineEventId: ID, sort: "costUsd" },
      NOW,
    );
    const { sql: text, params } = dialect.sqlToQuery(usageRecordListQuery(filter));
    assert.match(text, /u\.outcome <> 'ok'/);
    assert.match(text, /with recursive subtree/);
    assert.match(text, /order by u\.cost_usd desc nulls last/);
    assert.ok(params.includes("you"));
    assert.ok(params.includes("%it's 100\\%%"));
    assert.doesNotMatch(text, /it's/);
  });

  it("returns a page with a numeric total", async () => {
    const { run, queries } = fakeRunner((text) => (text.includes("count(*) as total") ? [{ total: "7" }] : []));
    const page = await createOpsStore(run).listUsageRecords(parseUsageRecordQuery({}, NOW));
    assert.deepEqual(page, { rows: [], total: 7 });
    assert.equal(queries.length, 2);
  });
});

describe("Usage Record detail", () => {
  it("is null when the id is unknown", async () => {
    const { run } = fakeRunner();
    assert.equal(await createOpsStore(run).getUsageRecord(ID), null);
  });

  it("selects payloads only here and walks up the event path", async () => {
    const { run, queries } = fakeRunner((text) => {
      if (text.includes("u.request")) {
        return [{
          id: ID, createdAt: "2026-10-24 10:00:00+00", vendor: "openrouter", role: "judge", modelId: "m", attempt: 1,
          outcome: "ok", costBasis: "actual", pipelineEventId: "e1", request: { schemaName: "s" }, response: null,
        }];
      }
      return [];
    });
    const detail = await createOpsStore(run).getUsageRecord(ID);
    assert.deepEqual(detail?.request, { schemaName: "s" });
    assert.deepEqual(detail?.pipelinePath, []);
    assert.ok(queries.some((query) => /with recursive up/.test(query.sql)));
  });
});

describe("summary", () => {
  it("assembles the Overview from its queries", async () => {
    const { run } = fakeRunner((text) => {
      if (text.includes('"p50DurationMs"')) {
        return [{ actualUsd: 1.5, estimatedUsd: "0.5", unknownCount: "1", calls: "10", failedCalls: "2", promptTokens: "100",
          completionTokens: "50", reasoningTokens: "0", p50DurationMs: 1200.4, p95DurationMs: null }];
      }
      if (text.includes('"courseRequests"')) return [{ courseRequests: "3", apiErrors: "1" }];
      if (text.includes("date_trunc")) {
        return [{ bucket: "2026-10-23 00:00:00+00", key: "m", costUsd: "2", calls: "10", failedCalls: "2" }];
      }
      if (text.includes("case when u.duration_ms <= 1000")) return [{ bucket: 1, calls: "4" }];
      return [];
    });
    const summary = await createOpsStore(run).summary(RANGE);
    assert.deepEqual(summary.range, { ...RANGE, bucket: "day" });
    assert.equal(summary.totals.totalUsd, 2);
    assert.equal(summary.totals.calls, 10);
    assert.equal(summary.totals.p50DurationMs, 1200);
    assert.equal(summary.totals.p95DurationMs, null);
    assert.equal(summary.totals.courseRequests, 3);
    assert.equal(summary.totals.productEvents, 0);
    assert.deepEqual(summary.previous, { totalUsd: 0, calls: 0, failedCalls: 0 });
    assert.deepEqual(summary.timeseries, [{ bucket: "2026-10-23T00:00:00.000Z", key: "m", costUsd: 2, calls: 10, failedCalls: 2 }]);
    assert.deepEqual(summary.latencyHistogram[1], { upToMs: 5000, calls: 4 });
  });
});

describe("failures", () => {
  it("formats reasons from raw groups and merges them", async () => {
    const { run } = fakeRunner((text) => {
      if (text.includes("from usage_records u")) {
        return [
          { outcome: "http", invalidCause: null, httpStatus: 429, key: "m", count: "2", lastAt: "2026-10-24 10:00:00+00", wastedUsd: 0, sampleIds: ["a", "b"] },
          { outcome: "invalid_output", invalidCause: "schema", httpStatus: 200, key: "m", count: "5", lastAt: "2026-10-24 09:00:00+00", wastedUsd: "0.3", sampleIds: ["c"] },
        ];
      }
      if (text.includes("from pipeline_events pe")) {
        return [{ key: "reading", error: "Generator gave up", count: "1", lastAt: "2026-10-24 08:00:00+00", sampleIds: "[\"e\"]" }];
      }
      if (text.includes("from api_requests a")) {
        return [{ key: "/api/course-requests", status: 502, count: "1", lastAt: "2026-10-24 07:00:00+00", sampleIds: ["r"] }];
      }
      return [];
    });
    const groups = await createOpsStore(run).listFailures(RANGE);
    assert.deepEqual(groups.map((group) => [group.source, group.reason, group.count]), [
      ["usage_record", "invalid_output/schema", 5],
      ["usage_record", "http 429", 2],
      ["pipeline_event", "Generator gave up", 1],
      ["api_request", "http 502", 1],
    ]);
    assert.deepEqual(groups[2]!.sampleIds, ["e"]);
  });
});
