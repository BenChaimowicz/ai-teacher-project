import { GOAL_CHECK_METHOD_ID } from "@senoy/db/goal-check";
import { QUIZ_METHOD_ID, READING_METHOD_ID } from "@senoy/db/reading-lesson";
import type { ComponentType, ReactNode } from "react";
import type { NextStep } from "@/components/learn/next-step.ts";
import type { StudyLesson, StudyPayload } from "@/lib/study-types.ts";
import { GoalCheckLessonPlay } from "@/teaching-methods/goal-check-lesson-play.tsx";
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
  /**
   * Every Lesson of the Course, in Course order: the Goal Check links its missed objectives back to their Lessons, and
   * a Reading finds the optional Quiz offered at its end.
   */
  lessons?: StudyLesson[];
  /** A Quiz: where closing it returns the Learner (the Reading they came from, else the Current Lesson). SEN-133. */
  returnTo?: string;
  /** The Course's Learning Goal, which the Goal Check's result is set against. */
  learningGoal?: string;
};

const renders: Record<string, ComponentType<LessonPlayProps>> = {
  [READING_METHOD_ID]: ReadingLessonPlay,
  [QUIZ_METHOD_ID]: QuizLessonPlay,
  [GOAL_CHECK_METHOD_ID]: GoalCheckLessonPlay,
};

/**
 * Teaching-method plugin `render` for a Lesson. Generate and validate are later tickets.
 * @param method - Lesson teaching method
 */
export function renderForTeachingMethod(method: string): ComponentType<LessonPlayProps> | null {
  return renders[method] ?? null;
}
