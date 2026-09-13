import assert from "node:assert/strict";
import { test } from "node:test";
import { currentLessonId } from "./progress.ts";

test("Current Lesson is the first incomplete Lesson, or the last Lesson when every Lesson is complete", () => {
  const lessonIds = ["reading", "quiz"];

  assert.equal(currentLessonId(lessonIds, new Set()), "reading");
  assert.equal(currentLessonId(lessonIds, new Set(["reading"])), "quiz");
  assert.equal(currentLessonId(lessonIds, new Set(["reading", "quiz"])), "quiz");
});
