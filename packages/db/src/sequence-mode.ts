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
 * Lessons the Learner cannot open yet. Free jump locks nothing. Linear means "Readings in order" (SEN-133): a Lesson
 * in the reading flow opens once every flow Lesson before it is complete, so the Goal Check opens once every Reading
 * is. A Quiz never gates anything; it opens once the Readings it covers are complete (the flow Lessons before it when
 * it lists none).
 * @param lessons - Lessons in Course order; a Quiz may carry the Lessons it assesses
 * @param completedIds - Completed Lessons
 * @param mode - Course Sequence mode
 */
export function lockedLessonIds(
  lessons: readonly { id: string; teachingMethod: string; assessedLessonIds?: readonly string[] }[],
  completedIds: ReadonlySet<string>,
  mode: SequenceMode,
): Set<string> {
  const locked = new Set<string>();
  if (mode === "free_jump") return locked;
  const flowBefore: string[] = [];
  let reached = true;
  for (const lesson of lessons) {
    if (lesson.teachingMethod === QUIZ_METHOD_ID) {
      const covered = lesson.assessedLessonIds?.length ? lesson.assessedLessonIds : flowBefore;
      if (!covered.every((id) => completedIds.has(id))) locked.add(lesson.id);
      continue;
    }
    if (!reached) locked.add(lesson.id);
    if (!completedIds.has(lesson.id)) reached = false;
    flowBefore.push(lesson.id);
  }
  return locked;
}
