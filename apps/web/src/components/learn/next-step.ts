// Relative imports on purpose: the node:test run (`tsx --test` from packages/db) has no `@/` alias.
import { GOAL_CHECK_METHOD_ID } from "@senoy/db/goal-check";
import { courseCompletePath, isCourseComplete, nextLessonId, studyPath } from "@senoy/db/progress";
import type { StudyLesson } from "../../lib/study-types.ts";

/**
 * Where the Learner goes once a Lesson is complete: the next Lesson (a reading, a quiz or the Goal Check), or the Course-complete
 * screen once every Lesson counts. It is the finish line's first tile, and the destination of the Reading's
 * "I've read it" tile, which completes the Lesson and goes there in the same click (decision 2026-11-03).
 */
export type NextStep = {
  to: string;
  kind: "reading" | "quiz" | "goal_check" | "finish";
  /** The next Lesson's title with its kind, or what the Course-complete screen offers. */
  description: string;
};

/**
 * The step after a Lesson, by the SEN-84 rules: the next Lesson `nextLessonId` picked, or Finish Course once every
 * Lesson is complete and nothing is left. The Goal Check counts here like any Lesson: it is the last one, and the
 * Course completes once it has a scored attempt (decision 2026-11-04).
 * @param courseId - Course
 * @param next - The Lesson `nextLessonId` picked, if any
 * @param courseComplete - Every Lesson is complete
 * @returns The step, or null when there is nowhere to go yet
 */
export function nextStep(courseId: string, next: StudyLesson | null, courseComplete: boolean): NextStep | null {
  if (courseComplete && !next) return { to: courseCompletePath(courseId), kind: "finish", description: "See what you covered" };
  if (!next) return null;
  if (next.teachingMethod === GOAL_CHECK_METHOD_ID) {
    return { to: studyPath(courseId, next.id), kind: "goal_check", description: `${next.title} · goal check` };
  }
  const kind = next.teachingMethod === "quiz" ? "quiz" : "reading";
  return { to: studyPath(courseId, next.id), kind, description: `${next.title} · ${kind}` };
}

/**
 * The step after `lessonId` once it is complete, read from the Course as it will be then: `lessonId` counts as
 * complete whatever the payload says now. Computed ahead of completion so the completion action can take the
 * Learner there in the same click; for a Lesson that is already complete it is the finish line's first tile.
 * @param courseId - Course
 * @param lessons - Every Lesson of the Course, in Course order
 * @param lessonId - The Lesson about to be completed
 * @returns The step, or null when `lessonId` is not in the Course or there is nowhere to go yet
 */
export function stepAfter(courseId: string, lessons: StudyLesson[], lessonId: string): NextStep | null {
  const ids = lessons.map((row) => row.id);
  const done = new Set(lessons.filter((row) => row.completed || row.id === lessonId).map((row) => row.id));
  const nextId = nextLessonId(ids, done, lessonId);
  const next = lessons.find((row) => row.id === nextId) ?? null;
  return nextStep(courseId, next, isCourseComplete(ids, done));
}
