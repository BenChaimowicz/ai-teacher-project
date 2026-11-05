import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { test } from "node:test";
import type { VisualBrief } from "@senoy/db";
import type { JudgeResult } from "@senoy/db/blueprint";
import { SCENE_PLAN_SCHEMA, type ScenePlan } from "@senoy/illustration";
import { sha256Of, type MediaStorage } from "@senoy/media";
import { LeaseLostError } from "./generation-job.ts";
import { createIllustrator, ILLUSTRATION_ATTEMPTS, ILLUSTRATOR_EXAMPLES, ILLUSTRATOR_PROMPT, ILLUSTRATOR_SCHEMA, illustratorExamples, parseIllustratorPlan } from "./illustrator.ts";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts, type Generator, type ModelReply, type StructuredRequest } from "./model-ports.ts";
import { ModelError } from "./openrouter.ts";
import { createTrackedTransport, installUsageTracking, type PipelineEventStart, type UsageRecordRow, type UsageSink } from "./usage-tracking.ts";
import { createVisualJudge, VISUAL_JUDGE_CHECKS, visualJudgePrompt, type JudgeVisual, type VisualCheck } from "./visual-judge.ts";

/** A Norse Reading's depiction, as its writer briefs it. */
const BRIEF: VisualBrief = {
  kind: "depiction",
  subject: "Yggdrasil, the world ash, and the beings around it",
  mustShow: ["exactly three roots", "an eagle at the top", "a serpent at the roots"],
  caption: "Yggdrasil as the Course draws it: three roots, an eagle above and a serpent below.",
  alt: "A great tree with three roots; an eagle sits in its crown and a red serpent coils at its base.",
  mediaCategory: "norse-mythic-depiction",
  topicTags: ["yggdrasil", "world-tree"],
};

/** The committed Yggdrasil fixture plan, which the engine draws. */
const PLAN = JSON.parse(readFileSync(new URL("../../../../packages/illustration/fixtures/yggdrasil.json", import.meta.url), "utf8")) as ScenePlan;

/** The committed Gram stain fixture plan, the diagram example. */
const GRAM = JSON.parse(readFileSync(new URL("../../../../packages/illustration/fixtures/gram.json", import.meta.url), "utf8")) as ScenePlan;

const PASS: JudgeResult = { pass: true, failedChecks: [], reasons: [] };
const FAIL: JudgeResult = { pass: false, failedChecks: ["must_show"], reasons: ["Only two roots reach the ground."] };

/** An in-memory bucket. */
function fakeBucket() {
  const objects = new Map<string, { body: Uint8Array; contentType: string }>();
  const storage: MediaStorage = {
    async put(key, body, contentType) {
      objects.set(key, { body, contentType });
    },
    async head(key) {
      const object = objects.get(key);
      return object ? { sha256: sha256Of(object.body), byteSize: object.body.byteLength } : null;
    },
    async get(key) {
      const object = objects.get(key);
      return object ? { body: Readable.from([Buffer.from(object.body)]), contentType: object.contentType, byteSize: object.body.byteLength } : null;
    },
  };
  return { objects, storage };
}

/** A scripted illustrator model: one reply per call, repeating the last; an Error is thrown instead. */
function scriptedPlanner(...replies: (unknown | Error)[]) {
  const calls: { input: Record<string, unknown>; systemPrompt: string; schema: unknown }[] = [];
  const generator: Generator = {
    modelId: "fixture/illustrator",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      calls.push({ input: request.input as Record<string, unknown>, systemPrompt: request.systemPrompt, schema: request.schema });
      const reply = replies[Math.min(calls.length, replies.length) - 1];
      if (reply instanceof Error) throw reply;
      return { value: request.parse(reply), modelId: "fixture/illustrator" };
    },
  };
  return { generator, calls };
}

/** A scripted Vision Judge: one verdict per call, repeating the last; keeps what it was shown. */
function scriptedJudge(...verdicts: (JudgeResult | Error)[]) {
  const seen: { byteSize: number; mimeType: string; brief: VisualBrief; authorModelIds: readonly string[] }[] = [];
  const judgeVisual: JudgeVisual = async (image, brief, authorModelIds) => {
    seen.push({ byteSize: image.bytes.byteLength, mimeType: image.mimeType, brief, authorModelIds });
    const verdict = verdicts[Math.min(seen.length, verdicts.length) - 1]!;
    if (verdict instanceof Error) throw verdict;
    return { judge: verdict, judgeModelId: "fixture/judge" } as VisualCheck;
  };
  return { judgeVisual, seen };
}

test("The illustrator is offered every block but Jongi, and a plan that uses Jongi or cannot be drawn is invalid output", () => {
  const offered = ILLUSTRATOR_SCHEMA.properties.items.items.anyOf.map((block) => block.properties.type.enum[0]);
  const all = SCENE_PLAN_SCHEMA.properties.items.items.anyOf.map((block) => block.properties.type.enum[0]);
  assert.ok(all.includes("jongi"), "The engine keeps Jongi.");
  assert.deepEqual(offered, all.filter((type) => type !== "jongi"), "The model is never shown it (SEN-104).");

  assert.equal(parseIllustratorPlan(PLAN), PLAN);
  const jongi = { ...PLAN, items: [...PLAN.items, { type: "jongi", pose: "pointing", x: 600, y: 700, height: 120, facing: "left", signText: null }] };
  // The 2026-11-03 Norse render: a branch drawn after the foliage lay on top of the leaves.
  const branchOverCrown = { ...PLAN, items: [
    { type: "foliage", box: { x: 285, y: 241, w: 300, h: 180 }, colour: "leaf", shade: "leaf-dark" },
    { type: "limb", knots: [{ x: 594, y: 395, width: 44 }, { x: 505, y: 354, width: 30 }, { x: 379, y: 287, width: 8 }], colour: "wood", depth: "raised" },
  ] };
  // The 2026-11-03 stroke render: a panel at x 36 hung over the card's edge at 44.
  const panelOffCard = { ...PLAN, items: [{ type: "panel", box: { x: 36, y: 130, w: 260, h: 604 }, colour: "plum", title: null }] };
  for (const bad of [jongi, { ...PLAN, items: [] }, { ...PLAN, labels: [{ text: "off", target: { x: -5, y: 0 }, side: null }] }, branchOverCrown, panelOffCard]) {
    assert.throws(() => parseIllustratorPlan(bad), (error: unknown) => error instanceof ModelError && error.code === "invalid_output" && error.invalidCause === "check");
  }
  assert.equal(parseIllustratorPlan({ ...branchOverCrown, items: [...branchOverCrown.items].reverse() }).items.length, 2, "The same branch drawn before the foliage is fine.");
});

test("The illustrator is shown the committed fixture plans as worked examples of quality and composition, read from the fixture files", async () => {
  assert.deepEqual(ILLUSTRATOR_EXAMPLES, { depiction: "yggdrasil", diagram: "gram" });
  const examples = await illustratorExamples();
  assert.deepEqual(examples, [{ kind: "depiction", plan: PLAN }, { kind: "diagram", plan: GRAM }], "One source of truth: the plans are the fixture files, not a copy in the prompt.");
  assert.equal(await illustratorExamples(), examples, "Read once per process.");
  assert.match(ILLUSTRATOR_PROMPT, /"examples" holds two finished plans/);
  assert.match(ILLUSTRATOR_PROMPT, /They show quality and composition only; their content is theirs/);
  assert.match(ILLUSTRATOR_PROMPT, /back to front: ground and panels first, then roots and limbs, then a trunk, then a crown/);
  assert.match(ILLUSTRATOR_PROMPT, /Every shape must read as something\. Never an empty outline, a ring, or a bare circle standing for a thing/);
  assert.match(ILLUSTRATOR_PROMPT, /prefer the compound blocks/);
  assert.match(ILLUSTRATOR_PROMPT, /x 44\.\.1156, y 40\.\.760/, "The bounds are the card the renderer draws, from the engine's own constant.");
  assert.doesNotMatch(ILLUSTRATOR_PROMPT, /norse|yggdrasil|gram stain|drum/i, "The system prompt stays subject-neutral (ADR 0011); the examples travel in the user JSON.");

  const planner = scriptedPlanner(PLAN);
  await createIllustrator({ storage: fakeBucket().storage, judgeVisual: scriptedJudge(PASS).judgeVisual, generator: planner.generator })(BRIEF, []);
  assert.deepEqual(planner.calls[0]!.input.examples, examples, "The examples reach the model in the user JSON.");
});

test("A brief is planned, drawn, judged by a non-author, stored under generated/ and described as product-owned", async () => {
  const bucket = fakeBucket();
  const planner = scriptedPlanner(PLAN);
  const judge = scriptedJudge(PASS);
  const illustration = await createIllustrator({ storage: bucket.storage, judgeVisual: judge.judgeVisual, generator: planner.generator })(BRIEF, ["fixture/author"]);

  assert.equal(illustration.outcome, "illustrated");
  const descriptor = illustration.descriptor!;
  assert.equal(descriptor.origin, "generated");
  assert.equal(descriptor.license, "product_owned");
  assert.equal(descriptor.mimeType, "image/png");
  assert.match(descriptor.storageKey, /^generated\/[0-9a-f]{64}\.png$/);
  assert.equal(descriptor.caption, BRIEF.caption);
  assert.equal(descriptor.alt, BRIEF.alt);
  assert.deepEqual([descriptor.mediaCategory, descriptor.topicTags], [BRIEF.mediaCategory, BRIEF.topicTags]);
  const stored = bucket.objects.get(descriptor.storageKey)!;
  assert.equal(stored.contentType, "image/png");
  assert.equal(sha256Of(stored.body), descriptor.sha256, "The bytes in the bucket are the ones the descriptor describes.");
  assert.deepEqual([...stored.body.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);

  const [call] = planner.calls;
  assert.deepEqual(call!.input.brief, { kind: BRIEF.kind, subject: BRIEF.subject, mustShow: BRIEF.mustShow, caption: BRIEF.caption, alt: BRIEF.alt }, "The model gets the brief, not the library fields.");
  assert.ok(Array.isArray(call!.input.palette));
  assert.equal(call!.input.previousAttempt, undefined);
  assert.match(call!.systemPrompt, /fail it for any mustShow item it cannot see/);
  assert.doesNotMatch(call!.systemPrompt, /jongi/i);
  assert.equal(call!.schema, ILLUSTRATOR_SCHEMA);
  assert.equal(judge.seen.length, 1);
  assert.equal(judge.seen[0]!.mimeType, "image/png");
  assert.deepEqual(judge.seen[0]!.authorModelIds, ["fixture/author", "fixture/illustrator"], "The brief's writer and the planner are both ruled out of judging.");
  assert.deepEqual(illustration.attempts.map(({ modelId, judge: verdict }) => [modelId, verdict?.pass]), [["fixture/illustrator", true]]);
});

test("A picture the Judge fails gets one more plan with the reasons; two fails give up on it, with every attempt kept", async () => {
  const planner = scriptedPlanner(PLAN, { ...PLAN, title: "Second try" });
  const judge = scriptedJudge(FAIL, PASS);
  const bucket = fakeBucket();
  const second = await createIllustrator({ storage: bucket.storage, judgeVisual: judge.judgeVisual, generator: planner.generator })(BRIEF, ["fixture/author"]);
  assert.equal(second.outcome, "illustrated");
  assert.equal(planner.calls.length, 2);
  assert.deepEqual(planner.calls[1]!.input.previousAttempt, { plan: PLAN, problems: FAIL.reasons }, "The second plan sees the first and why it failed.");
  assert.equal(second.attempts[1]!.plan!.title, "Second try");
  assert.equal(bucket.objects.size, 1);

  const twice = scriptedJudge(FAIL);
  const again = scriptedPlanner(PLAN);
  const empty = fakeBucket();
  const failed = await createIllustrator({ storage: empty.storage, judgeVisual: twice.judgeVisual, generator: again.generator })(BRIEF, []);
  assert.equal(failed.outcome, "judge_failed");
  assert.equal(failed.descriptor, null);
  assert.equal(again.calls.length, ILLUSTRATION_ATTEMPTS);
  assert.equal(ILLUSTRATION_ATTEMPTS, 2);
  assert.deepEqual(failed.attempts.map(({ judge: verdict }) => verdict?.reasons), [FAIL.reasons, FAIL.reasons]);
  assert.equal(empty.objects.size, 0, "A failed picture is never stored.");
});

test("A provider failure, a bucket failure, or a plan the engine refuses ends the illustration as an error, recorded; a lost job stops it", async () => {
  const bucket = fakeBucket();
  const timedOut = await createIllustrator({ storage: bucket.storage, judgeVisual: scriptedJudge(PASS).judgeVisual, generator: scriptedPlanner(new ModelError("timeout")).generator })(BRIEF, []);
  assert.equal(timedOut.outcome, "error");
  assert.equal(timedOut.attempts.length, 1, "A provider failure is not tried again here; the ports already retried what they could.");
  assert.match(timedOut.attempts[0]!.error!, /timeout/);

  const broken: MediaStorage = { ...bucket.storage, put: async () => { throw new Error("bucket down"); } };
  const unstored = await createIllustrator({ storage: broken, judgeVisual: scriptedJudge(PASS).judgeVisual, generator: scriptedPlanner(PLAN).generator })(BRIEF, []);
  assert.equal(unstored.outcome, "error");
  assert.equal(unstored.descriptor, null);
  assert.match(unstored.attempts[0]!.error!, /bucket down/);
  assert.equal(unstored.attempts[0]!.judge!.pass, true, "The picture passed; only storing it failed.");

  const judgeDown = await createIllustrator({ storage: bucket.storage, judgeVisual: scriptedJudge(new ModelError("http", { status: 500 })).judgeVisual, generator: scriptedPlanner(PLAN).generator })(BRIEF, []);
  assert.equal(judgeDown.outcome, "error");

  await assert.rejects(
    createIllustrator({ storage: bucket.storage, judgeVisual: scriptedJudge(PASS).judgeVisual, generator: scriptedPlanner(new LeaseLostError("job1")).generator })(BRIEF, []),
    LeaseLostError,
  );
});

test("Each plan call and each Judge call is a Usage Record under one illustration Pipeline Event, the plan on the illustrator pair", async () => {
  const events: (PipelineEventStart & { id: string })[] = [];
  const finished: { id: string; detail: Record<string, unknown> | null }[] = [];
  const usage: (UsageRecordRow & { pipelineEventId: string | null })[] = [];
  const sink: UsageSink = {
    async startPipelineEvent(row) {
      const id = `event${events.length + 1}`;
      events.push({ ...row, id });
      return id;
    },
    async finishPipelineEvent(id, row) { finished.push({ id, detail: row.detail }); },
    async insertUsageRecord(row) { usage.push(row); },
    async setUsageMeasurement() {},
    async insertProductEvent() {},
    async insertApiRequest() {},
  };
  const uninstall = installUsageTracking({ sink, log: { error: () => {} } });
  try {
    let calls = 0;
    const openrouter: typeof globalThis.fetch = async () => {
      calls++;
      const content = calls === 1 ? JSON.stringify(PLAN) : JSON.stringify(PASS);
      return new Response(JSON.stringify({
        id: `gen-${calls}`, provider: "OpenAI",
        choices: [{ finish_reason: "stop", message: { role: "assistant", content } }],
        usage: { prompt_tokens: 900, completion_tokens: 10, total_tokens: 910, cost: 0.004 },
      }), { status: 200 });
    };
    const config = {
      ...loadModelConfig({}), generatorModel: "fixture/author", generatorFallbackModel: "fixture/fallback", judgeModel: "fixture/judge", judgeFallbackModel: "fixture/judge-fallback",
      illustratorModel: "fixture/illustrator", illustratorFallbackModel: "fixture/illustrator-fallback", techniqueJudgeModel: "fixture/technique-judge",
    };
    const transport = createTrackedTransport({ apiKey: "k", fetch: openrouter });
    const ports = createModelPorts({ config, transport, authors: "illustrator", log: { warn: () => {} } });
    assert.equal(ports.generator.modelId, "fixture/illustrator", "The illustrator pair is its own setting.");
    const judgeVisual = createVisualJudge({ judge: createModelPorts({ config, transport, log: { warn: () => {} } }).judge });
    const bucket = fakeBucket();
    const illustration = await createIllustrator({ storage: bucket.storage, judgeVisual, generator: ports.generator })(BRIEF, ["fixture/author"]);
    assert.equal(illustration.outcome, "illustrated");

    assert.deepEqual(events.map(({ kind, label }) => [kind, label]), [["illustration", BRIEF.subject]]);
    const eventId = events[0]!.id;
    assert.deepEqual(usage.map(({ role, modelId, pipelineEventId }) => [role, modelId, pipelineEventId]), [
      ["generator", "fixture/illustrator", eventId],
      ["judge", "fixture/judge", eventId],
    ]);
    assert.ok(usage[1]!.request && JSON.stringify(usage[1]!.request).includes("visual_fitness"));
    const detail = finished[0]!.detail!;
    assert.equal(detail.outcome, "illustrated");
    assert.equal(detail.descriptorId, illustration.descriptor!.id);
    assert.equal((detail.attempts as unknown[]).length, 1);
  } finally {
    uninstall();
  }
});

test("The Vision Judge judges a technique on its own model with the harsh rule, and a drawing on the Judge's model with the lenient one", async () => {
  const seen: { modelId: string; systemPrompt: string; input: unknown; authorModelIds: readonly string[]; schema: unknown }[] = [];
  const port = (modelId: string) => ({
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      seen.push({ modelId, systemPrompt: request.systemPrompt, input: request.input, authorModelIds: request.authorModelIds, schema: request.schema });
      return { value: request.parse(PASS), modelId };
    },
  });
  const judgeVisual = createVisualJudge({ judge: port("fixture/judge"), techniqueJudge: port("fixture/technique-judge") });
  const png = readFileSync(new URL("../../../../packages/illustration/fixtures/yggdrasil.png", import.meta.url));
  const drawn = await judgeVisual({ mimeType: "image/png", bytes: png }, BRIEF, ["fixture/author"]);
  assert.equal(drawn.judgeModelId, "fixture/judge");
  const technique = await judgeVisual({ mimeType: "image/jpeg", bytes: png }, { ...BRIEF, kind: "technique" }, ["fixture/author"]);
  assert.equal(technique.judgeModelId, "fixture/technique-judge");

  assert.equal(seen[0]!.systemPrompt, visualJudgePrompt("depiction"));
  assert.match(seen[0]!.systemPrompt, /never fail it for being simplified, stylised, flat, or sparse/);
  assert.doesNotMatch(seen[0]!.systemPrompt, /Be harsh/);
  assert.match(seen[1]!.systemPrompt, /Be harsh/);
  assert.doesNotMatch(seen[1]!.systemPrompt, /never fail it for being simplified/);
  for (const call of seen) {
    assert.match(call.systemPrompt, /Lenient on style, strict on facts/);
    assert.deepEqual(call.input, { brief: { kind: (call.input as { brief: { kind: string } }).brief.kind, subject: BRIEF.subject, mustShow: BRIEF.mustShow, caption: BRIEF.caption, alt: BRIEF.alt } });
    assert.deepEqual(call.authorModelIds, ["fixture/author"]);
    assert.deepEqual((call.schema as { properties: { failedChecks: { items: { enum: unknown } } } }).properties.failedChecks.items.enum, VISUAL_JUDGE_CHECKS);
    assert.doesNotMatch(call.systemPrompt, /norse|yggdrasil|drum/i, "Prompts stay subject-neutral (ADR 0011).");
  }
  assert.equal(visualJudgePrompt("diagram"), visualJudgePrompt("depiction"));
});

test("The illustrator pair and the technique Judge are their own settings, defaulting to the evals' picks", () => {
  const defaults = loadModelConfig({});
  assert.deepEqual([defaults.illustratorModel, defaults.illustratorFallbackModel], ["openai/gpt-6.1-terra", "openai/gpt-6.1-sol"]);
  assert.equal(defaults.techniqueJudgeModel, "openai/gpt-5.6-luna");
  const pinned = loadModelConfig({ ILLUSTRATOR_MODEL: " openai/x ", ILLUSTRATOR_FALLBACK_MODEL: "openai/y", TECHNIQUE_JUDGE_MODEL: "openai/z" });
  assert.deepEqual([pinned.illustratorModel, pinned.illustratorFallbackModel, pinned.techniqueJudgeModel], ["openai/x", "openai/y", "openai/z"]);
});
