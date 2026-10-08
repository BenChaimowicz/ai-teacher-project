import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts } from "./model-ports.ts";
import { createOpenRouterTransport, ModelError, type StructuredRequest } from "./openrouter.ts";

/** Validates a small consumer contract rather than trusting JSON syntax or the provider schema. */
function parseScore(raw: unknown): number {
  if (!raw || typeof raw !== "object" || !("score" in raw) ||
      typeof raw.score !== "number" || !Number.isFinite(raw.score) || raw.score < 0 || raw.score > 1) {
    throw new Error("Invalid score: sensitive provider output must not appear in transport errors.");
  }
  return raw.score;
}

const REQUEST: StructuredRequest<number> = {
  systemPrompt: "Score the content without searching.",
  input: { content: "A document." },
  schemaName: "score",
  schema: {
    type: "object", required: ["score"], additionalProperties: false,
    properties: { score: { type: "number" } },
  },
  parse: parseScore,
};

/** Constructs a provider response envelope while leaving the output under test unknown. */
function completion(content: unknown, finishReason = "stop", extraMessage: object = {}): unknown {
  return { choices: [{ finish_reason: finishReason, message: { role: "assistant", content, ...extraMessage } }] };
}

/** Returns a new native Response per call, without mocking the parser or policy implementation. */
function providerFetch(raw: unknown, status = 200): typeof fetch {
  return async () => new Response(JSON.stringify(raw), { status, headers: { "Content-Type": "application/json" } });
}

test("Non-success HTTP status is a safe failure and does not attempt another model", async () => {
  let calls = 0;
  const transport = createOpenRouterTransport({
    apiKey: "secret-test-key",
    /** Counts real transport requests to ensure failures do not silently retry or fall back. */
    fetch: async () => {
      calls += 1;
      return new Response("Sensitive raw provider body and secret-test-key", { status: 401 });
    },
  });
  await assert.rejects(transport.complete("fixture/model", REQUEST), (error: unknown) => {
    assert.ok(error instanceof ModelError);
    assert.equal(error.code, "http");
    assert.equal(error.status, 401);
    assert.doesNotMatch(error.message, /Sensitive|secret-test-key/);
    return true;
  });
  assert.equal(calls, 1);
});

test("Network failures redact original errors rather than leaking credentials or request content", async () => {
  const transport = createOpenRouterTransport({
    apiKey: "secret-test-key",
    /** Simulates a fetch implementation whose error includes sensitive request data. */
    fetch: async () => { throw new Error("secret-test-key sensitive prompt and raw response"); },
  });
  await assert.rejects(transport.complete("fixture/model", REQUEST), (error: unknown) => {
    assert.ok(error instanceof ModelError);
    assert.equal(error.code, "network");
    assert.doesNotMatch(error.message, /secret-test-key|sensitive prompt|raw response/);
    return true;
  });
});

test("Missing credentials fail lazily at the call, not when composing model ports", async () => {
  const transport = createOpenRouterTransport({ apiKey: "", fetch: providerFetch(completion('{"score":1}')) });
  const { generator } = createModelPorts({ transport });
  await assert.rejects(generator.generateStructured(REQUEST),
    (error: unknown) => error instanceof ModelError && error.code === "configuration");
});

test("Refusals and content filtering cannot be consumed as valid structured results", async () => {
  for (const response of [
    completion('{"score":1}', "stop", { refusal: "Provider refusal" }),
    completion('{"score":1}', "content_filter"),
  ]) {
    const transport = createOpenRouterTransport({ apiKey: "fixture-key", fetch: providerFetch(response) });
    await assert.rejects(transport.complete("fixture/model", REQUEST),
      (error: unknown) => error instanceof ModelError && error.code === "refusal");
  }
});

test("Truncated, tool-based, or missing-finish responses fail even if their content is valid JSON", async () => {
  for (const finishReason of ["length", "tool_calls", "error", ""]) {
    const transport = createOpenRouterTransport({ apiKey: "fixture-key", fetch: providerFetch(completion('{"score":1}', finishReason)) });
    await assert.rejects(transport.complete("fixture/model", REQUEST),
      (error: unknown) => error instanceof ModelError && error.code === "incomplete");
  }
});

test("Empty, malformed, and wrong-shape responses cannot bypass application validation", async () => {
  for (const raw of [
    null,
    { error: { message: "Sensitive provider error" } },
    { choices: [] },
    completion(null),
    completion("  "),
    completion("not JSON sensitive raw output"),
    completion('{"score":"1"}'),
    completion('{"score":4}'),
    completion("[]"),
    completion('{"score":1}', "stop", { role: "tool" }),
    completion('{"score":1}', "stop", { tool_calls: [{ name: "search" }] }),
  ]) {
    const transport = createOpenRouterTransport({ apiKey: "fixture-key", fetch: providerFetch(raw) });
    await assert.rejects(transport.complete("fixture/model", REQUEST), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "invalid_output");
      assert.doesNotMatch(error.message, /Sensitive|sensitive raw|Invalid score/);
      return true;
    });
  }
});

test("Malformed HTTP JSON is a safe model-output failure", async () => {
  const transport = createOpenRouterTransport({
    apiKey: "fixture-key",
    /** Supplies a non-JSON success response to exercise native response parsing. */
    fetch: async () => new Response("not-json-sensitive-provider-body", { status: 200 }),
  });
  await assert.rejects(transport.complete("fixture/model", REQUEST), (error: unknown) => {
    assert.ok(error instanceof ModelError);
    assert.equal(error.code, "invalid_output");
    assert.doesNotMatch(error.message, /sensitive-provider-body/);
    return true;
  });
});

test("The Judge rejects its author before provider spend, including configured same-model roles", async () => {
  let calls = 0;
  const transport = createOpenRouterTransport({
    apiKey: "fixture-key",
    /** Provides validated output while counting calls that must not occur for self-judgment. */
    fetch: async () => {
      calls += 1;
      return new Response(JSON.stringify(completion('{"score":0.8}')), { status: 200 });
    },
  });
  const config = { ...loadModelConfig({}), generatorModel: "fixture/shared", judgeModel: "fixture/shared" };
  const { generator, judge } = createModelPorts({ config, transport });
  await generator.generateStructured(REQUEST);
  await assert.rejects(judge.judge({ ...REQUEST, authorModelId: generator.modelId }), /different model/);
  await assert.rejects(judge.judge({ ...REQUEST, authorModelId: ` ${generator.modelId} ` }), /different model/);
  await assert.rejects(judge.judge({ ...REQUEST, authorModelId: " " }), /different model/);
  assert.equal(calls, 1);
});

test("Independent same-vendor models accept standard empty optional response fields", async () => {
  for (const optionalFields of [
    { refusal: null, tool_calls: null, function_call: null },
    { refusal: "", tool_calls: [] },
    { refusal: " " },
  ]) {
    const transport = createOpenRouterTransport({ apiKey: "fixture-key", fetch: providerFetch(completion('{"score":0.8}', "stop", optionalFields)) });
    const config = { ...loadModelConfig({}), generatorModel: "fixture/author", judgeModel: "fixture/judge" };
    const { generator, judge } = createModelPorts({ config, transport });
    const score = await judge.judge({ ...REQUEST, authorModelId: generator.modelId });
    assert.equal(score, 0.8);
  }
});
