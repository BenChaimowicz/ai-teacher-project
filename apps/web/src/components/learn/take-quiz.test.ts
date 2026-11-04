import { test } from "node:test";
import assert from "node:assert/strict";
import type { StudyLesson } from "../../lib/study-types.ts";
import { quizOffersAfter, quizStatusText } from "./take-quiz.ts";

const lesson = (id: string, teachingMethod: string, extra: Partial<StudyLesson> = {}): StudyLesson => ({
  id, title: `Lesson ${id}`, teachingMethod, position: 0, lessonGoal: "", completed: false, locked: false, citations: [], body: {}, ...extra,
});

const course = [
  lesson("r1", "reading"),
  lesson("r2", "reading"),
  lesson("q1", "quiz", { assessedLessonIds: ["r2", "r1"], quizBest: { correct: 4, total: 5 } }),
  lesson("r3", "reading"),
  lesson("q2", "quiz", { quizBest: null }),
  lesson("g", "goal_check"),
];

test("A Quiz is offered at the end of the last Reading it covers, whatever order it lists them in", () => {
  assert.deepEqual(quizOffersAfter("c", course, "r1"), []);
  assert.deepEqual(quizOffersAfter("c", course, "r2"), [{ lessonId: "q1", title: "Lesson q1", to: "/study/c/lessons/q1", best: { correct: 4, total: 5 } }]);
});

test("A Quiz that lists no Readings is offered after the reading-flow Lesson right before it", () => {
  assert.deepEqual(quizOffersAfter("c", course, "r3").map((offer) => [offer.lessonId, offer.best]), [["q2", null]]);
  assert.deepEqual(quizOffersAfter("c", course, "g"), [], "Nothing is offered after the Goal Check.");
});

test("A Quiz's status reads as its best score, or not taken", () => {
  assert.equal(quizStatusText({ correct: 4, total: 5 }), "best 4/5");
  assert.equal(quizStatusText(null), "not taken");
  assert.equal(quizStatusText(undefined), "not taken");
});
