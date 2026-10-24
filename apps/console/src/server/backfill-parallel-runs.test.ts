import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { backfillRow, type ParallelRun, type StoredPack } from "./backfill-parallel-runs.ts";

const pack: StoredPack = {
  slot: "primary", adapter: "parallel-pro", topic: "Pacific currents", status: "timed_out", startedAt: "2026-10-19T04:01:37Z",
  latencyMs: 600_000, vendorRequestId: "trun_1", vendorSummary: null, sources: [],
};
const run: ParallelRun = { run_id: "trun_1", status: "completed", processor: "pro", created_at: "2026-10-19T04:01:37.952Z", modified_at: "2026-10-19T04:05:19.305Z" };

describe("Parallel run backfill", () => {
  it("bills a completed run at list price even when our client timed out, and keeps Parallel's timing", () => {
    const row = backfillRow(pack, run, "event-1");
    assert.deepEqual([row.outcome, row.costUsd, row.costBasis, row.origin, row.responseId, row.durationMs], ["timeout", 0.1, "estimated", "backfill", "trun_1", 221_353]);
    assert.equal((row.createdAt as Date).toISOString(), "2026-10-19T04:05:19.305Z");
  });

  it("bills nothing for a run Parallel says failed", () => {
    const row = backfillRow({ ...pack, status: "error" }, { ...run, status: "failed" }, "event-1");
    assert.deepEqual([row.outcome, row.costUsd], ["error", 0]);
    assert.match(row.measurementNote ?? "", /not billed/);
  });
});
