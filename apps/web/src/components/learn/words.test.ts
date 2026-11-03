import { test } from "node:test";
import assert from "node:assert/strict";
import type { StudyLesson, StudyPayload } from "../../lib/study-types.ts";
import { collectCourseWords, filterCourseWords } from "./words.ts";

const reading = (id: string, title: string, glossary: { term: string; definition: string }[] | undefined, locked = false): StudyLesson => ({
  id, title, teachingMethod: "reading", position: 0, lessonGoal: "", completed: false, locked, citations: [],
  body: { sections: [{ heading: "h", blocks: [{ kind: "prose", text: "Some prose." }] }], ...(glossary ? { glossary } : {}) },
});
const quiz = (id: string, locked = false): StudyLesson => ({
  id, title: "Quick check", teachingMethod: "quiz", position: 0, lessonGoal: "", completed: false, locked, citations: [],
  body: { items: [{ id: "q", prompt: "p", options: [] }], glossary: [{ term: "not a reading", definition: "ignored" }] },
});
const payload = (lessons: StudyLesson[]): StudyPayload => ({
  course: { id: "c", title: "Course", sequenceMode: "linear", completedAt: null },
  progress: { completed: 0, total: lessons.length },
  currentLessonId: lessons[0]!.id,
  modules: [{ id: "m", title: "Module", position: 0, lessons }],
});

const course = payload([
  reading("l1", "Agar", [{ term: "agar", definition: "A jelly." }, { term: "Cell wall", definition: "The outer layer." }]),
  quiz("l2"),
  reading("l3", "Walls", [{ term: "cell  wall", definition: "A later copy." }, { term: "peptidoglycan", definition: "A mesh." }]),
  reading("l4", "Locked", [{ term: "AGAR", definition: "Again." }, { term: "decolorizer", definition: "A rinse." }], true),
]);

test("words group by the Lesson that introduced them, numbered in Course order", () => {
  const words = collectCourseWords(course);
  assert.deepEqual(words.groups.map((group) => [group.lesson.number, group.lesson.id, group.words.map((word) => word.term)]), [
    [1, "l1", ["agar", "Cell wall"]],
    [3, "l3", ["peptidoglycan"]],
  ]);
  assert.equal(words.count, 3);
});
test("a term keeps its first definition, ignoring case and spacing", () => {
  const words = collectCourseWords(course);
  assert.equal(words.groups[0]!.words[1]!.definition, "The outer layer.");
  assert.ok(!words.groups.some((group) => group.words.some((word) => word.definition === "A later copy.")));
});
test("a locked Lesson's new words are counted, not listed; its repeats count nothing", () => {
  assert.equal(collectCourseWords(course).hidden, 1);
});
test("Quizzes and Readings with no glossary add nothing", () => {
  const words = collectCourseWords(payload([quiz("l1"), reading("l2", "Plain", undefined)]));
  assert.deepEqual(words, { groups: [], count: 0, hidden: 0 });
});
test("free jump: nothing locked, nothing hidden", () => {
  const open = payload(course.modules[0]!.lessons.map((lesson) => ({ ...lesson, locked: false })));
  const words = collectCourseWords(open);
  assert.equal(words.hidden, 0);
  assert.equal(words.count, 4);
  assert.deepEqual(words.groups.map((group) => group.lesson.number), [1, 3, 4]);
});
test("filter matches term or definition, ignoring case, and drops empty groups", () => {
  const words = collectCourseWords(course);
  assert.deepEqual(filterCourseWords(words, "  ").map((group) => group.lesson.id), ["l1", "l3"]);
  assert.deepEqual(filterCourseWords(words, "MESH").map((group) => [group.lesson.id, group.words.map((word) => word.term)]), [["l3", ["peptidoglycan"]]]);
  assert.deepEqual(filterCourseWords(words, "wall").map((group) => group.words.map((word) => word.term)), [["Cell wall"]]);
  assert.deepEqual(filterCourseWords(words, "zzz"), []);
});
