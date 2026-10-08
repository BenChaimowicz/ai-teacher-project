import {
  bestQuizScore,
  canSubmitQuiz,
  isAnswerCorrect,
  isPassingScore,
  isPerfectScore,
  parseQuizAnswers,
  parseQuizBody,
  QUIZ_METHOD_ID,
  scoreQuiz,
  type FeedbackTiming,
  type QuizAnswers,
  type QuizAttemptStatus,
  type QuizBody,
  type QuizScore,
  type ResolvedTeachingProfile,
} from "@senoy/db";
import { quizPlugin, submittedScores } from "../teaching-methods/quiz.ts";
import { LOCKED_LESSON_ERROR, loadCourseContext, studyPayload, type StudyCoursePayload } from "./study.ts";
import type { LessonRow, QuizAttemptRow, StudyStore } from "./study-store.ts";

/** The attempt Study shows: the open draft, or the last submitted one. */
export type QuizAttemptView = {
  status: QuizAttemptStatus;
  answers: QuizAnswers;
  /** Right/wrong per item, only for items that have feedback: checked in a per-item draft, or every item once submitted. */
  results: Record<string, boolean>;
  score: QuizScore | null;
};

/** Learner state of one Quiz. Never carries the answer key. */
export type QuizView = {
  /** Timing of the open draft, otherwise the Teaching Profile value the next attempt will use. */
  feedbackTiming: FeedbackTiming;
  attempt: QuizAttemptView | null;
  best: QuizScore | null;
  passed: boolean;
  /** Correct answers may be opened while the best score is under 100%. */
  answersOpen: boolean;
};

/** A revealed correct answer at the Learner's current Feedback detail. */
export type QuizAnswerKey = {
  itemId: string;
  correctOptionId: string;
  explanation: string;
};

/** A Quiz error the route sends as-is. */
type QuizError = { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** Result of a Quiz read or write. */
export type QuizResult = { ok: true; quiz: QuizView } | QuizError;

/** Result of Submit; Progress may have changed. */
export type QuizSubmitResult = { ok: true; quiz: QuizView; study: StudyCoursePayload } | QuizError;

/** Result of opening one correct answer. */
export type QuizRevealResult = { ok: true; answer: QuizAnswerKey } | QuizError;

/** Who is playing which Quiz, and their current Teaching Profile. */
export type QuizRequest = {
  learnerId: string;
  courseId: string;
  lessonId: string;
  profile: ResolvedTeachingProfile;
};

/** Loaded Quiz plus its attempts. */
type QuizContext = {
  lesson: LessonRow;
  body: QuizBody;
  attempts: QuizAttemptRow[];
  draft: QuizAttemptRow | null;
  latest: QuizAttemptRow | null;
};

/**
 * Loads a playable Quiz: it exists, is a Quiz, is not locked, and has a valid body.
 * @param store - Study store
 * @param request - Quiz request
 */
async function loadQuiz(store: StudyStore, request: QuizRequest): Promise<QuizContext | QuizError> {
  const context = await loadCourseContext(store, request.learnerId, request.courseId);
  if (!context) return { ok: false, status: 404, error: "Published Course not found." };
  const lesson = context.lessons.find((row) => row.id === request.lessonId);
  if (!lesson || lesson.teachingMethod !== QUIZ_METHOD_ID) {
    return { ok: false, status: 404, error: "Quiz not found." };
  }
  if (context.lockedIds.has(lesson.id)) return { ok: false, status: 403, error: LOCKED_LESSON_ERROR };
  const body = parseQuizBody(lesson.body);
  if (!body) return { ok: false, status: 400, error: "This Quiz has no questions." };
  const attempts = await store.listQuizAttempts(request.learnerId, lesson.id);
  const draft = attempts.find((row) => row.status === "draft") ?? null;
  return { lesson, body, attempts, draft, latest: draft ?? attempts.at(-1) ?? null };
}

/**
 * Builds the Learner-facing state from a loaded Quiz.
 * @param quiz - Loaded Quiz
 * @param profile - Current Teaching Profile
 */
function quizView(quiz: QuizContext, profile: ResolvedTeachingProfile): QuizView {
  const best = bestQuizScore(submittedScores(quiz.attempts));
  let attempt: QuizAttemptView | null = null;
  if (quiz.latest) {
    const answers = parseQuizAnswers(quiz.latest.answers, quiz.body);
    const submitted = quiz.latest.status === "submitted";
    const results: Record<string, boolean> = {};
    for (const item of quiz.body.items) {
      const answer = answers[item.id];
      if (answer && (submitted || answer.checked)) results[item.id] = isAnswerCorrect(item, answer);
    }
    attempt = {
      status: quiz.latest.status,
      answers,
      results,
      score: submitted ? scoreQuiz(quiz.body, answers) : null,
    };
  }
  return {
    feedbackTiming: quiz.draft?.feedbackTiming ?? profile.feedbackTiming.value,
    attempt,
    best,
    passed: best != null && isPassingScore(best),
    answersOpen: best == null || !isPerfectScore(best),
  };
}

/**
 * Wraps a Quiz operation with load + error context.
 * @param name - Function name for the error trail
 * @param store - Study store
 * @param request - Quiz request
 * @param run - Operation body
 */
async function withQuiz<T>(
  name: string,
  store: StudyStore,
  request: QuizRequest,
  run: (quiz: QuizContext) => Promise<T | QuizError>,
): Promise<T | QuizError> {
  try {
    const quiz = await loadQuiz(store, request);
    if ("ok" in quiz) return quiz;
    return await run(quiz);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[quiz-play.ts: ${name}] Quiz operation failed || courseId=${request.courseId} || lessonId=${request.lessonId} || ${message}`,
    );
  }
}

/**
 * Reloads and returns the Quiz state after a write.
 * @param store - Study store
 * @param request - Quiz request
 */
async function reload(store: StudyStore, request: QuizRequest): Promise<QuizResult> {
  const quiz = await loadQuiz(store, request);
  if ("ok" in quiz) return quiz;
  return { ok: true, quiz: quizView(quiz, request.profile) };
}

/**
 * Current Quiz state: the open draft, the last submitted result, or nothing yet.
 * @param store - Study store
 * @param request - Quiz request
 */
export function getQuiz(store: StudyStore, request: QuizRequest): Promise<QuizResult> {
  return withQuiz("getQuiz", store, request, async (quiz) => ({ ok: true, quiz: quizView(quiz, request.profile) }));
}

/**
 * Saves one draft answer. The first answer opens a draft with the current Feedback timing.
 * A checked answer is locked; after Submit the Learner must Retake first.
 * @param store - Study store
 * @param request - Quiz request
 * @param itemId - Quiz item
 * @param optionId - Chosen option
 */
export function answerQuizItem(
  store: StudyStore,
  request: QuizRequest,
  itemId: unknown,
  optionId: unknown,
): Promise<QuizResult> {
  return withQuiz("answerQuizItem", store, request, async (quiz) => {
    const item = quiz.body.items.find((row) => row.id === itemId);
    if (!item) return { ok: false, status: 400, error: "Unknown question." };
    if (typeof optionId !== "string" || !item.options.some((option) => option.id === optionId)) {
      return { ok: false, status: 400, error: "Unknown option." };
    }
    if (!quiz.draft) {
      if (quiz.latest) return { ok: false, status: 409, error: "Start a retake to answer again." };
      await store.insertQuizAttempt(request.learnerId, quiz.lesson.id, request.profile.feedbackTiming.value, {
        [item.id]: { optionId, checked: false },
      });
      return reload(store, request);
    }
    const answers = parseQuizAnswers(quiz.draft.answers, quiz.body);
    if (answers[item.id]?.checked) return { ok: false, status: 409, error: "This answer is locked." };
    answers[item.id] = { optionId, checked: false };
    await store.updateQuizAttempt(quiz.draft.id, { answers });
    return reload(store, request);
  });
}

/**
 * Per-item timing: locks one answered item and gives it right/wrong.
 * @param store - Study store
 * @param request - Quiz request
 * @param itemId - Quiz item
 */
export function checkQuizItem(store: StudyStore, request: QuizRequest, itemId: unknown): Promise<QuizResult> {
  return withQuiz("checkQuizItem", store, request, async (quiz) => {
    if (!quiz.draft) return { ok: false, status: 409, error: "There is no open attempt." };
    if (quiz.draft.feedbackTiming !== "per_item") {
      return { ok: false, status: 409, error: "This attempt shows feedback after Submit." };
    }
    const answers = parseQuizAnswers(quiz.draft.answers, quiz.body);
    const answer = typeof itemId === "string" ? answers[itemId] : undefined;
    if (!answer) return { ok: false, status: 400, error: "Answer the question before checking it." };
    if (!answer.checked) {
      answer.checked = true;
      await store.updateQuizAttempt(quiz.draft.id, { answers });
    }
    return reload(store, request);
  });
}

/**
 * Scores the draft. A passing best score completes the Quiz through the plugin; Progress never drops.
 * @param store - Study store
 * @param request - Quiz request
 */
export function submitQuiz(store: StudyStore, request: QuizRequest): Promise<QuizSubmitResult> {
  return withQuiz("submitQuiz", store, request, async (quiz): Promise<QuizSubmitResult | QuizError> => {
    if (!quiz.draft) return { ok: false, status: 409, error: "There is no open attempt." };
    const answers = parseQuizAnswers(quiz.draft.answers, quiz.body);
    if (!canSubmitQuiz(quiz.body, answers, quiz.draft.feedbackTiming)) {
      const missing = quiz.draft.feedbackTiming === "per_item" ? "Check every question" : "Answer every question";
      return { ok: false, status: 400, error: `${missing} before submitting.` };
    }
    const score = scoreQuiz(quiz.body, answers);
    await store.updateQuizAttempt(quiz.draft.id, {
      status: "submitted",
      answers,
      correct: score.correct,
      total: score.total,
      submittedAt: new Date(),
    });

    const outcome = await quizPlugin.complete(store, request.learnerId, quiz.lesson);
    if (!outcome.ok && isPassingScore(score)) throw new Error(outcome.error);

    const next = await reload(store, request);
    if (!next.ok) return next;
    const context = await loadCourseContext(store, request.learnerId, request.courseId);
    const study = context ? studyPayload(context) : null;
    if (!study) return { ok: false, status: 404, error: "Published Course not found." };
    return { ok: true, quiz: next.quiz, study };
  });
}

/**
 * Opens a fresh draft on the same items, with the current Feedback timing. Best score is kept.
 * @param store - Study store
 * @param request - Quiz request
 */
export function retakeQuiz(store: StudyStore, request: QuizRequest): Promise<QuizResult> {
  return withQuiz("retakeQuiz", store, request, async (quiz) => {
    if (!quiz.draft) {
      if (!quiz.latest) return { ok: false, status: 409, error: "Submit the Quiz before retaking it." };
      await store.insertQuizAttempt(request.learnerId, quiz.lesson.id, request.profile.feedbackTiming.value, {});
    }
    return reload(store, request);
  });
}

/**
 * Opens one correct answer and its explanation at the current Feedback detail.
 * Only for an item that already has feedback, and only while the best score is under 100%.
 * @param store - Study store
 * @param request - Quiz request
 * @param itemId - Quiz item
 */
export function revealQuizAnswer(store: StudyStore, request: QuizRequest, itemId: unknown): Promise<QuizRevealResult> {
  return withQuiz("revealQuizAnswer", store, request, async (quiz): Promise<QuizRevealResult | QuizError> => {
    const item = quiz.body.items.find((row) => row.id === itemId);
    if (!item) return { ok: false, status: 400, error: "Unknown question." };
    const view = quizView(quiz, request.profile);
    if (!view.answersOpen) {
      return { ok: false, status: 409, error: "Correct answers close once your best score is 100%." };
    }
    if (!view.attempt || !(item.id in view.attempt.results)) {
      return { ok: false, status: 409, error: "Answer this question and get feedback first." };
    }
    return {
      ok: true,
      answer: {
        itemId: item.id,
        correctOptionId: item.correctOptionId,
        explanation: item.explanations[request.profile.feedbackDepth.value],
      },
    };
  });
}
