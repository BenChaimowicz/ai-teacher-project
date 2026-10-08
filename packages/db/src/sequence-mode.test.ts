import assert from "node:assert/strict";
import { test } from "node:test";
import { canSwitchSequenceMode, lockedLessonIds, parseSequenceMode } from "./sequence-mode.ts";

const lessons = [
  { id: "r1", teachingMethod: "reading" },
  { id: "r2", teachingMethod: "reading" },
  { id: "quiz1", teachingMethod: "quiz" },
  { id: "r3", teachingMethod: "reading" },
  { id: "quiz2", teachingMethod: "quiz" },
  { id: "r4", teachingMethod: "reading" },
];

test("Linear: everything after the first Quiz not passed is locked; readings before it stay open", () => {
  assert.deepEqual([...lockedLessonIds(lessons, new Set(), "linear")], ["r3", "quiz2", "r4"]);
  assert.deepEqual([...lockedLessonIds(lessons, new Set(["quiz1"]), "linear")], ["r4"]);
  assert.deepEqual([...lockedLessonIds(lessons, new Set(["quiz1", "quiz2"]), "linear")], []);
});

test("Free jump locks nothing, whether or not Quizzes are passed", () => {
  assert.deepEqual([...lockedLessonIds(lessons, new Set(), "free_jump")], []);
});

test("Sequence mode only switches linear → free jump; linear cannot be restored", () => {
  assert.equal(canSwitchSequenceMode("linear", "free_jump"), true);
  assert.equal(canSwitchSequenceMode("free_jump", "linear"), false);
  assert.equal(canSwitchSequenceMode("free_jump", "free_jump"), false);
  assert.equal(canSwitchSequenceMode("linear", "linear"), false);
  assert.equal(parseSequenceMode("free_jump"), "free_jump");
  assert.equal(parseSequenceMode("bogus"), "linear");
});
