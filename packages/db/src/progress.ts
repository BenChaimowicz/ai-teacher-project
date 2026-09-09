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
