import assert from "node:assert/strict";
import { test } from "node:test";
import { liveCheckSink, usageDatabaseUrl } from "./live-check-tracking.ts";
import { installUsageTracking, recordProductEvent, recordUsage, vendorUsageRow, withPipelineEvent, type PipelineEventStart, type UsageSink } from "./usage-tracking.ts";

/** An in-memory sink that keeps what it was given. */
function memorySink() {
  const events: PipelineEventStart[] = [];
  const usage: { pipelineEventId: string | null; vendor: string }[] = [];
  const product: unknown[] = [];
  const sink: UsageSink = {
    async startPipelineEvent(row) {
      events.push(row);
      return `event${events.length}`;
    },
    async finishPipelineEvent() {},
    async insertUsageRecord(row) {
      usage.push(row);
    },
    async setUsageMeasurement() {},
    async insertProductEvent(row) {
      product.push(row);
    },
    async insertApiRequest() {},
  };
  return { sink, events, usage, product };
}

/** One estimated research call, as a live check's would be recorded. */
const researchCall = vendorUsageRow({
  adapter: { id: "you-research", timeoutMs: 1000, estimatedCostUsd: 0.05 },
  role: "research_primary",
  topic: "Yggdrasil",
  status: "ok",
  responseId: null,
  error: null,
  response: null,
  durationMs: 10,
});

test("a live check's calls are stored under its live_check event, without the rolled-back Course Request or Learner", async () => {
  const memory = memorySink();
  const uninstall = installUsageTracking({ sink: liveCheckSink(memory.sink), log: { error() {} } });
  try {
    await withPipelineEvent("live_check", { label: "check:validity:live" }, () =>
      withPipelineEvent("validity", { courseRequestId: "rolled-back-request", learnerId: "rolled-back-learner" }, async () => {
        await recordUsage(researchCall);
        await recordProductEvent("course_request_created", { learnerId: "rolled-back-learner", courseRequestId: "rolled-back-request" });
      }));
  } finally {
    uninstall();
  }
  assert.deepEqual(memory.events.map(({ kind, label, parentId, courseRequestId, learnerId }) => ({ kind, label, parentId, courseRequestId, learnerId })), [
    { kind: "live_check", label: "check:validity:live", parentId: null, courseRequestId: null, learnerId: null },
    { kind: "validity", label: null, parentId: "event1", courseRequestId: null, learnerId: null },
  ]);
  assert.deepEqual(memory.usage.map(({ pipelineEventId, vendor }) => ({ pipelineEventId, vendor })), [{ pipelineEventId: "event2", vendor: "you" }]);
  assert.deepEqual(memory.product, []);
});

test("live checks record usage only in a shared database, never a local one", () => {
  const shared = "postgresql://postgres.ref:pw@aws-1-eu-central-1.pooler.supabase.com:6543/postgres";
  assert.equal(usageDatabaseUrl({ USAGE_DATABASE_URL: ` ${shared} ` }), shared);
  assert.throws(() => usageDatabaseUrl({}), /USAGE_DATABASE_URL is required/);
  for (const local of ["postgres://postgres:pw@127.0.0.1:54329/senoy", "postgres://postgres@localhost/senoy"]) {
    assert.throws(() => usageDatabaseUrl({ USAGE_DATABASE_URL: local }), /must be the shared database/);
  }
  assert.throws(() => usageDatabaseUrl({ USAGE_DATABASE_URL: "not a url" }), /is not a URL/);
});
