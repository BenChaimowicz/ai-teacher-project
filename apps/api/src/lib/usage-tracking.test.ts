import assert from "node:assert/strict";
import { test } from "node:test";
import type { ResearchCallObservation, SourcePack } from "@senoy/research";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts } from "./model-ports.ts";
import { ModelError, type StructuredRequest } from "./openrouter.ts";
import {
  createTrackedTransport,
  installUsageTracking,
  recordApiRequest,
  recordProductEvent,
  recordUsage,
  researchUsageRow,
  withPipelineEvent,
  type PipelineEventFinish,
  type PipelineEventStart,
  type UsageRecordRow,
  type UsageSink,
} from "./usage-tracking.ts";

/** A recorded Pipeline Event: its start row, and its finish once it ended. */
type StoredEvent = PipelineEventStart & { id: string; finish?: PipelineEventFinish };

/** An in-memory sink; `failing` makes every write throw. */
function fakeSink(failing = false) {
  const events: StoredEvent[] = [];
  const usage: (UsageRecordRow & { id?: string; pipelineEventId: string | null })[] = [];
  const measurements: { id: string; measuredCostUsd: number | null; measurementNote: string }[] = [];
  const product: unknown[] = [];
  const api: unknown[] = [];
  const fail = () => {
    if (failing) throw new Error("database is down");
  };
  const sink: UsageSink = {
    async startPipelineEvent(row) {
      fail();
      const id = `event${events.length + 1}`;
      events.push({ ...row, id });
      return id;
    },
    async finishPipelineEvent(id, row) {
      fail();
      events.find((event) => event.id === id)!.finish = row;
    },
    async insertUsageRecord(row) {
      fail();
      usage.push(row);
    },
    async setUsageMeasurement(id, measurement) {
      fail();
      measurements.push({ id, ...measurement });
    },
    async insertProductEvent(row) {
      fail();
      product.push(row);
    },
    async insertApiRequest(row) {
      fail();
      api.push(row);
    },
  };
  return { sink, events, usage, measurements, product, api };
}

/** A log that keeps every error line. */
function fakeLog() {
  const errors: string[] = [];
  return { errors, log: { error: (message: string) => void errors.push(message) } };
}

/**
 * Installs a fake sink for one test and removes it afterwards.
 * @param failing - Make every write throw
 * @param run - The test body
 */
async function withTracking(failing: boolean, run: (fake: ReturnType<typeof fakeSink> & { errors: string[] }) => Promise<void>) {
  const fake = fakeSink(failing);
  const { errors, log } = fakeLog();
  const uninstall = installUsageTracking({ sink: fake.sink, log });
  try {
    await run({ ...fake, errors });
  } finally {
    uninstall();
  }
}

const REQUEST: StructuredRequest<number> = {
  systemPrompt: "Score it.",
  input: { content: "A document." },
  schemaName: "score",
  schema: { type: "object", required: ["score"], additionalProperties: false, properties: { score: { type: "number" } } },
  parse: (raw) => {
    const score = (raw as { score?: unknown } | null)?.score;
    if (typeof score !== "number") throw new Error("bad score");
    return score;
  },
};

/** An OpenRouter body with usage, whose content is `content`. */
function completion(content: string, cost = 0.0123) {
  return {
    id: "gen-1",
    provider: "Alibaba",
    choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
    usage: {
      prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, cost,
      prompt_tokens_details: { cached_tokens: 40 }, completion_tokens_details: { reasoning_tokens: 7 },
    },
  };
}

/** A fetch answering each call with the next body in `bodies` (status 200 unless given). */
function sequenceFetch(bodies: { body: unknown; status?: number }[]): typeof fetch {
  let call = 0;
  return async () => {
    const next = bodies[call++]!;
    return new Response(typeof next.body === "string" ? next.body : JSON.stringify(next.body), { status: next.status ?? 200 });
  };
}

const CONFIG = { ...loadModelConfig({}), generatorModel: "fixture/author", generatorFallbackModel: "fixture/fallback", judgeModel: "fixture/judge" };

test("Before install every tracking call is a no-op and the step still runs", async () => {
  const value = await withPipelineEvent("validity", {}, async (event) => {
    event.setDetail({ ignored: true });
    await recordUsage({ vendor: "openrouter", role: "generator", modelId: "m", outcome: "ok", costBasis: "actual", request: {} });
    await recordProductEvent("course_request_created", { learnerId: null });
    await recordApiRequest({ method: "GET", route: "/api/x", url: "/api/x", statusCode: 200, durationMs: 1 });
    return event.id;
  });
  assert.equal(value, null);
});

test("Pipeline Events nest, inherit the Request and Learner, and own the Usage Records made inside them", async () => {
  await withTracking(false, async ({ events, usage }) => {
    await withPipelineEvent("course_generation", { label: "Norse", courseRequestId: "req1", learnerId: "learner1", detail: { a: 1 } }, async (outer) => {
      outer.setDetail({ b: 2 });
      // Two concurrent children keep their own context.
      await Promise.all(["Slot A", "Slot B"].map((label) => withPipelineEvent("research", { label }, async () => {
        await recordUsage({ vendor: "parallel", role: "research_primary", modelId: label, outcome: "ok", costBasis: "estimated", request: {} });
      })));
    });
    const [outer, first, second] = events;
    assert.equal(outer!.parentId, null);
    assert.deepEqual(outer!.finish!.detail, { a: 1, b: 2 });
    assert.equal(outer!.finish!.status, "ok");
    for (const child of [first!, second!]) {
      assert.equal(child.parentId, outer!.id);
      assert.equal(child.courseRequestId, "req1");
      assert.equal(child.learnerId, "learner1");
      assert.equal(child.finish!.status, "ok");
    }
    assert.equal(usage.find((row) => row.modelId === "Slot A")!.pipelineEventId, events.find((event) => event.label === "Slot A")!.id);
    assert.equal(usage.find((row) => row.modelId === "Slot B")!.pipelineEventId, events.find((event) => event.label === "Slot B")!.id);
  });
});

test("A failed step is recorded as failed and its original error is rethrown untouched", async () => {
  await withTracking(false, async ({ events }) => {
    const original = new Error("[reading: generate] Reading failed");
    await assert.rejects(withPipelineEvent("reading", { courseRequestId: "req1" }, async () => {
      throw original;
    }), (error) => error === original);
    assert.equal(events[0]!.finish!.status, "failed");
    assert.equal(events[0]!.finish!.error, original.message);
    assert.ok(events[0]!.finish!.durationMs >= 0);
  });
});

test("Tracking write failures are logged and never fail the step", async () => {
  await withTracking(true, async ({ errors }) => {
    const value = await withPipelineEvent("diagnostic", { courseRequestId: "req1" }, async (event) => {
      assert.equal(event.id, null);
      await recordUsage({ vendor: "openrouter", role: "judge", modelId: "m", outcome: "ok", costBasis: "actual", request: {} });
      await recordProductEvent("diagnostic_submitted", { learnerId: "learner1" });
      await recordApiRequest({ method: "GET", route: "/api/x", url: "/api/x", statusCode: 200, durationMs: 1 });
      return 42;
    });
    assert.equal(value, 42);
    assert.equal(errors.length, 4);
    assert.match(errors[0]!, /^\[usage-tracking: withPipelineEvent\] Tracking write failed \|\| kind=diagnostic .* \|\| database is down$/);
  });
});

test("A billed reply that fails validation is recorded with its actual cost, then the retry, with role and attempt", async () => {
  await withTracking(false, async ({ usage }) => {
    const transport = createTrackedTransport({
      apiKey: "secret-key",
      fetch: sequenceFetch([{ body: completion("not json") }, { body: completion('{"score":0.5}', 0.02) }]),
    });
    const { generator } = createModelPorts({ config: CONFIG, transport, log: { warn: () => {} } });
    const reply = await withPipelineEvent("validity", {}, () => generator.generateStructured(REQUEST));
    assert.equal(reply.value, 0.5);
    const [bad, good] = usage;
    assert.equal(bad!.outcome, "invalid_output");
    assert.equal(bad!.invalidCause, "unparseable");
    assert.equal(bad!.attempt, 1);
    assert.equal(bad!.role, "generator");
    assert.equal(bad!.costBasis, "actual");
    assert.equal(bad!.costUsd, 0.0123);
    assert.equal(bad!.promptTokens, 100);
    assert.equal(bad!.completionTokens, 20);
    assert.equal(bad!.cachedTokens, 40);
    assert.equal(bad!.reasoningTokens, 7);
    assert.equal(bad!.provider, "Alibaba");
    assert.equal(bad!.responseId, "gen-1");
    assert.equal(bad!.httpStatus, 200);
    assert.ok(bad!.pipelineEventId);
    assert.deepEqual(bad!.request, {
      systemPrompt: REQUEST.systemPrompt, input: REQUEST.input, schemaName: "score", providerOrder: CONFIG.generatorProviderOrder, timeoutMs: 60_000,
    });
    assert.ok(!JSON.stringify(usage).includes("secret-key"));
    assert.equal(good!.outcome, "ok");
    assert.equal(good!.attempt, 2);
    assert.equal(good!.costUsd, 0.02);
  });
});

test("A timed-out call has an unknown cost; an HTTP error and a missing key cost nothing", async () => {
  await withTracking(false, async ({ usage }) => {
    const timedOut = createTrackedTransport({
      apiKey: "k",
      fetch: async () => {
        throw new DOMException("The operation timed out.", "TimeoutError");
      },
    });
    const { judge } = createModelPorts({ config: CONFIG, transport: timedOut, log: { warn: () => {} } });
    await assert.rejects(judge.judge({ ...REQUEST, authorModelIds: ["fixture/author"] }), (error) => error instanceof ModelError && error.code === "timeout");

    const limited = createTrackedTransport({ apiKey: "k", fetch: sequenceFetch([{ body: { error: { message: "Rate limited" } }, status: 429 }]) });
    await assert.rejects(limited.complete("fixture/model", REQUEST), (error) => error instanceof ModelError && error.code === "http");

    const unconfigured = createTrackedTransport({ apiKey: " ", fetch: sequenceFetch([]) });
    await assert.rejects(unconfigured.complete("fixture/model", REQUEST), (error) => error instanceof ModelError && error.code === "configuration");

    const [timeout, http, configuration] = usage;
    assert.equal(timeout!.outcome, "timeout");
    assert.equal(timeout!.role, "judge");
    assert.equal(timeout!.costBasis, "unknown");
    assert.equal(timeout!.costUsd, null);
    assert.equal(timeout!.response, null);
    assert.deepEqual((timeout!.request as { reasoning?: unknown }).reasoning, { effort: "high" });
    assert.equal(http!.outcome, "http");
    assert.equal(http!.httpStatus, 429);
    assert.deepEqual(http!.response, { error: { message: "Rate limited" } });
    assert.deepEqual([http!.costUsd, http!.costBasis], [0, "actual"]);
    assert.deepEqual([configuration!.outcome, configuration!.costUsd, configuration!.costBasis], ["configuration", 0, "actual"]);
    assert.equal(usage.length, 3);
  });
});

test("Research calls are estimated: full price when answered or timed out, 0 when the vendor failed", () => {
  /** An observation of one call that ended with `status`. */
  const call = (status: SourcePack["status"], adapterId: "parallel-pro" | "you-research"): ResearchCallObservation => ({
    slot: adapterId === "parallel-pro" ? "primary" : "secondary",
    adapter: { id: adapterId, timeoutMs: 1000, estimatedCostUsd: adapterId === "parallel-pro" ? 0.1 : 0.05 },
    topic: "Yggdrasil",
    pack: {
      slot: "primary", adapter: adapterId, topic: "Yggdrasil", status, error: null, startedAt: "", latencyMs: 900,
      estimatedCostUsd: 0, vendorRequestId: status === "ok" ? "trun_1" : null, vendorSummary: null, sources: [], filteredOut: [], warnings: [],
    },
    vendorResult: null,
  });
  const ok = researchUsageRow(call("ok", "parallel-pro"));
  assert.deepEqual([ok.vendor, ok.role, ok.modelId, ok.outcome, ok.costUsd, ok.costBasis, ok.responseId],
    ["parallel", "research_primary", "parallel-pro", "ok", 0.1, "estimated", "trun_1"]);
  assert.deepEqual(ok.request, { topic: "Yggdrasil", adapter: "parallel-pro", timeoutMs: 1000 });
  const timeout = researchUsageRow(call("timed_out", "parallel-pro"));
  assert.deepEqual([timeout.outcome, timeout.costUsd], ["timeout", 0.1]);
  const failed = researchUsageRow(call("error", "you-research"));
  assert.deepEqual([failed.vendor, failed.role, failed.outcome, failed.costUsd, failed.costBasis], ["you", "research_secondary", "error", 0, "estimated"]);
  assert.equal(researchUsageRow(call("empty_filtered", "you-research")).costUsd, 0.05);
});
