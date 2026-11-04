import assert from "node:assert/strict";
import { test } from "node:test";
import { canSwitchSequenceMode, lockedLessonIds, parseSequenceMode } from "./sequence-mode.ts";

const lessons = [
  { id: "r1", teachingMethod: "reading" },
  { id: "r2", teachingMethod: "reading" },
  { id: "quiz1", teachingMethod: "quiz", assessedLessonIds: ["r1", "r2"] },
  { id: "r3", teachingMethod: "reading" },
  { id: "quiz2", teachingMethod: "quiz", assessedLessonIds: ["r3"] },
  { id: "r4", teachingMethod: "reading" },
  { id: "goal", teachingMethod: "goal_check" },
];

test("Linear: Readings open in order; nothing after the first unread one opens yet", () => {
  assert.deepEqual([...lockedLessonIds(lessons, new Set(), "linear")], ["r2", "quiz1", "r3", "quiz2", "r4", "goal"]);
  assert.deepEqual([...lockedLessonIds(lessons, new Set(["r1"]), "linear")], ["quiz1", "r3", "quiz2", "r4", "goal"]);
});

test("Linear: a Quiz never gates; untaken Quizzes leave every later Reading and the Goal Check open", () => {
  assert.deepEqual([...lockedLessonIds(lessons, new Set(["r1", "r2", "r3", "r4"]), "linear")], []);
});

test("Linear: a Quiz opens once the Readings it covers are read, or the Readings before it when it lists none", () => {
  assert.equal(lockedLessonIds(lessons, new Set(["r1", "r2"]), "linear").has("quiz1"), false);
  assert.equal(lockedLessonIds(lessons, new Set(["r1", "r2"]), "linear").has("quiz2"), true);
  const unlisted = [{ id: "r1", teachingMethod: "reading" }, { id: "q", teachingMethod: "quiz" }];
  assert.equal(lockedLessonIds(unlisted, new Set(), "linear").has("q"), true);
  assert.equal(lockedLessonIds(unlisted, new Set(["r1"]), "linear").has("q"), false);
});

test("Free jump locks nothing", () => {
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
