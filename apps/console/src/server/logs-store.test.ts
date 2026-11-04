import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SqlRow } from "./format.ts";
import { createLogsStore, logEntryListQuery } from "./logs-store.ts";
import { parseLogQuery } from "./query.ts";

const dialect = new PgDialect();
const NOW = new Date("2026-11-04T12:00:00.000Z");
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

describe("Log Entry list SQL", () => {
  it("is always bounded by time and newest first", () => {
    const { sql: text, params } = dialect.sqlToQuery(logEntryListQuery(parseLogQuery({}, NOW)));
    assert.match(text, /l\.logged_at >= \$1::timestamptz and l\.logged_at < \$2::timestamptz/);
    assert.match(text, /order by l\.logged_at desc, l\.id desc/);
    assert.equal(params[0], "2026-10-28T12:00:00.000Z");
  });

  it("binds every filter as a parameter and reads the level as a minimum", () => {
    const filter = parseLogQuery(
      { component: "worker", level: "warn", requestId: ID, jobId: ID, courseRequestId: ID, learnerId: ID, q: "100%_x" },
      NOW,
    );
    const { sql: text, params } = dialect.sqlToQuery(logEntryListQuery(filter));
    assert.match(text, /l\.level >= \$\d+::log_level/);
    assert.match(text, /l\.request_id = /);
    assert.match(text, /l\.generation_job_id = /);
    assert.match(text, /l\.course_request_id = /);
    assert.match(text, /l\.learner_id = /);
    assert.match(text, /l\.message ilike/);
    assert.ok(params.includes("worker"));
    assert.ok(params.includes("warn"));
    assert.ok(params.includes("%100\\%\\_x%"));
    assert.doesNotMatch(text, /100%/);
  });

  it("matches a Pipeline Event and every step under it", () => {
    const { sql: text } = dialect.sqlToQuery(logEntryListQuery(parseLogQuery({ pipelineEventId: ID }, NOW)));
    assert.match(text, /with recursive subtree/);
    assert.match(text, /l\.pipeline_event_id in/);
  });
});

describe("Logs store", () => {
  it("returns an empty page with a zero total", async () => {
    const { run } = fakeRunner((text) => (text.includes("count(*)") ? [{ total: "0" }] : []));
    assert.deepEqual(await createLogsStore(run).list(parseLogQuery({}, NOW)), { rows: [], total: 0 });
  });

  it("maps a row and counts with the same where", async () => {
    const { run, queries } = fakeRunner((text) =>
      text.includes("count(*)")
        ? [{ total: "12" }]
        : [{
            id: ID, loggedAt: new Date("2026-11-04T10:15:02.481Z"), component: "worker", level: "error", message: "boom",
            context: { name: "worker" }, requestId: ID, jobId: null, courseRequestId: ID, learnerId: null, pipelineEventId: null,
          }],
    );
    const page = await createLogsStore(run).list(parseLogQuery({ component: "worker" }, NOW));
    assert.equal(page.total, 12);
    assert.deepEqual(page.rows[0], {
      id: ID, loggedAt: "2026-11-04T10:15:02.481Z", component: "worker", level: "error", message: "boom",
      context: { name: "worker" }, requestId: ID, jobId: null, courseRequestId: ID, learnerId: null, pipelineEventId: null,
    });
    assert.equal(queries.length, 2);
    assert.match(queries[1].sql, /from log_entries l where .*l\.component = /s);
  });

  it("returns a null context for a null column", async () => {
    const { run } = fakeRunner((text) =>
      text.includes("count(*)") ? [{ total: "1" }] : [{ id: ID, loggedAt: "2026-11-04 10:00:00+00", component: "api", level: "info", message: "m", context: null }],
    );
    const page = await createLogsStore(run).list(parseLogQuery({}, NOW));
    assert.equal(page.rows[0].context, null);
    assert.equal(page.rows[0].requestId, null);
  });
});
