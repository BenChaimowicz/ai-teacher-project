import { asPublicQuizBody, QuizView } from "@/components/learn/quiz-view.tsx";
import type { LessonPlayProps } from "@/teaching-methods/register.ts";

/**
 * Quiz-plugin `render`. The screen lives in `components/learn/quiz-view.tsx`.
 */
export function QuizLessonPlay({ courseId, lesson, onPayload, lessonNumber, finish }: LessonPlayProps) {
  const body = asPublicQuizBody(lesson.body);
  if (!body) return <p className="l-error">This Quiz has no questions.</p>;
  return (
    <QuizView
      courseId={courseId}
      lessonId={lesson.id}
      title={lesson.title}
      lessonGoal={lesson.lessonGoal}
      lessonNumber={lessonNumber}
      body={body}
      onPayload={onPayload}
      finish={finish}
    />
  );
}
