import { ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { quizStatusText, type QuizOffer, type QuizOpenedFrom, type QuizReturnState } from "@/components/learn/take-quiz.ts";
import { apiFetch } from "@/lib/api.ts";
import "@/components/learn/learn.css";

/**
 * Posts one Quiz visit event. Fire and forget: a failure never reaches the Learner.
 * @param courseId - Course
 * @param lessonId - The Quiz
 * @param action - `opens` or `closes`
 * @param body - JSON body
 */
function postQuizVisit(courseId: string, lessonId: string, action: "opens" | "closes", body: object) {
  void apiFetch(`/api/courses/${courseId}/lessons/${lessonId}/quiz/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

/**
 * Records that the Learner opened a Quiz from "Take quiz" (SEN-133).
 * @param courseId - Course
 * @param lessonId - The Quiz
 * @param from - Where they opened it
 */
export function recordQuizOpen(courseId: string, lessonId: string, from: QuizOpenedFrom) {
  postQuizVisit(courseId, lessonId, "opens", { from });
}

/**
 * Records that the Learner closed a Quiz and went back to reading (SEN-133).
 * @param courseId - Course
 * @param lessonId - The Quiz
 * @param submitted - They handed it in during this visit
 */
export function recordQuizClose(courseId: string, lessonId: string, submitted: boolean) {
  postQuizVisit(courseId, lessonId, "closes", { submitted });
}

/**
 * The "Take quiz" tile under a finished Reading (decision 2026-11-04): optional, never in the way of Next, and it
 * shows whether the Quiz was taken and the best score. Closing the Quiz brings the Learner back to `returnTo`.
 * @param courseId - Course
 * @param offer - The Quiz on offer
 * @param returnTo - Where closing the Quiz returns
 */
export function TakeQuizTile({ courseId, offer, returnTo }: { courseId: string; offer: QuizOffer; returnTo: string }) {
  const state: QuizReturnState = { returnTo };
  return (
    <nav aria-label="Take quiz" className="k-tiles one flush l-takequiz">
      <Link to={offer.to} state={state} className="k-tile" onClick={() => recordQuizOpen(courseId, offer.lessonId, "card")}>
        <span className="ti" aria-hidden="true">
          <ClipboardCheck />
        </span>
        <span>
          <span className="tt">Take quiz</span>
          <span className="td">
            {offer.title} · optional · {quizStatusText(offer.best)}
          </span>
        </span>
      </Link>
    </nav>
  );
}
