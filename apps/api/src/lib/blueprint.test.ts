import assert from "node:assert/strict";
import { test } from "node:test";
import type { StartingLevel } from "@senoy/db/starting-level";
import { BlueprintFailedError, createBlueprintBuilder, slugTag, type BlueprintInput } from "./blueprint.ts";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts, type Generator, type Judge, type StructuredRequest, type ModelReply } from "./model-ports.ts";
import type { StructuredTransport } from "./openrouter.ts";

/** Capabilities 1–3 evidenced (one later widened by Too easy), 4–8 not. */
const startingLevel: StartingLevel = {
  learningGoal: "Play Iris by the Goo Goo Dolls",
  probedCapabilities: Array.from({ length: 8 }, (_, i) => ({
    id: `cap${i + 1}`, statement: `Capability ${i + 1}`, itemId: `item${i + 1}`, span: i + 1,
    status: i < 3 ? "correct" as const : "dont_know" as const, expandedByLearner: i === 0,
  })),
  remainingGapStatement: "Your Course would start at counting 6/8.",
  coverageNote: "Written knowledge only.",
  extremity: "mixed",
};

const INPUT: BlueprintInput = {
  subject: "Drum kit",
  learningGoal: "Play Iris by the Goo Goo Dolls",
  startingLevel,
  confirmation: "looks_right",
  profile: { instructionLanguage: "en", quizCadence: "every_reading", explanationOrder: "topic_appropriate" },
};

/** A clean authored Blueprint for the every-reading cadence: Reading, Quiz, Reading, Quiz. */
function authored(overrides: { quiz?: Record<string, unknown> } = {}) {
  return {
    courseTitle: "Toward Iris",
    moduleTitle: "Counting in six",
    lessons: [
      {
        method: "reading", title: "Feeling 6/8", lessonGoal: "Count a 6/8 bar in two groups of three.",
        objectives: ["Explain compound meter", "Count 6/8 aloud"], topicTags: ["Compound-Meter", "6-8-time"], assessesLessonNumbers: [],
      },
      {
        method: "quiz", title: "Check: 6/8", lessonGoal: "Show you can recognise and count 6/8.",
        objectives: ["Explain compound meter"], topicTags: ["compound-meter", "counting"], assessesLessonNumbers: [1],
        ...overrides.quiz,
      },
      {
        method: "reading", title: "The Iris groove", lessonGoal: "Play the Iris verse groove at a slow tempo.",
        objectives: ["Play the verse groove"], topicTags: ["groove", "6-8-time"], assessesLessonNumbers: [],
      },
      {
        method: "quiz", title: "Check: the groove", lessonGoal: "Name the parts of the Iris verse groove.",
        objectives: ["Play the verse groove"], topicTags: ["groove", "counting"], assessesLessonNumbers: [3],
      },
    ],
  };
}

/** Scripted author; records what it was told. */
function scriptedGenerator(output: unknown, modelId = "fixture/author") {
  const calls: { input: unknown }[] = [];
  const generator: Generator = {
    modelId,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      calls.push({ input: request.input });
      return { value: request.parse(output), modelId: modelId };
    },
  };
  return { generator, calls };
}

/** Scripted Judge; records what it was shown and who it was told wrote it. */
function scriptedJudge(verdict: unknown = { pass: true, failedChecks: [], reasons: [] }, modelId = "fixture/judge") {
  const calls: { input: unknown; authorModelIds: readonly string[] }[] = [];
  const judge: Judge = {
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      calls.push({ input: request.input, authorModelIds: request.authorModelIds });
      return { value: request.parse(verdict), modelId: modelId };
    },
  };
  return { judge, calls };
}

test("A Blueprint passing Code checks and the Judge comes back with each Quiz assessing the Reading before it", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  const { blueprint, judge: verdict } = await createBlueprintBuilder({ generator, judge }).build(INPUT);
  const slots = blueprint.modules[0]!.slots;
  assert.deepEqual(slots.map((slot) => [slot.id, slot.method]), [["slot1", "reading"], ["slot2", "quiz"], ["slot3", "reading"], ["slot4", "quiz"]]);
  assert.deepEqual(slots[0]!.topicTags, ["compound-meter", "6-8-time"]);
  assert.deepEqual(slots[1]!.assessesSlotIds, ["slot1"]);
  assert.deepEqual(slots[3]!.assessesSlotIds, ["slot3"]);
  assert.equal(verdict.pass, true);
  assert.equal(judgeCalls.length, 1);
  assert.deepEqual(judgeCalls[0]!.authorModelIds, ["fixture/author"]);

  const told = calls[0]!.input as { inPlace: string[]; remainingGap: string[]; quizCadence: string };
  assert.deepEqual(told.inPlace, ["Capability 2", "Capability 3"], "Too easy moved Capability 1 into the gap.");
  assert.deepEqual(told.remainingGap, ["Capability 1", "Capability 4", "Capability 5", "Capability 6", "Capability 7", "Capability 8"]);
  assert.equal(told.quizCadence, "every_reading");
});

test("A Code check failure stops before the Judge is called", async () => {
  const { generator } = scriptedGenerator(authored({ quiz: { assessesLessonNumbers: [2] } }));
  const { judge, calls } = scriptedJudge();
  await assert.rejects(createBlueprintBuilder({ generator, judge }).build(INPUT), (error: unknown) =>
    error instanceof BlueprintFailedError && error.codeFailures.some((failure) => failure.includes("precede")));
  assert.equal(calls.length, 0);
});

test("A Judge fail fails the Blueprint, and a failed check overrides pass: true", async () => {
  for (const verdict of [
    { pass: false, failedChecks: ["coverage"], reasons: ["Misses counting."] },
    { pass: true, failedChecks: ["remaining_gap_only"], reasons: ["Re-teaches capability 2."] },
    { pass: false, failedChecks: ["factual_error"], reasons: ["Safranin stains every cell."] },
  ]) {
    const { generator } = scriptedGenerator(authored());
    const { judge } = scriptedJudge(verdict);
    await assert.rejects(createBlueprintBuilder({ generator, judge }).build(INPUT), (error: unknown) =>
      error instanceof BlueprintFailedError && error.judge?.pass === false);
  }
});

test("A Blueprint off the Learner's Quiz cadence fails the Code checks", async () => {
  const { generator } = scriptedGenerator(authored());
  const { judge, calls } = scriptedJudge();
  const input: BlueprintInput = { ...INPUT, profile: { ...INPUT.profile, quizCadence: "module_end" } };
  await assert.rejects(createBlueprintBuilder({ generator, judge }).build(input), (error: unknown) =>
    error instanceof BlueprintFailedError && error.codeFailures.some((failure) => failure.includes("has 2 Quizzes")));
  assert.equal(calls.length, 0);
});

test("The author is never its own Judge", async () => {
  const { generator, calls } = scriptedGenerator(authored(), "same/model");
  const { judge } = scriptedJudge(undefined, "same/model");
  await assert.rejects(createBlueprintBuilder({ generator, judge }).build(INPUT), /different model/);
  assert.equal(calls.length, 0);
});

test("Author and Judge share one OpenRouter transport; the Judge runs at high effort on a different model", async () => {
  const sent: { modelId: string; schemaName: string; effort: string | undefined }[] = [];
  const transport: StructuredTransport = {
    async complete<T>(modelId: string, request: StructuredRequest<T>): Promise<T> {
      sent.push({ modelId, schemaName: request.schemaName, effort: request.reasoningEffort });
      return request.parse(request.schemaName === "course_blueprint" ? authored() : { pass: true, failedChecks: [], reasons: [] });
    },
  };
  const config = loadModelConfig({});
  await createBlueprintBuilder(createModelPorts({ config, transport })).build(INPUT);
  assert.deepEqual(sent, [
    { modelId: config.generatorModel, schemaName: "course_blueprint", effort: undefined },
    { modelId: config.judgeModel, schemaName: "course_blueprint_review", effort: "high" },
  ]);
});

test("Authored Topic tags become slugs: accents dropped, lowercased, spaces as hyphens", () => {
  assert.deepEqual(["Ragnarök", "Nine Worlds", "ginnunga_gap", "æsir"].map(slugTag), ["ragnarok", "nine-worlds", "ginnunga-gap", "æsir"]);
});
