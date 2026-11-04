import { GoalCheckResultCard } from "@/components/learn/goal-check-result.tsx";
import { asPublicQuizBody, QuizView } from "@/components/learn/quiz-view.tsx";
import type { LessonPlayProps } from "@/teaching-methods/register.ts";

/**
 * Goal Check plugin `render` (SEN-81). It plays in the Quiz player, through the Quiz endpoints, with the Goal Check's
 * own copy and a result card that sets the best score against the Learning Goal in place of the Quiz score card.
 */
export function GoalCheckLessonPlay({ courseId, lesson, onPayload, finish, lessons = [], learningGoal }: LessonPlayProps) {
  const body = asPublicQuizBody(lesson.body);
  if (!body) return <p className="l-error">This Goal Check has no questions.</p>;
  return (
    <QuizView
      mode="goal_check"
      courseId={courseId}
      lessonId={lesson.id}
      title={lesson.title}
      lessonGoal={lesson.lessonGoal}
      body={body}
      onPayload={onPayload}
      finish={finish}
      result={(slot) =>
        slot.view.goal ? (
          <GoalCheckResultCard
            courseId={courseId}
            lessonId={lesson.id}
            learningGoal={learningGoal ?? lesson.lessonGoal}
            goal={slot.view.goal}
            attemptScore={slot.score}
            results={slot.results}
            lessons={lessons}
            busy={slot.busy}
            celebrate={slot.celebrate}
            onRetake={slot.onRetake}
          />
        ) : null
      }
    />
  );
}
