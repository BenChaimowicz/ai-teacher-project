import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts } from "./model-ports.ts";
import { createOpenRouterTransport, ModelError, rejectedOutput, type StructuredRequest, type StructuredTransport } from "./openrouter.ts";

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
  const config = { ...loadModelConfig({}), generatorModel: "fixture/shared", judgeModel: "fixture/shared", judgeFallbackModel: "fixture/shared" };
  const { generator, judge } = createModelPorts({ config, transport });
  await generator.generateStructured(REQUEST);
  await assert.rejects(judge.judge({ ...REQUEST, authorModelIds: [generator.modelId] }), /different model/);
  await assert.rejects(judge.judge({ ...REQUEST, authorModelIds: [` ${generator.modelId} `] }), /different model/);
  await assert.rejects(judge.judge({ ...REQUEST, authorModelIds: [" "] }), /different model/);
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
    const score = await judge.judge({ ...REQUEST, authorModelIds: [generator.modelId] });
    assert.deepEqual(score, { value: 0.8, modelId: "fixture/judge" });
  }
});

test("Author calls prefer the configured hosts with fallback; Judge calls use default routing", async () => {
  const sent: { model: string; provider?: unknown }[] = [];
  const transport = createOpenRouterTransport({
    apiKey: "fixture-key",
    /** Captures each request body the provider receives. */
    fetch: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(completion('{"score":1}')), { status: 200 });
    },
  });
  const config = loadModelConfig({ GENERATOR_MODEL: "fixture/author", JUDGE_MODEL: "fixture/judge", GENERATOR_PROVIDER_ORDER: " alibaba, baidu " });
  const { generator, judge } = createModelPorts({ config, transport });
  await generator.generateStructured(REQUEST);
  await judge.judge({ ...REQUEST, authorModelIds: [generator.modelId] });
  assert.deepEqual(sent.map((body) => body.provider), [
    { require_parameters: true, order: ["alibaba", "baidu"], allow_fallbacks: true },
    { require_parameters: true },
  ]);
  assert.deepEqual(loadModelConfig({}).generatorProviderOrder, ["alibaba"]);
});

test("A call that runs past its time limit is a timeout, not invalid output", async () => {
  const transport = createOpenRouterTransport({
    apiKey: "fixture-key",
    /** Sends headers, then never finishes the body, like a hung provider. */
    fetch: async (_url, init) => new Response(new ReadableStream({
      start(controller) {
        // AbortSignal.timeout does not hold the event loop open; a real socket would, so this timer stands in for it.
        const pending = setTimeout(() => {}, 10_000);
        init?.signal?.addEventListener("abort", () => { clearTimeout(pending); controller.error(init.signal!.reason); });
      },
    }), { status: 200 }),
  });
  await assert.rejects(transport.complete("fixture/model", { ...REQUEST, timeoutMs: 20 }), (error: unknown) => {
    assert.ok(error instanceof ModelError);
    assert.equal(error.code, "timeout");
    return true;
  });
});

test("A request's reasoning effort, else its reasoning budget, reaches the provider", async () => {
  const sent: { reasoning?: unknown }[] = [];
  const transport = createOpenRouterTransport({
    apiKey: "fixture-key",
    /** Captures each request body. */
    fetch: async (_url, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(completion('{"score":1}')), { status: 200 });
    },
  });
  await transport.complete("fixture/model", { ...REQUEST, reasoningMaxTokens: 1500 });
  await transport.complete("fixture/model", { ...REQUEST, reasoningMaxTokens: 1500, reasoningEffort: "none" });
  await transport.complete("fixture/model", REQUEST);
  assert.deepEqual(sent.map((body) => body.reasoning), [{ max_tokens: 1500 }, { effort: "none" }, undefined]);
});

test("An invalid structured response records whether it was unparseable, off-schema, or rejected by our own checks", async () => {
  const checked: StructuredRequest<number> = { ...REQUEST, parse: (raw) => {
    const score = parseScore(raw);
    if (score === 0) throw rejectedOutput();
    return score;
  } };
  for (const [content, cause] of [["not JSON", "unparseable"], ["  ", "unparseable"], ['{"score":"1"}', "schema"], ['{"score":0}', "check"]] as const) {
    const raw = { id: "gen-123", provider: "Alibaba", ...(completion(content) as object) };
    const transport = createOpenRouterTransport({ apiKey: "fixture-key", fetch: providerFetch(raw) });
    await assert.rejects(transport.complete("fixture/model", checked), (error: unknown) => {
      assert.ok(error instanceof ModelError);
      assert.equal(error.code, "invalid_output");
      assert.equal(error.invalidCause, cause, content);
      assert.equal(error.provider, "Alibaba");
      assert.equal(error.responseId, "gen-123");
      assert.match(error.message, new RegExp(`invalidCause=${cause} \\|\\| provider=Alibaba \\|\\| responseId=gen-123`));
      return true;
    });
  }
});

/** Transport answering from a script of outcomes, one per call, recording which model and hosts each call went to. */
function scriptedTransport(...outcomes: (ModelError | number)[]) {
  const models: string[] = [];
  const hosts: (string[] | undefined)[] = [];
  const transport: StructuredTransport = {
    async complete<T>(modelId: string, request: StructuredRequest<T>, providerOrder?: string[]) {
      models.push(modelId);
      hosts.push(providerOrder);
      const outcome = outcomes.shift();
      if (outcome instanceof ModelError) throw outcome;
      return request.parse({ score: outcome ?? 1 });
    },
  };
  return { transport, models, hosts };
}

const PORTS_CONFIG = { generatorModel: "fixture/author", generatorFallbackModel: "fixture/fallback", generatorProviderOrder: [],
  lessonGeneratorModel: "fixture/fallback", lessonGeneratorFallbackModel: "fixture/author",
  judgeModel: "fixture/judge", judgeFallbackModel: "fixture/fallback" };
const quiet = { warn: () => {} };

test("One bad reply is retried once on the same model, then once on the fallback, which the reply names", async () => {
  const bad = new ModelError("invalid_output", { invalidCause: "unparseable" });
  for (const [outcomes, models] of [
    [[0.5], ["fixture/author"]],
    [[bad, 0.5], ["fixture/author", "fixture/author"]],
    [[new ModelError("incomplete"), bad, 0.5], ["fixture/author", "fixture/author", "fixture/fallback"]],
  ] as const) {
    const { transport, models: sent } = scriptedTransport(...outcomes);
    const warnings: string[] = [];
    const { generator } = createModelPorts({ config: PORTS_CONFIG, transport, log: { warn: (message) => warnings.push(message) } });
    assert.deepEqual(await generator.generateStructured(REQUEST), { value: 0.5, modelId: models.at(-1) });
    assert.deepEqual(sent, models);
    assert.equal(warnings.length, models.length - 1, "Each retried failure is logged.");
  }
});

test("A third bad reply, a timeout, or an HTTP failure is not retried further", async () => {
  const bad = () => new ModelError("invalid_output", { invalidCause: "schema" });
  for (const [outcomes, calls, code] of [
    [[bad(), bad(), bad()], 3, "invalid_output"],
    [[new ModelError("timeout")], 1, "timeout"],
    [[new ModelError("http", { status: 500 })], 1, "http"],
    [[new ModelError("refusal")], 1, "refusal"],
  ] as const) {
    const { transport, models } = scriptedTransport(...outcomes);
    const { generator } = createModelPorts({ config: PORTS_CONFIG, transport, log: quiet });
    await assert.rejects(generator.generateStructured(REQUEST), (error: unknown) => error instanceof ModelError && error.code === code);
    assert.equal(models.length, calls);
  }
});

test("The Judge never falls back to a model that wrote the artifact, and uses its fallback when its primary did", async () => {
  const bad = () => new ModelError("invalid_output", { invalidCause: "unparseable" });
  const failing = scriptedTransport(bad(), bad(), 0.5);
  const { judge } = createModelPorts({ config: PORTS_CONFIG, transport: failing.transport, log: quiet });
  await assert.rejects(judge.judge({ ...REQUEST, authorModelIds: ["fixture/author", "fixture/fallback"] }), ModelError);
  assert.deepEqual(failing.models, ["fixture/judge", "fixture/judge"], "The fallback wrote part of it, so it may not judge.");

  const recovering = scriptedTransport(bad(), bad(), 0.5);
  const ports = createModelPorts({ config: PORTS_CONFIG, transport: recovering.transport, log: quiet });
  assert.deepEqual(await ports.judge.judge({ ...REQUEST, authorModelIds: ["fixture/author"] }), { value: 0.5, modelId: "fixture/fallback" });

  const primaryWrote = scriptedTransport(0.5);
  const reviewer = createModelPorts({ config: PORTS_CONFIG, transport: primaryWrote.transport, log: quiet }).judge;
  assert.deepEqual(await reviewer.judge({ ...REQUEST, authorModelIds: ["fixture/judge"] }), { value: 0.5, modelId: "fixture/fallback" });
  assert.deepEqual(primaryWrote.models, ["fixture/fallback"]);
});

test("Lessons are written by the Lesson pair, and the Generator's preferred hosts go with its model in either role", async () => {
  const config = { ...PORTS_CONFIG, generatorProviderOrder: ["alibaba"] };
  const bad = () => new ModelError("invalid_output", { invalidCause: "unparseable" });
  const lesson = scriptedTransport(bad(), bad(), 0.5, 0.5);
  const ports = createModelPorts({ config, transport: lesson.transport, log: quiet, authors: "lesson" });
  assert.equal(ports.generator.modelId, "fixture/fallback");
  assert.equal(ports.fallbackGenerator.modelId, "fixture/author");
  assert.deepEqual(await ports.generator.generateStructured(REQUEST), { value: 0.5, modelId: "fixture/author" });
  await ports.fallbackGenerator.generateStructured(REQUEST);
  assert.deepEqual(lesson.models, ["fixture/fallback", "fixture/fallback", "fixture/author", "fixture/author"]);
  assert.deepEqual(lesson.hosts, [undefined, undefined, ["alibaba"], ["alibaba"]]);

  const other = scriptedTransport(0.5, 0.5);
  const generatorPorts = createModelPorts({ config, transport: other.transport, log: quiet });
  assert.equal(generatorPorts.generator.modelId, "fixture/author");
  await generatorPorts.generator.generateStructured(REQUEST);
  await generatorPorts.fallbackGenerator.generateStructured(REQUEST);
  assert.deepEqual(other.models, ["fixture/author", "fixture/fallback"]);
  assert.deepEqual(other.hosts, [["alibaba"], undefined]);
});

test("A vision call sends its images after the JSON as high-detail data URLs, and the observer sees only their size", async () => {
  let sent: { messages: { role: string; content: unknown }[] } | null = null;
  let observed: unknown = null;
  const transport = createOpenRouterTransport({
    apiKey: "secret-test-key",
    /** Keeps the request body so the test can read the user message. */
    fetch: async (_url, init) => {
      sent = JSON.parse(String(init?.body));
      return new Response(JSON.stringify(completion(JSON.stringify({ score: 1 }))), { status: 200 });
    },
    observe: (call) => { observed = call.request; },
  });
  const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
  assert.equal(await transport.complete("fixture/model", { ...REQUEST, images: [{ mimeType: "image/jpeg", bytes }] }), 1);
  const user = sent!.messages.find((message) => message.role === "user")!;
  assert.deepEqual(user.content, [
    { type: "text", text: JSON.stringify(REQUEST.input) },
    { type: "image_url", image_url: { url: "data:image/jpeg;base64,/9j/", detail: "high" } },
  ]);
  assert.deepEqual((observed as { images?: unknown }).images, [{ mimeType: "image/jpeg", byteSize: 3 }]);
});

test("A text-only call keeps its user message a plain JSON string", async () => {
  let content: unknown = null;
  const transport = createOpenRouterTransport({
    apiKey: "secret-test-key",
    /** Keeps the user message content. */
    fetch: async (_url, init) => {
      content = (JSON.parse(String(init?.body)) as { messages: { role: string; content: unknown }[] }).messages[1]!.content;
      return new Response(JSON.stringify(completion(JSON.stringify({ score: 1 }))), { status: 200 });
    },
  });
  await transport.complete("fixture/model", REQUEST);
  assert.equal(content, JSON.stringify(REQUEST.input));
});
