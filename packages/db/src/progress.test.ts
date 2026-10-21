import assert from "node:assert/strict";
import { test } from "node:test";
import { currentLessonId, isCourseComplete, nextLessonId } from "./progress.ts";

test("Current Lesson is the first incomplete Lesson, or the last Lesson when every Lesson is complete", () => {
  const lessonIds = ["reading", "quiz"];

  assert.equal(currentLessonId(lessonIds, new Set()), "reading");
  assert.equal(currentLessonId(lessonIds, new Set(["reading"])), "quiz");
  assert.equal(currentLessonId(lessonIds, new Set(["reading", "quiz"])), "quiz");
});

test("Next Lesson follows Course order; after the last Lesson it is the first incomplete one, else none", () => {
  const lessonIds = ["a", "b", "c"];

  assert.equal(nextLessonId(lessonIds, new Set(["a"]), "a"), "b");
  assert.equal(nextLessonId(lessonIds, new Set(["a", "b"]), "b"), "c");
  // Free jump: the last Lesson done first sends the Learner back to what is left.
  assert.equal(nextLessonId(lessonIds, new Set(["c"]), "c"), "a");
  assert.equal(nextLessonId(lessonIds, new Set(["a", "b", "c"]), "c"), null);
  assert.equal(nextLessonId(lessonIds, new Set(), "missing"), null);
});

test("A Course is complete only when it has Lessons and every one is complete", () => {
  assert.equal(isCourseComplete([], new Set()), false);
  assert.equal(isCourseComplete(["a", "b"], new Set(["a"])), false);
  assert.equal(isCourseComplete(["a", "b"], new Set(["a", "b"])), true);
});
