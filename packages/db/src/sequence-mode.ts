import { QUIZ_METHOD_ID } from "./reading-lesson.ts";

/** Course-level unlock rule. Linear is the default; free jump is one-way. */
export type SequenceMode = "linear" | "free_jump";

/** All Sequence modes. */
export const SEQUENCE_MODES: SequenceMode[] = ["linear", "free_jump"];

/**
 * Reads a stored Sequence mode. Anything unknown is linear, the default.
 * @param raw - `published_courses.sequence_mode`
 */
export function parseSequenceMode(raw: unknown): SequenceMode {
  return raw === "free_jump" ? "free_jump" : "linear";
}

/**
 * True when a Course may move from one Sequence mode to another. Only linear → free jump; linear cannot be restored.
 * @param from - Current mode
 * @param to - Requested mode
 */
export function canSwitchSequenceMode(from: SequenceMode, to: SequenceMode): boolean {
  return from === "linear" && to === "free_jump";
}

/**
 * Lessons the Learner cannot open yet. In linear mode, every Lesson after the first Quiz that is not passed is locked.
 * Readings before that Quiz stay open, finished or not. Free jump locks nothing.
 * @param lessons - Lessons in Course order
 * @param completedIds - Completed Lessons (a Quiz is complete once passed)
 * @param mode - Course Sequence mode
 */
export function lockedLessonIds(
  lessons: { id: string; teachingMethod: string }[],
  completedIds: ReadonlySet<string>,
  mode: SequenceMode,
): Set<string> {
  const locked = new Set<string>();
  if (mode === "free_jump") return locked;
  const gate = lessons.findIndex((lesson) => lesson.teachingMethod === QUIZ_METHOD_ID && !completedIds.has(lesson.id));
  if (gate === -1) return locked;
  for (const lesson of lessons.slice(gate + 1)) locked.add(lesson.id);
  return locked;
}
