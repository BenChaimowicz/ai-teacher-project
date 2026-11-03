import { QUIZ_METHOD_ID, READING_METHOD_ID } from "@senoy/db/reading-lesson";
import type { ComponentType, ReactNode } from "react";
import type { NextStep } from "@/components/learn/next-step.ts";
import type { StudyLesson, StudyPayload } from "@/lib/study-types.ts";
import { QuizLessonPlay } from "@/teaching-methods/quiz-lesson-play.tsx";
import { ReadingLessonPlay } from "@/teaching-methods/reading-lesson-play.tsx";

/** Props shared by teaching-method `render` components. */
export type LessonPlayProps = {
  courseId: string;
  lesson: StudyLesson;
  sectionAdvance: "manual" | "continuous";
  onPayload: (payload: StudyPayload) => void;
  /** 1-based place of the Lesson in the Course, for the kicker ("lesson 03 · reading"). */
  lessonNumber?: number;
  /** Study's finish line (Next Lesson / Finish Course). The plugin shows it once the Lesson is complete. */
  finish?: ReactNode;
  /**
   * Where the Learner goes once this Lesson is complete (the finish line's first tile, computed ahead), so a plugin's
   * completion action can take them there in the same click. Null when there is nowhere to go yet.
   */
  next?: NextStep | null;
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
