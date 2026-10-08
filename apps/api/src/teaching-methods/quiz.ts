import {
  bestQuizScore,
  isPassingScore,
  parseQuizBody,
  publicQuizBody,
  QUIZ_METHOD_ID,
  type QuizScore,
} from "@senoy/db";
import type { QuizAttemptRow } from "../lib/study-store.ts";
import type { TeachingMethodPlugin } from "./types.ts";

/**
 * Scores of submitted attempts.
 * @param attempts - Stored attempts
 */
export function submittedScores(attempts: QuizAttemptRow[]): QuizScore[] {
  return attempts
    .filter((row) => row.status === "submitted" && row.correct != null && row.total != null)
    .map((row) => ({ correct: row.correct!, total: row.total! }));
}

/** Quiz plugin: completes once the best submitted score is at least 70%. The answer key never reaches Study. */
export const quizPlugin: TeachingMethodPlugin = {
  id: QUIZ_METHOD_ID,
  writeTimeFields: ["instructionLanguage"],
  showTimeFields: ["feedbackTiming", "feedbackDepth"],
  studyBody(raw) {
    const body = parseQuizBody(raw);
    return body ? publicQuizBody(body) : null;
  },
  async complete(store, learnerId, lesson) {
    const best = bestQuizScore(submittedScores(await store.listQuizAttempts(learnerId, lesson.id)));
    if (!best || !isPassingScore(best)) {
      return { ok: false, status: 400, error: "Pass the Quiz with at least 70% to complete it." };
    }
    await store.insertCompletion(learnerId, lesson.id);
    return { ok: true };
  },
};
