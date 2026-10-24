import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeLike,
  mergeFailureGroups,
  pipelineFailureReason,
  toCostSplit,
  toIso,
  toLatencyHistogram,
  toMs,
  toNumber,
  toPipelineEventRow,
  toUsageRecordRow,
  usageFailureReason,
} from "./format.ts";

describe("toIso", () => {
  it("reads Postgres timestamptz text, cutting microseconds", () => {
    assert.equal(toIso("2026-10-24 10:15:30.123456+00"), "2026-10-24T10:15:30.123Z");
    assert.equal(toIso("2026-10-24 13:15:30+03"), "2026-10-24T10:15:30.000Z");
    assert.equal(toIso("2026-10-24 10:15:30.5+05:30"), "2026-10-24T04:45:30.500Z");
    assert.equal(toIso("2026-10-24 10:15:30"), "2026-10-24T10:15:30.000Z");
  });

  it("passes Dates and ISO strings through", () => {
    assert.equal(toIso(new Date("2026-10-24T10:00:00Z")), "2026-10-24T10:00:00.000Z");
    assert.equal(toIso("2026-10-24T10:00:00.000Z"), "2026-10-24T10:00:00.000Z");
  });

  it("throws on garbage", () => {
    assert.throws(() => toIso("soon"));
    assert.throws(() => toIso(null));
  });
});

describe("numbers", () => {
  it("reads bigint/numeric strings and treats null as zero", () => {
    assert.equal(toNumber("42"), 42);
    assert.equal(toNumber("0.0125"), 0.0125);
    assert.equal(toNumber(null), 0);
  });

  it("rounds durations and keeps null", () => {
    assert.equal(toMs("1234.6"), 1235);
    assert.equal(toMs(null), null);
  });

  it("splits cost and totals actual plus estimated", () => {
    assert.deepEqual(toCostSplit({ actualUsd: "0.5", estimatedUsd: 0.25, unknownCount: "3" }), {
      actualUsd: 0.5,
      estimatedUsd: 0.25,
      totalUsd: 0.75,
      unknownCount: 3,
    });
  });
});

describe("failure reasons", () => {
  it("names usage failures", () => {
    assert.equal(usageFailureReason({ outcome: "http", invalidCause: null, httpStatus: 429 }), "http 429");
    assert.equal(usageFailureReason({ outcome: "http", invalidCause: null, httpStatus: null }), "http");
    assert.equal(usageFailureReason({ outcome: "invalid_output", invalidCause: "schema", httpStatus: 200 }), "invalid_output/schema");
    assert.equal(usageFailureReason({ outcome: "refusal", invalidCause: null, httpStatus: 200 }), "refusal");
    assert.equal(usageFailureReason({ outcome: "timeout", invalidCause: null, httpStatus: null }), "timeout");
  });

  it("takes the first line of a pipeline error and truncates it", () => {
    assert.equal(pipelineFailureReason("Boom\n    at stack"), "Boom");
    assert.equal(pipelineFailureReason("\n  \nSecond\n"), "Second");
    assert.equal(pipelineFailureReason(null), "failed");
    const long = pipelineFailureReason("x".repeat(300));
    assert.equal(long.length, 120);
    assert.ok(long.endsWith("…"));
  });

  it("merges groups that format to the same reason and sorts by count", () => {
    const merged = mergeFailureGroups([
      { source: "usage_record", reason: "http 429", key: "m", count: 1, lastAt: "2026-10-01T00:00:00.000Z", wastedUsd: 0.25, sampleIds: ["a"] },
      { source: "pipeline_event", reason: "Boom", key: "reading", count: 3, lastAt: "2026-10-02T00:00:00.000Z", wastedUsd: 0, sampleIds: ["p"] },
      { source: "usage_record", reason: "http 429", key: "m", count: 4, lastAt: "2026-10-03T00:00:00.000Z", wastedUsd: 0.5, sampleIds: ["b", "c"] },
    ]);
    assert.equal(merged.length, 2);
    assert.deepEqual(merged[0], {
      source: "usage_record",
      reason: "http 429",
      key: "m",
      count: 5,
      lastAt: "2026-10-03T00:00:00.000Z",
      wastedUsd: 0.75,
      sampleIds: ["b", "c", "a"],
    });
    assert.equal(merged[1]!.reason, "Boom");
  });
});

describe("row mapping", () => {
  it("fills the latency histogram including the open bucket", () => {
    const histogram = toLatencyHistogram([{ bucket: "0", calls: "2" }, { bucket: 7, calls: "1" }]);
    assert.equal(histogram.length, 8);
    assert.deepEqual(histogram[0], { upToMs: 1000, calls: 2 });
    assert.deepEqual(histogram[1], { upToMs: 5000, calls: 0 });
    assert.deepEqual(histogram[7], { upToMs: null, calls: 1 });
  });

  it("maps a usage record row", () => {
    const row = toUsageRecordRow({
      id: "u1", createdAt: "2026-10-24 10:00:00+00", durationMs: 1500, vendor: "openrouter", role: "generator",
      modelId: "m", provider: null, responseId: "r", attempt: 2, outcome: "ok", invalidCause: null, httpStatus: 200,
      error: null, promptTokens: 10, completionTokens: 20, reasoningTokens: null, cachedTokens: 0, costUsd: 0.01,
      costBasis: "actual", pipelineEventId: null, pipelineKind: null, pipelineLabel: null, courseRequestId: null,
      courseRequestSubject: null,
    });
    assert.equal(row.createdAt, "2026-10-24T10:00:00.000Z");
    assert.equal(row.attempt, 2);
    assert.equal(row.reasoningTokens, null);
    assert.equal(row.pipelineKind, null);
    assert.ok(!("request" in row) && !("response" in row));
  });

  it("maps a pipeline event row with no Usage Records under it to zero spend", () => {
    const row = toPipelineEventRow({
      id: "e1", parentId: null, kind: "reading", label: "L1", status: "running", error: null,
      startedAt: "2026-10-24 10:00:00+00", finishedAt: null, durationMs: null, courseRequestId: "c1",
      courseRequestSubject: "Rust", actualUsd: null, estimatedUsd: null, unknownCount: null, calls: null, failedCalls: null,
    });
    assert.equal(row.finishedAt, null);
    assert.equal(row.totalUsd, 0);
    assert.equal(row.calls, 0);
  });

  it("escapes LIKE wildcards", () => {
    assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
  });
});
