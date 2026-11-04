import assert from "node:assert/strict";
import { test } from "node:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Database } from "@senoy/db";
import { PRUNE_DEFAULTS, pruneLogEntries } from "./prune.ts";

/** Retention (ADR 0029, spec line 16): `info` after 7 days, `warn` and above after 30, in batches. */

const NOW = new Date("2026-11-04T12:00:00.000Z");

/**
 * A database stand-in for `execute`: renders each statement and answers with as many deleted rows as `deleted` says.
 * @param deleted - Rows each successive statement deletes; `undefined` past the end means none
 */
function fakeDb(deleted: number[]) {
  const dialect = new PgDialect();
  const statements: { sql: string; params: unknown[] }[] = [];
  const db = {
    async execute(query: SQL) {
      const rendered = dialect.sqlToQuery(query);
      statements.push(rendered);
      const count = deleted[statements.length - 1] ?? 0;
      return Array.from({ length: count }, (_, index) => ({ id: String(index) }));
    },
  };
  return { db: db as unknown as Database, statements };
}

test("info rows go after 7 days and warn-and-above rows after 30, each in batches with skip locked", async () => {
  const { db, statements } = fakeDb([3, 0, 1]);
  const result = await pruneLogEntries(db, { now: NOW, batchSize: 3 });
  assert.deepEqual(result, { info: 3, warnAndAbove: 1 });
  // info: one full batch, then one empty one; warn+: one short batch.
  assert.equal(statements.length, 3);
  const [info, , warn] = statements;
  assert.match(info!.sql, /delete from "log_entries" where "log_entries"\."id" in \(\s*select "log_entries"\."id" from "log_entries"/);
  assert.match(info!.sql, /"log_entries"\."level" = 'info'/);
  assert.match(info!.sql, /for update skip locked/);
  assert.deepEqual(info!.params, ["2026-10-28T12:00:00.000Z", 3]);
  assert.match(warn!.sql, /"log_entries"\."level" >= 'warn'/);
  assert.deepEqual(warn!.params, ["2026-10-05T12:00:00.000Z", 3]);
});

test("A group stops after maxBatches full batches; the rest waits for the next hour", async () => {
  const { db, statements } = fakeDb([2, 2, 2, 2, 2]);
  const result = await pruneLogEntries(db, { now: NOW, batchSize: 2, maxBatches: 2 });
  assert.deepEqual(result, { info: 4, warnAndAbove: 4 });
  assert.equal(statements.length, 4);
});

test("The defaults are 5,000 rows a batch", async () => {
  const { db, statements } = fakeDb([]);
  await pruneLogEntries(db, { now: NOW });
  assert.equal(statements[0]!.params[1], PRUNE_DEFAULTS.batchSize);
});

test("A failed delete throws with the group and what was already deleted", async () => {
  let calls = 0;
  const db = { async execute() {
    calls += 1;
    if (calls === 1) return [{ id: "1" }];
    throw new Error("connection reset");
  } } as unknown as Database;
  await assert.rejects(pruneLogEntries(db, { now: NOW, batchSize: 1 }),
    /\[prune\.ts: pruneLogEntries\] Failed to delete expired Log Entries \|\| group=info \|\| deleted=1 \|\| connection reset/);
});
