// Relative imports on purpose: the node:test run (`tsx --test` from packages/db) has no `@/` alias.
import { flowLessonIds, studyPath } from "@senoy/db/progress";
import type { QuizScore } from "@senoy/db/quiz";
import { QUIZ_METHOD_ID } from "@senoy/db/reading-lesson";
import type { StudyLesson } from "../../lib/study-types.ts";

/** Where the Learner opened a Quiz from (SEN-133): its sidebar row, or the card after the last Reading it covers. */
export type QuizOpenedFrom = "sidebar" | "card";

/** Router state a "Take quiz" link carries: where closing the Quiz returns the Learner. */
export type QuizReturnState = { returnTo: string };

/** The "Take quiz" offer at the end of a Reading: the Quiz, and where it opens. */
export type QuizOffer = {
  lessonId: string;
  title: string;
  to: string;
  /** Best submitted score, or null while it is not taken. */
  best: QuizScore | null;
};

/**
 * The Readings a Quiz covers, falling back to the reading-flow Lessons right before it when it lists none.
 * @param lessons - Every Lesson of the Course, in Course order
 * @param quiz - The Quiz
 * @returns Covered Lesson ids
 */
function coveredIds(lessons: readonly StudyLesson[], quiz: StudyLesson): string[] {
  if (quiz.assessedLessonIds?.length) return quiz.assessedLessonIds;
  const before = lessons.slice(0, lessons.indexOf(quiz));
  const flow = flowLessonIds(before);
  const last = flow.at(-1);
  return last ? [last] : [];
}

/**
 * The Quizzes whose "Take quiz" offer sits at the end of this Reading: those whose covered Readings end here
 * (decision 2026-11-04). Usually one, at a Chapter's last Reading; none on most Readings.
 * @param courseId - Course
 * @param lessons - Every Lesson of the Course, in Course order
 * @param readingId - The Reading on screen
 * @returns Offers, in Course order
 */
export function quizOffersAfter(courseId: string, lessons: readonly StudyLesson[], readingId: string): QuizOffer[] {
  const order = new Map(lessons.map((lesson, index) => [lesson.id, index]));
  return lessons
    .filter((lesson) => lesson.teachingMethod === QUIZ_METHOD_ID)
    .filter((quiz) => {
      const covered = coveredIds(lessons, quiz);
      const last = covered.reduce<string | null>((best, id) => (best === null || (order.get(id) ?? -1) > (order.get(best) ?? -1) ? id : best), null);
      return last === readingId;
    })
    .map((quiz) => ({ lessonId: quiz.id, title: quiz.title, to: studyPath(courseId, quiz.id), best: quiz.quizBest ?? null }));
}

/**
 * A Quiz's state in a few words: its best score, or that it is not taken yet.
 * @param best - Best submitted score
 */
export function quizStatusText(best: QuizScore | null | undefined): string {
  return best ? `best ${best.correct}/${best.total}` : "not taken";
}
