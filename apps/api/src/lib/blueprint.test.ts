import assert from "node:assert/strict";
import { test } from "node:test";
import type { StartingLevel } from "@senoy/db/starting-level";
import { BlueprintFailedError, createBlueprintBuilder, MAX_BLUEPRINT_REVISIONS, type BlueprintInput } from "./blueprint.ts";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts, type Generator, type Judge, type StructuredRequest } from "./model-ports.ts";
import { ModelError, type StructuredTransport } from "./openrouter.ts";

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

/** A clean authored Blueprint: one Reading, then a Quiz that assesses it. */
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
    ],
  };
}

/** Scripted author; records what it was told. */
function scriptedGenerator(output: unknown, modelId = "fixture/author") {
  const calls: { input: unknown }[] = [];
  const generator: Generator = {
    modelId,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
      calls.push({ input: request.input });
      return request.parse(output);
    },
  };
  return { generator, calls };
}

/** Scripted Judge; records what it was shown and who it was told wrote it. */
function scriptedJudge(verdict: unknown = { pass: true, failedChecks: [], reasons: [] }, modelId = "fixture/judge") {
  const calls: { input: unknown; authorModelId: string }[] = [];
  const judge: Judge = {
    modelId,
    async judge<T>(request: StructuredRequest<T> & { authorModelId: string }): Promise<T> {
      calls.push({ input: request.input, authorModelId: request.authorModelId });
      return request.parse(verdict);
    },
  };
  return { judge, calls };
}

test("A Blueprint passing Code checks and the Judge comes back as one Reading then a Quiz that assesses it", async () => {
  const { generator, calls } = scriptedGenerator(authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  const { blueprint, judge: verdict } = await createBlueprintBuilder({ generator, judge }).build(INPUT);
  const [reading, quiz] = blueprint.modules[0]!.slots;
  assert.equal(reading!.method, "reading");
  assert.deepEqual(reading!.topicTags, ["compound-meter", "6-8-time"]);
  assert.deepEqual(quiz!.assessesSlotIds, [reading!.id]);
  assert.equal(verdict.pass, true);
  assert.equal(judgeCalls.length, 1);
  assert.equal(judgeCalls[0]!.authorModelId, "fixture/author");

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

/** An author that replies with each scripted output in turn; records what it was told. */
function queuedGenerator(...outputs: unknown[]) {
  const calls: { systemPrompt: string; input: Record<string, unknown> }[] = [];
  const generator: Generator = {
    modelId: "fixture/author",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
      calls.push({ systemPrompt: request.systemPrompt, input: request.input as Record<string, unknown> });
      return request.parse(outputs.length > 1 ? outputs.shift() : outputs[0]);
    },
  };
  return { generator, calls };
}

/** A Judge that returns each scripted verdict in turn, repeating the last. */
function queuedJudge(...verdicts: unknown[]) {
  let calls = 0;
  const judge: Judge = {
    modelId: "fixture/judge",
    async judge<T>(request: StructuredRequest<T> & { authorModelId: string }): Promise<T> {
      calls++;
      return request.parse(verdicts.length > 1 ? verdicts.shift() : verdicts[0]);
    },
  };
  return { judge, calls: () => calls };
}

const PASS = { pass: true, failedChecks: [], reasons: [] };
const COVERAGE_FAIL = { pass: false, failedChecks: ["coverage"], reasons: ["Misses counting."] };

test("A failing Blueprint is revised from its own draft and problems, then checked again", async () => {
  const broken = authored({ quiz: { assessesLessonNumbers: [2] } });
  const { generator, calls } = queuedGenerator(broken, authored(), authored());
  const verdicts = queuedJudge(COVERAGE_FAIL, PASS);
  const checked = await createBlueprintBuilder({ generator, judge: verdicts.judge }).build(INPUT);
  assert.equal(checked.judge.pass, true);
  assert.equal(calls.length, 3, "The first design and two revisions.");
  assert.equal(verdicts.calls(), 2, "The Code fail never reached the Judge.");

  const codeRevision = calls[1]!;
  assert.match(codeRevision.systemPrompt, /revising a Course Blueprint that failed/);
  const previous = codeRevision.input.previousBlueprint as ReturnType<typeof authored>;
  assert.deepEqual([previous.courseTitle, previous.moduleTitle, previous.lessons.map((lesson) => lesson.assessesLessonNumbers)],
    [broken.courseTitle, broken.moduleTitle, [[], [2]]], "The revision sees the draft in the shape it wrote.");
  assert.ok((codeRevision.input.problems as string[]).some((problem) => problem.includes("precede")));
  assert.equal(codeRevision.input.learningGoal, INPUT.learningGoal);
  assert.deepEqual(calls[2]!.input.problems, ["Failed check: coverage", "Misses counting."]);
});

test("A Blueprint still failing after two revisions fails with its last verdict; each Judge fail is a revision, never a re-ask", async () => {
  const { generator, calls } = queuedGenerator(authored());
  const verdicts = queuedJudge(COVERAGE_FAIL);
  await assert.rejects(createBlueprintBuilder({ generator, judge: verdicts.judge }).build(INPUT), (error: unknown) =>
    error instanceof BlueprintFailedError && error.judge?.failedChecks[0] === "coverage");
  assert.deepEqual([calls.length, verdicts.calls()], [1 + MAX_BLUEPRINT_REVISIONS, 1 + MAX_BLUEPRINT_REVISIONS]);
});

test("A malformed author or Judge reply is asked once more; a second malformed reply is an error", async () => {
  const author = queuedGenerator({ lessons: "two" }, authored());
  const verdicts = queuedJudge({ verdict: "fine" }, PASS);
  assert.equal((await createBlueprintBuilder({ generator: author.generator, judge: verdicts.judge }).build(INPUT)).judge.pass, true);
  assert.deepEqual([author.calls.length, verdicts.calls()], [2, 2]);

  const garbage = queuedGenerator({ lessons: "two" });
  await assert.rejects(createBlueprintBuilder({ generator: garbage.generator, judge: queuedJudge(PASS).judge }).build(INPUT),
    (error: unknown) => error instanceof ModelError && error.code === "invalid_output");
  assert.equal(garbage.calls.length, 2);
});
