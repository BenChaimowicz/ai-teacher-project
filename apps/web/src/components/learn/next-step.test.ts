import { test } from "node:test";
import assert from "node:assert/strict";
import type { StudyLesson } from "../../lib/study-types.ts";
import { nextStep, stepAfter } from "./next-step.ts";

const lesson = (id: string, teachingMethod: "reading" | "quiz" | "goal_check", completed: boolean): StudyLesson => ({
  id, title: `Lesson ${id}`, teachingMethod, position: 0, lessonGoal: "", completed, locked: false, citations: [], body: {},
});

test("nextStep: a reading next, a quiz next, nothing yet, and the Course-complete screen", () => {
  assert.deepEqual(nextStep("c", lesson("r2", "reading", false), false), { to: "/study/c/lessons/r2", kind: "reading", description: "Lesson r2 · reading" });
  assert.deepEqual(nextStep("c", lesson("q1", "quiz", false), false), { to: "/study/c/lessons/q1", kind: "quiz", description: "Lesson q1 · quiz" });
  assert.equal(nextStep("c", null, false), null);
  assert.deepEqual(nextStep("c", null, true), { to: "/study/c/complete", kind: "finish", description: "See what you covered" });
});

test("nextStep: a complete Course revisited mid-way still points at the following Lesson", () => {
  assert.equal(nextStep("c", lesson("q1", "quiz", true), true)?.kind, "quiz");
});

test("stepAfter: the first Reading leads to the quiz after it, before the payload says it is complete", () => {
  const lessons = [lesson("r1", "reading", false), lesson("q1", "quiz", false), lesson("r2", "reading", false)];
  assert.deepEqual(stepAfter("c", lessons, "r1"), { to: "/study/c/lessons/q1", kind: "quiz", description: "Lesson q1 · quiz" });
});

test("stepAfter: the last Lesson leads to Finish Course only once every other Lesson is complete", () => {
  const open = [lesson("r1", "reading", true), lesson("q1", "quiz", false), lesson("r2", "reading", false)];
  assert.deepEqual(stepAfter("c", open, "r2"), { to: "/study/c/lessons/q1", kind: "quiz", description: "Lesson q1 · quiz" });
  const done = [lesson("r1", "reading", true), lesson("q1", "quiz", true), lesson("r2", "reading", false)];
  assert.deepEqual(stepAfter("c", done, "r2"), { to: "/study/c/complete", kind: "finish", description: "See what you covered" });
});

test("stepAfter: a Lesson already complete gives the same step the finish line shows", () => {
  const lessons = [lesson("r1", "reading", true), lesson("q1", "quiz", false)];
  assert.equal(stepAfter("c", lessons, "r1")?.to, "/study/c/lessons/q1");
});

test("stepAfter: a Lesson not in the Course gives null", () => {
  assert.equal(stepAfter("c", [lesson("r1", "reading", false)], "nope"), null);
});

test("nextStep: the Goal Check is its own kind of step", () => {
  assert.deepEqual(nextStep("c", lesson("g", "goal_check", false), false), { to: "/study/c/lessons/g", kind: "goal_check", description: "Lesson g · goal check" });
});

test("stepAfter: the last Reading leads to the Goal Check, and the Goal Check to Finish Course once it is scored", () => {
  const lessons = [lesson("r1", "reading", true), lesson("q1", "quiz", true), lesson("r2", "reading", false), lesson("g", "goal_check", false)];
  assert.equal(stepAfter("c", lessons, "r2")?.kind, "goal_check");
  const read = lessons.map((row) => (row.id === "r2" ? { ...row, completed: true } : row));
  assert.deepEqual(stepAfter("c", read, "g"), { to: "/study/c/complete", kind: "finish", description: "See what you covered" });
});
