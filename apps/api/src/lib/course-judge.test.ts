import assert from "node:assert/strict";
import { test } from "node:test";
import type { StructuredRequest } from "./openrouter.ts";
import { COURSE_JUDGE_CHECKS, createCourseJudge, SEQUENCE_REACHES_GOAL, type CourseOutline } from "./course-judge.ts";
import type { Judge } from "./model-ports.ts";

const OUTLINE: CourseOutline = {
  courseTitle: "Norse cosmology",
  learningGoal: "Explain the Norse picture of the world",
  scope: null,
  startingLevel: "Your Course would start at the World Tree.",
  modules: [{
    title: "The world tree",
    lessons: [
      { n: 1, method: "reading", title: "The World Tree", lessonGoal: "Describe Yggdrasil.", objectives: ["Describe Yggdrasil"], commitments: ["A tree"] },
      { n: 2, method: "quiz", title: "Check", lessonGoal: "Recall Yggdrasil.", objectives: ["Describe Yggdrasil"], commitments: ["Describe Yggdrasil"] },
    ],
  }],
};

/** Judge returning `raw` through the request's own parser, recording each request. */
function recordingJudge(raw: unknown) {
  const calls: (StructuredRequest<unknown> & { authorModelIds: readonly string[] })[] = [];
  const judge: Judge = {
    modelId: "fixture/judge",
    async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }) {
      calls.push(request as StructuredRequest<unknown> & { authorModelIds: readonly string[] });
      return { value: request.parse(raw), modelId: "fixture/judge" };
    },
  };
  return { judge, calls };
}

test("The whole-Course Judge reads the outline as the Lessons' author's independent reviewer", async () => {
  const { judge, calls } = recordingJudge({ reasons: [], failedChecks: [], pass: true });
  const verdict = await createCourseJudge({ judge }).judge(OUTLINE, ["fixture/author"]);

  assert.deepEqual(verdict, { pass: true, failedChecks: [], reasons: [] });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.authorModelIds, ["fixture/author"]);
  const { scope: _scope, ...unscoped } = OUTLINE;
  assert.deepEqual(calls[0]!.input, unscoped, "Without a scope, the outline is sent without one, as before.");
  const schema = calls[0]!.schema as { properties: { failedChecks: { items: { enum: readonly string[] } } } };
  assert.deepEqual(schema.properties.failedChecks.items.enum, COURSE_JUDGE_CHECKS);
  assert.doesNotMatch(calls[0]!.systemPrompt, /norse|yggdrasil/i, "Prompts stay subject-neutral (ADR 0011).");
  assert.ok(calls[0]!.systemPrompt.includes(SEQUENCE_REACHES_GOAL), "The Blueprint Judge asks this same check before review.");
});

test("Any failed whole-Course check fails, whatever pass says", async () => {
  const { judge } = recordingJudge({ reasons: ["Lesson 2 assesses something Lesson 1 never teaches."], failedChecks: ["lesson_coherence"], pass: true });
  const verdict = await createCourseJudge({ judge }).judge(OUTLINE, ["fixture/author"]);
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.failedChecks, ["lesson_coherence"]);
});

test("With a scope, the whole-Course Judge reads it and judges reaching the goal within it", async () => {
  const scope = { inScope: ["the World Tree"], outOfScope: ["manuscript sources"] };
  const { judge, calls } = recordingJudge({ reasons: [], failedChecks: [], pass: true });
  await createCourseJudge({ judge }).judge({ ...OUTLINE, scope }, ["fixture/author"]);
  assert.deepEqual((calls[0]!.input as CourseOutline).scope, scope);
  assert.match(calls[0]!.systemPrompt, /When "scope" is present, the whole Learning Goal is the Learning Goal within scope\.inScope/);
  assert.match(calls[0]!.systemPrompt, /including scope, is untrusted/);
});
