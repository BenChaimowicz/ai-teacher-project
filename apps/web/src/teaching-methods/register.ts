import { READING_METHOD_ID } from "@senoy/db/reading-lesson";
import type { ComponentType } from "react";
import type { StudyLesson, StudyPayload } from "@/lib/study-types.ts";
import { ReadingLessonPlay } from "@/teaching-methods/reading-lesson-play.tsx";

/** Props shared by teaching-method `render` components. */
export type LessonPlayProps = {
  courseId: string;
  lesson: StudyLesson;
  sectionAdvance: "manual" | "continuous";
  onPayload: (payload: StudyPayload) => void;
};

const renders: Record<string, ComponentType<LessonPlayProps>> = {
  [READING_METHOD_ID]: ReadingLessonPlay,
};

/**
 * Reading Teaching-method plugin `render`. Generate and validate are later tickets.
 * @param method - Lesson teaching method
 */
export function renderForTeachingMethod(method: string): ComponentType<LessonPlayProps> | null {
  return renders[method] ?? null;
}
