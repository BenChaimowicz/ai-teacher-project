import { test } from "node:test";
import assert from "node:assert/strict";
import type { StudyLesson } from "../../lib/study-types.ts";
import { nextStep, stepAfter } from "./next-step.ts";

const lesson = (id: string, teachingMethod: "reading" | "quiz" | "goal_check", completed: boolean): StudyLesson => ({
  id, title: `Lesson ${id}`, teachingMethod, position: 0, lessonGoal: "", completed, locked: false, citations: [], body: {},
});

test("nextStep: a reading next, nothing yet, and the Course-complete screen", () => {
  assert.deepEqual(nextStep("c", lesson("r2", "reading", false), false), { to: "/study/c/lessons/r2", kind: "reading", description: "Lesson r2 · reading" });
  assert.equal(nextStep("c", null, false), null);
  assert.deepEqual(nextStep("c", null, true), { to: "/study/c/complete", kind: "finish", description: "See what you covered" });
});

test("nextStep: a complete Course revisited mid-way still points at the following Lesson", () => {
  assert.equal(nextStep("c", lesson("r2", "reading", true), true)?.kind, "reading");
});

test("stepAfter: the last Reading of a Chapter leads to the next Reading, not the Quiz after it (SEN-133)", () => {
  const lessons = [lesson("r1", "reading", false), lesson("q1", "quiz", false), lesson("r2", "reading", false)];
  assert.deepEqual(stepAfter("c", lessons, "r1"), { to: "/study/c/lessons/r2", kind: "reading", description: "Lesson r2 · reading" });
});

test("stepAfter: the last Reading leads to Finish Course once every Reading is read, Quizzes taken or not", () => {
  const open = [lesson("r1", "reading", false), lesson("q1", "quiz", false), lesson("r2", "reading", false)];
  assert.deepEqual(stepAfter("c", open, "r2"), { to: "/study/c/lessons/r1", kind: "reading", description: "Lesson r1 · reading" });
  const read = [lesson("r1", "reading", true), lesson("q1", "quiz", false), lesson("r2", "reading", false)];
  assert.deepEqual(stepAfter("c", read, "r2"), { to: "/study/c/complete", kind: "finish", description: "See what you covered" });
});

test("stepAfter: a Lesson already complete gives the same step the finish line shows", () => {
  const lessons = [lesson("r1", "reading", true), lesson("q1", "quiz", false), lesson("r2", "reading", false)];
  assert.equal(stepAfter("c", lessons, "r1")?.to, "/study/c/lessons/r2");
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
