import assert from "node:assert/strict";
import { test } from "node:test";
import type { StructuredRequest } from "./openrouter.ts";
import { COURSE_JUDGE_CHECKS, createCourseJudge, type CourseOutline } from "./course-judge.ts";
import type { Generator, Judge } from "./model-ports.ts";

const OUTLINE: CourseOutline = {
  courseTitle: "Norse cosmology",
  learningGoal: "Explain the Norse picture of the world",
  startingLevel: "Your Course would start at the World Tree.",
  modules: [{
    title: "The world tree",
    lessons: [
      { n: 1, method: "reading", title: "The World Tree", lessonGoal: "Describe Yggdrasil.", objectives: ["Describe Yggdrasil"], commitments: ["A tree"] },
      { n: 2, method: "quiz", title: "Check", lessonGoal: "Recall Yggdrasil.", objectives: ["Describe Yggdrasil"], commitments: ["Describe Yggdrasil"] },
    ],
  }],
};

const generator: Generator = {
  modelId: "fixture/author",
  async generateStructured() { throw new Error("The whole-Course Judge writes nothing."); },
};

/** Judge returning `raw` through the request's own parser, recording each request. */
function recordingJudge(raw: unknown) {
  const calls: (StructuredRequest<unknown> & { authorModelId: string })[] = [];
  const judge: Judge = {
    modelId: "fixture/judge",
    async judge<T>(request: StructuredRequest<T> & { authorModelId: string }) {
      calls.push(request as StructuredRequest<unknown> & { authorModelId: string });
      return request.parse(raw);
    },
  };
  return { judge, calls };
}

test("The whole-Course Judge reads the outline as the Lessons' author's independent reviewer", async () => {
  const { judge, calls } = recordingJudge({ reasons: [], failedChecks: [], pass: true });
  const verdict = await createCourseJudge({ generator, judge }).judge(OUTLINE);

  assert.deepEqual(verdict, { pass: true, failedChecks: [], reasons: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.authorModelId, "fixture/author");
  assert.deepEqual(calls[0]!.input, OUTLINE);
  const schema = calls[0]!.schema as { properties: { failedChecks: { items: { enum: readonly string[] } } } };
  assert.deepEqual(schema.properties.failedChecks.items.enum, COURSE_JUDGE_CHECKS);
  assert.doesNotMatch(calls[0]!.systemPrompt, /norse|yggdrasil/i, "Prompts stay subject-neutral (ADR 0011).");
});

test("Any failed whole-Course check fails, whatever pass says", async () => {
  const { judge } = recordingJudge({ reasons: ["Lesson 2 assesses something Lesson 1 never teaches."], failedChecks: ["lesson_coherence"], pass: true });
  const verdict = await createCourseJudge({ generator, judge }).judge(OUTLINE);
  assert.equal(verdict.pass, false);
  assert.deepEqual(verdict.failedChecks, ["lesson_coherence"]);
});
