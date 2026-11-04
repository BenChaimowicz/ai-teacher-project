import { GOAL_CHECK_METHOD_ID } from "./goal-check.ts";
import { QUIZ_METHOD_ID } from "./reading-lesson.ts";

/**
 * The reading flow: every Lesson but the Quizzes, in Course order. Next, the Current Lesson and Course completion walk
 * it; a Quiz is opened from "Take quiz" and is never a stop in it (SEN-133). The Goal Check stays in it, last.
 * @param lessons - Lessons of the Course, in Course order
 * @returns Their ids, in the order given, without the Quizzes
 */
export function flowLessonIds(lessons: readonly { id: string; teachingMethod: string }[]): string[] {
  return lessons.filter((lesson) => lesson.teachingMethod !== QUIZ_METHOD_ID).map((lesson) => lesson.id);
}

/**
 * The Lessons Progress counts: the Readings. Quizzes are optional (SEN-133) and the Goal Check sits outside Progress
 * (decision 2026-11-04), so neither counts; Quiz scores are shown on their own.
 * @param lessons - Lessons of the Course
 * @returns Their ids, in the order given, without Quizzes and the Goal Check
 */
export function progressLessonIds(lessons: readonly { id: string; teachingMethod: string }[]): string[] {
  return lessons
    .filter((lesson) => lesson.teachingMethod !== QUIZ_METHOD_ID && lesson.teachingMethod !== GOAL_CHECK_METHOD_ID)
    .map((lesson) => lesson.id);
}

/**
 * First incomplete Lesson in Course order, or the last Lesson if every Lesson is complete.
 * @param lessonIds - Lesson ids in Course order
 * @param completedIds - Lessons that count toward Progress
 * @returns Current Lesson id, or null when the Course has no Lessons
 */
export function currentLessonId(lessonIds: string[], completedIds: ReadonlySet<string>): string | null {
  try {
    if (lessonIds.length === 0) return null;
    const incomplete = lessonIds.find((id) => !completedIds.has(id));
    return incomplete ?? lessonIds[lessonIds.length - 1] ?? null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[progress.ts: currentLessonId] Failed to resolve Current Lesson || ${message}`);
  }
}

/**
 * Study path for a published Course at its Current Lesson.
 * @param courseId - Published Course id
 * @param lessonId - Current Lesson id
 */
export function studyPath(courseId: string, lessonId: string): string {
  return `/study/${courseId}/lessons/${lessonId}`;
}

/**
 * The Lesson **Next Lesson** opens: the one after `fromId` in Course order, or, after the last Lesson,
 * the first incomplete one (free jump can leave earlier Lessons undone).
 * @param lessonIds - Lesson ids in Course order
 * @param completedIds - Lessons that count toward Progress
 * @param fromId - Lesson the Learner just finished
 * @returns Next Lesson id, or null when nothing is left
 */
export function nextLessonId(lessonIds: string[], completedIds: ReadonlySet<string>, fromId: string): string | null {
  const index = lessonIds.indexOf(fromId);
  if (index === -1) return null;
  const following = lessonIds[index + 1];
  if (following) return following;
  return lessonIds.find((id) => !completedIds.has(id)) ?? null;
}

/**
 * Whether every Lesson of a Course counts toward Progress. A Course with no Lessons is never complete.
 * @param lessonIds - Lesson ids of the Course
 * @param completedIds - Lessons that count toward Progress
 */
export function isCourseComplete(lessonIds: string[], completedIds: ReadonlySet<string>): boolean {
  return lessonIds.length > 0 && lessonIds.every((id) => completedIds.has(id));
}

/**
 * Course-complete screen path for a published Course.
 * @param courseId - Published Course id
 */
export function courseCompletePath(courseId: string): string {
  return `/study/${courseId}/complete`;
}
