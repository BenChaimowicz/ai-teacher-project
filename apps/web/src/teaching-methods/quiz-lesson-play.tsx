import { useRef } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { asPublicQuizBody, QuizView } from "@/components/learn/quiz-view.tsx";
import { recordQuizClose } from "@/components/learn/take-quiz-card.tsx";
import { Button } from "@/components/ui/button.tsx";
import type { LessonPlayProps } from "@/teaching-methods/register.ts";

/**
 * Quiz-plugin `render`. The screen lives in `components/learn/quiz-view.tsx`. A Quiz is optional and sits outside the
 * reading flow (SEN-133): it opens from "Take quiz" as a screen of its own, and "Back to reading" closes it, records the
 * close, and returns the Learner to where they came from.
 */
export function QuizLessonPlay({ courseId, lesson, onPayload, lessonNumber, returnTo }: LessonPlayProps) {
  const navigate = useNavigate();
  const submittedHere = useRef(false);
  const body = asPublicQuizBody(lesson.body);

  /** Closes the Quiz: records it, then goes back to reading. */
  function close() {
    recordQuizClose(courseId, lesson.id, submittedHere.current);
    navigate(returnTo ?? `/study/${courseId}`);
  }

  const back = (
    <div className="l-quiz-close">
      <Button variant="quiet" onClick={close}>
        <ArrowLeft aria-hidden="true" /> Back to reading
      </Button>
    </div>
  );

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
      onSubmitted={() => {
        submittedHere.current = true;
      }}
      close={back}
    />
  );
}
