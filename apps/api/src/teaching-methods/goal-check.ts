import { asQuizBody, GOAL_CHECK_METHOD_ID, parseGoalCheckBody, publicQuizBody } from "@senoy/db";
import { submittedScores } from "./quiz.ts";
import type { TeachingMethodPlugin } from "./types.ts";

/**
 * Goal Check plugin (SEN-81): plays like a Quiz, but completes on its first scored attempt whatever the score
 * (decision 2026-11-04). The answer key never reaches Study.
 */
export const goalCheckPlugin: TeachingMethodPlugin = {
  id: GOAL_CHECK_METHOD_ID,
  writeTimeFields: ["instructionLanguage"],
  showTimeFields: ["feedbackTiming", "feedbackDepth"],
  studyBody(raw) {
    const body = parseGoalCheckBody(raw);
    return body ? publicQuizBody(asQuizBody(body)) : null;
  },
  async complete(store, learnerId, lesson) {
    if (submittedScores(await store.listQuizAttempts(learnerId, lesson.id)).length === 0) {
      return { ok: false, status: 400, error: "Submit the Goal Check to complete it." };
    }
    await store.insertCompletion(learnerId, lesson.id);
    return { ok: true };
  },
};
