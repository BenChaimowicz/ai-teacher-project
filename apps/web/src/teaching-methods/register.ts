import { QUIZ_METHOD_ID, READING_METHOD_ID } from "@senoy/db/reading-lesson";
import type { ComponentType } from "react";
import type { StudyLesson, StudyPayload } from "@/lib/study-types.ts";
import { QuizLessonPlay } from "@/teaching-methods/quiz-lesson-play.tsx";
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
  [QUIZ_METHOD_ID]: QuizLessonPlay,
};

/**
 * Teaching-method plugin `render` for a Lesson. Generate and validate are later tickets.
 * @param method - Lesson teaching method
 */
export function renderForTeachingMethod(method: string): ComponentType<LessonPlayProps> | null {
  return renders[method] ?? null;
}
