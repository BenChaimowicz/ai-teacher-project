import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlueprintSlot } from "@senoy/db/blueprint";
import { parseGoalCheckBody } from "@senoy/db/goal-check";
import {
  createGoalCheckGenerator,
  GOAL_CHECK_JUDGE_CHECKS,
  GoalCheckFailedError,
  type GoalCheckInput,
} from "./goal-check-generation.ts";
import type { Generator, Judge, ModelReply, StructuredRequest } from "./model-ports.ts";
import type { AssessedLesson } from "./quiz-generation.ts";
import { QUIZ_STYLE } from "./teaching-style.ts";

const TREE: BlueprintSlot = {
  id: "slot1", method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
  objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil"], assessesSlotIds: [],
};
const QUIZ: BlueprintSlot = {
  id: "slot2", method: "quiz", title: "Check: the World Tree", lessonGoal: "Recall the tree.",
  objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil"], assessesSlotIds: ["slot1"],
};
const ROOTS: BlueprintSlot = {
  id: "slot3", method: "reading", title: "The Roots", lessonGoal: "Trace the three roots.",
  objectives: ["Trace the roots"], topicTags: ["yggdrasil"], assessesSlotIds: [],
};
const CONNECT = "Explain how the worlds connect";
const PLACE = "Place a world by its root";
const GOAL_SLOT: BlueprintSlot = {
  id: "slot4", method: "goal_check", title: "Goal Check", lessonGoal: "Show you can find your way around the Norse cosmos.",
  objectives: [CONNECT, PLACE], topicTags: ["yggdrasil"], assessesSlotIds: ["slot1", "slot3"],
  objectiveSlotIds: { [CONNECT]: ["slot1"], [PLACE]: ["slot1", "slot3"] },
};

/** A checkpointed Reading for `slot`. */
function reading(slot: BlueprintSlot, text: string): AssessedLesson {
  return {
    slotId: slot.id, title: slot.title, lessonGoal: slot.lessonGoal, objectives: slot.objectives,
    body: { sections: [{ heading: slot.title, blocks: [{ kind: "prose", text }] }] },
  };
}

const INPUT: GoalCheckInput = {
  courseTitle: "Norse cosmology",
  learningGoal: "Find my way around the Norse picture of the world",
  scope: null,
  startingLevel: "Cannot yet name the worlds or say how they connect.",
  slot: GOAL_SLOT,
  slots: [TREE, QUIZ, ROOTS, GOAL_SLOT],
  assessed: [reading(TREE, "Yggdrasil joins the Nine Worlds [1]."), reading(ROOTS, "It has three roots [2].")],
  profile: { instructionLanguage: "en" },
};

/** One authored item for `objective`. */
function item(n: number, objective = n % 2 ? CONNECT : PLACE) {
  return {
    objective,
    prompt: `A traveller in scenario ${n} wants to reach a world. What should they do?`,
    options: [
      { id: "opt1", text: `Right ${n}`, correct: true, why: `The Lessons state right ${n}.` },
      ...["a", "b", "c"].map((letter, index) => ({ id: `opt${index + 2}`, text: `Wrong ${n}${letter}`, correct: false, why: `The Lessons rule out ${n}${letter}.` })),
    ],
    explanations: { brief: `Brief ${n}.`, standard: `Standard ${n}.`, detailed: `Detailed ${n}.` },
  };
}

/** An authored Goal Check of `count` items. */
function authored(count = 6, objective?: string) {
  return { items: Array.from({ length: count }, (_, index) => item(index + 1, objective)) };
}

/** Scripted Generator: one output per call, repeating the last; records what it was shown. */
function scriptedGenerator(modelId: string, ...outputs: unknown[]) {
  const calls: StructuredRequest<unknown>[] = [];
  const generator: Generator = {
    modelId,
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      calls.push(request as StructuredRequest<unknown>);
      return { value: request.parse(outputs[Math.min(calls.length, outputs.length) - 1]), modelId };
    },
  };
  return { generator, calls };
}

const PASS = { pass: true, failedChecks: [], reasons: [] };

/** Scripted Judge: one verdict per call, repeating the last; records what it was shown. */
function scriptedJudge(...verdicts: unknown[]) {
  const calls: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const judge: Judge = {
    modelId: "fixture/judge",
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
      calls.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
      return { value: request.parse(verdicts.length ? verdicts[Math.min(calls.length, verdicts.length) - 1] : PASS), modelId: "fixture/judge" };
    },
  };
  return { judge, calls };
}

test("Authored items become a Goal Check body that names each item's goal objective (SEN-81)", async () => {
  const { generator } = scriptedGenerator("fixture/author", authored());
  const { judge, calls } = scriptedJudge();
  const { lesson, repairs, judgeModelId } = await createGoalCheckGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 0);
  assert.equal(judgeModelId, "fixture/judge");
  assert.deepEqual([lesson.teachingMethod, lesson.slotId, lesson.lineage], ["goal_check", "slot4", null]);
  assert.deepEqual(lesson.objectives, [CONNECT, PLACE]);
  assert.deepEqual(parseGoalCheckBody(lesson.body), lesson.body);
  assert.deepEqual(lesson.body.items.map((goalItem) => goalItem.objective), [CONNECT, PLACE, CONNECT, PLACE, CONNECT, PLACE]);
  for (const [index, goalItem] of lesson.body.items.entries()) {
    assert.equal(goalItem.options.find((option) => option.id === goalItem.correctOptionId)!.text, `Right ${index + 1}`);
  }
  assert.equal(calls.length, 1, "One Judge pass and no objective grounding.");
  assert.deepEqual(calls[0]!.authorModelIds, ["fixture/author"]);
});

test("The author reads the Learning Goal, Starting Level, every assessed Reading, and which Readings teach each objective", async () => {
  const { generator, calls } = scriptedGenerator("fixture/author", authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  await createGoalCheckGenerator({ generator, judge }).generate(INPUT);

  const told = calls[0]!.input as {
    learningGoal: string; startingLevel: string; lessons: { title: string; sections: { paragraphs: string[] }[] }[];
    slot: { objectives: { objective: string; taughtIn: string[] }[] }; profile: unknown;
  };
  assert.equal(told.learningGoal, INPUT.learningGoal);
  assert.equal(told.startingLevel, INPUT.startingLevel);
  assert.deepEqual(told.lessons.map((lesson) => lesson.title), ["The World Tree", "The Roots"]);
  assert.deepEqual(told.lessons[1]!.sections[0]!.paragraphs, ["It has three roots."], "Citation markers are left out.");
  assert.deepEqual(told.slot.objectives, [{ objective: CONNECT, taughtIn: ["The World Tree"] }, { objective: PLACE, taughtIn: ["The World Tree", "The Roots"] }]);
  assert.deepEqual(told.profile, { instructionLanguage: "en" });
  const schema = calls[0]!.schema as { properties: { items: { minItems: number; maxItems: number; items: { properties: { objective: { enum: string[] } } } } } };
  assert.deepEqual([schema.properties.items.minItems, schema.properties.items.maxItems], [6, 12]);
  assert.deepEqual(schema.properties.items.items.properties.objective.enum, [CONNECT, PLACE]);
  assert.ok(calls[0]!.systemPrompt.includes(QUIZ_STYLE));
  assert.match(calls[0]!.systemPrompt, /integrative/);

  const shown = judgeCalls[0]!.input as { learningGoal: string; startingLevel: string; items: { objective: string; key: string }[] };
  assert.equal(shown.learningGoal, INPUT.learningGoal);
  assert.equal(shown.startingLevel, INPUT.startingLevel);
  assert.equal(shown.items[0]!.objective, CONNECT);
  for (const check of GOAL_CHECK_JUDGE_CHECKS) assert.match(judgeCalls[0]!.systemPrompt, new RegExp(`- ${check}:`));
});

test("Without a Starting Level or a scope, neither reaches the author or Judge", async () => {
  const { generator, calls } = scriptedGenerator("fixture/author", authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  await createGoalCheckGenerator({ generator, judge }).generate({ ...INPUT, startingLevel: null });
  for (const call of [calls[0]!, judgeCalls[0]!]) {
    assert.ok(!("startingLevel" in (call.input as object)));
    assert.ok(!("scope" in (call.input as object)));
    assert.doesNotMatch(call.systemPrompt, /scope\.inScope/);
  }
  const scoped = scriptedGenerator("fixture/author", authored());
  const scopedJudge = scriptedJudge();
  await createGoalCheckGenerator({ generator: scoped.generator, judge: scopedJudge.judge })
    .generate({ ...INPUT, scope: { inScope: ["the tree"], outOfScope: ["the gods"] } });
  assert.match(scoped.calls[0]!.systemPrompt, /Every item stays inside scope\.inScope/);
  assert.match(scopedJudge.calls[0]!.systemPrompt, /fail answerable_from_course for it/);
});

test("An uncovered goal objective or a stray mention is repaired before the Judge runs", async () => {
  const stray = authored();
  stray.items[0]!.explanations.brief = "See {opt9}.";
  const { generator, calls } = scriptedGenerator("fixture/author", authored(6, CONNECT), stray, authored());
  const { judge, calls: judgeCalls } = scriptedJudge();
  const { repairs, rounds } = await createGoalCheckGenerator({ generator, judge }).generate(INPUT);

  assert.equal(repairs, 2);
  assert.equal(judgeCalls.length, 1);
  assert.deepEqual(rounds[0]!.problems, [`No item checks the goal objective “${PLACE}”.`]);
  assert.deepEqual(rounds[1]!.problems, ["Item 1's explanation mentions an option id the item does not have."]);
  const revision = (calls[1]!.input as { revision: { problems: string[] } }).revision;
  assert.deepEqual(revision.problems, rounds[0]!.problems);
});

test("A Judge failure is repaired with its reasons, and repairs that run out throw with every round", async () => {
  const fail = { pass: false, failedChecks: ["integrative_items"], reasons: ["Items 1-6 only recall one sentence."] };
  const { generator, calls } = scriptedGenerator("fixture/author", authored());
  const { judge } = scriptedJudge(fail);
  await assert.rejects(createGoalCheckGenerator({ generator, judge }).generate(INPUT), (error: unknown) => {
    assert.ok(error instanceof GoalCheckFailedError);
    assert.deepEqual(error.codeFailures, []);
    assert.deepEqual(error.judge?.failedChecks, ["integrative_items"]);
    assert.equal(error.rounds.length, 3);
    assert.match(error.message, /^\[goal-check-generation: generate\] Goal Check failed Judge checks/);
    return true;
  });
  assert.deepEqual((calls[1]!.input as { revision: { problems: string[] } }).revision.problems, fail.reasons);
});

test("When the author's repairs run out, the fallback author writes a fresh Goal Check", async () => {
  const primary = scriptedGenerator("fixture/author", authored(6, CONNECT));
  const fallback = scriptedGenerator("fixture/fallback", authored());
  const { judge, calls } = scriptedJudge();
  const checked = await createGoalCheckGenerator({ generator: primary.generator, fallbackGenerator: fallback.generator, judge }).generate(INPUT);
  assert.equal(primary.calls.length, 3);
  assert.equal(fallback.calls.length, 1);
  assert.ok(!("revision" in (fallback.calls[0]!.input as object)));
  assert.deepEqual(checked.authorModelIds, ["fixture/fallback"]);
  assert.equal(checked.rounds.length, 4);
  assert.deepEqual(calls[0]!.authorModelIds, ["fixture/fallback"]);
});

test("A Goal Check whose assessed Reading is not checkpointed fails its Code checks without a Judge call", async () => {
  const { generator } = scriptedGenerator("fixture/author", authored());
  const { judge, calls } = scriptedJudge();
  await assert.rejects(createGoalCheckGenerator({ generator, judge }).generate({ ...INPUT, assessed: [INPUT.assessed[0]!] }), (error: unknown) => {
    assert.ok(error instanceof GoalCheckFailedError);
    assert.ok(error.codeFailures.includes("Assessed slot slot3 has no checkpointed Lesson."));
    return true;
  });
  assert.equal(calls.length, 0);
});

test("The author may not judge its own Goal Check", async () => {
  const { generator } = scriptedGenerator("fixture/judge", authored());
  const { judge } = scriptedJudge();
  await assert.rejects(createGoalCheckGenerator({ generator, judge }).generate(INPUT), /Judge must use a different model/);
});
