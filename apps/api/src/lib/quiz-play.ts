import {
  asQuizBody,
  bestQuizScore,
  canSubmitQuiz,
  GOAL_CHECK_METHOD_ID,
  goalCheckFollowUpTopic,
  goalCheckOutcome,
  isAnswerCorrect,
  isPassingScore,
  optionNotes,
  parseGoalCheckBody,
  parseGoalCheckFeedback,
  parseGoalCheckNextStep,
  parseQuizAnswers,
  parseQuizBody,
  QUIZ_METHOD_ID,
  scoreQuiz,
  type FeedbackTiming,
  type GoalCheckNextStep,
  type GoalCheckResult,
  type QuizAnswers,
  type QuizAttemptStatus,
  type QuizBody,
  type QuizScore,
  type ResolvedTeachingProfile,
} from "@senoy/db";
import { goalCheckPlugin } from "../teaching-methods/goal-check.ts";
import { quizPlugin, submittedScores } from "../teaching-methods/quiz.ts";
import {
  goalCheckResultOf,
  LOCKED_LESSON_ERROR,
  loadCourseContext,
  recordCourseCompletion,
  studyPayload,
  type CourseContext,
  type StudyCoursePayload,
} from "./study.ts";
import type { GoalCheckFeedbackRow, LessonRow, QuizAttemptRow, StudyStore } from "./study-store.ts";
import { recordProductEvent } from "./usage-tracking.ts";

/** The attempt Study shows: the open draft, or the last submitted one. */
export type QuizAttemptView = {
  status: QuizAttemptStatus;
  answers: QuizAnswers;
  /** Right/wrong per item, only for items that have feedback: checked in a per-item draft, or every item once submitted. */
  results: Record<string, boolean>;
  /**
   * The correct answer and its explanation, for exactly the items in `results`. An item's key reaches the
   * browser only once the Learner has answered it and it has feedback: on Check (per-item) or on Submit.
   */
  answerKeys: Record<string, QuizAnswerKey>;
  score: QuizScore | null;
};

/** Learner state of one Quiz. Carries an item's answer key only after that item has feedback. */
export type QuizView = {
  /** Timing of the open draft, otherwise the Teaching Profile value the next attempt will use. */
  feedbackTiming: FeedbackTiming;
  attempt: QuizAttemptView | null;
  best: QuizScore | null;
  /** A Quiz: the best score is at least 70%. A Goal Check: it has a scored attempt, whatever the score. */
  passed: boolean;
  /**
   * Only on a Goal Check with a scored attempt (SEN-81): the result on the best attempt, and what the Learner said was
   * missing after "not met" (null until they send it). Absent on a Quiz and before the first Submit.
   */
  goal?: GoalCheckView;
};

/** A Goal Check's result plus the Learner's feedback on it. */
export type GoalCheckView = GoalCheckResult & { feedback: GoalCheckFeedbackRow | null };

/** A revealed correct answer at the Learner's current Feedback detail. */
export type QuizAnswerKey = {
  itemId: string;
  correctOptionId: string;
  explanation: string;
  /** Each option's one-sentence why, by option id (decision 2026-11-03); absent on a Quiz written without them. */
  optionNotes?: Record<string, string>;
};

/** A Quiz error the route sends as-is. */
type QuizError = { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** Result of a Quiz read or write. */
export type QuizResult = { ok: true; quiz: QuizView } | QuizError;

/** Result of Submit; Progress may have changed. */
export type QuizSubmitResult = { ok: true; quiz: QuizView; study: StudyCoursePayload } | QuizError;

/** Who is playing which Quiz, and their current Teaching Profile. */
export type QuizRequest = {
  learnerId: string;
  courseId: string;
  lessonId: string;
  profile: ResolvedTeachingProfile;
};

/** Loaded Quiz plus its attempts, and the Course it was loaded from. */
type QuizContext = {
  course: CourseContext;
  lesson: LessonRow;
  /** The Lesson is the Goal Check, played on the Quiz routes. */
  isGoalCheck: boolean;
  body: QuizBody;
  /** Goal Check only: the Learner's feedback; null otherwise. */
  feedback: GoalCheckFeedbackRow | null;
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
  // The attempts are keyed by the requested Lesson, so they load with the Course; they're dropped if it isn't a Quiz here.
  const [context, attempts] = await Promise.all([
    loadCourseContext(store, request.learnerId, request.courseId),
    store.listQuizAttempts(request.learnerId, request.lessonId),
  ]);
  if (!context) return { ok: false, status: 404, error: "Published Course not found." };
  const lesson = context.lessons.find((row) => row.id === request.lessonId);
  const isGoalCheck = lesson?.teachingMethod === GOAL_CHECK_METHOD_ID;
  if (!lesson || (lesson.teachingMethod !== QUIZ_METHOD_ID && !isGoalCheck)) {
    return { ok: false, status: 404, error: "Quiz not found." };
  }
  if (context.lockedIds.has(lesson.id)) return { ok: false, status: 403, error: LOCKED_LESSON_ERROR };
  const goalBody = isGoalCheck ? parseGoalCheckBody(lesson.body) : null;
  const body = isGoalCheck ? (goalBody ? asQuizBody(goalBody) : null) : parseQuizBody(lesson.body);
  if (!body) {
    return { ok: false, status: 400, error: isGoalCheck ? "This Goal Check has no questions." : "This Quiz has no questions." };
  }
  const feedback = isGoalCheck ? await store.getGoalCheckFeedback(request.learnerId, lesson.id) : null;
  const draft = attempts.find((row) => row.status === "draft") ?? null;
  return { course: context, lesson, isGoalCheck, body, feedback, attempts, draft, latest: draft ?? attempts.at(-1) ?? null };
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
    const answerKeys: Record<string, QuizAnswerKey> = {};
    for (const item of quiz.body.items) {
      const answer = answers[item.id];
      if (!answer || !(submitted || answer.checked)) continue;
      results[item.id] = isAnswerCorrect(item, answer);
      const notes = optionNotes(item);
      answerKeys[item.id] = {
        itemId: item.id,
        correctOptionId: item.correctOptionId,
        explanation: item.explanations[profile.feedbackDepth.value],
        ...(notes ? { optionNotes: notes } : {}),
      };
    }
    attempt = {
      status: quiz.latest.status,
      answers,
      results,
      answerKeys,
      score: submitted ? scoreQuiz(quiz.body, answers) : null,
    };
  }
  const view: QuizView = {
    feedbackTiming: quiz.draft?.feedbackTiming ?? profile.feedbackTiming.value,
    attempt,
    best,
    passed: best != null && (quiz.isGoalCheck || isPassingScore(best)),
  };
  if (quiz.isGoalCheck) {
    const result = goalCheckResultOf(quiz.lesson, quiz.attempts);
    if (result) view.goal = { ...result, feedback: quiz.feedback };
  }
  return view;
}

/**
 * Product event kind for a Quiz action, or its Goal Check twin.
 * @param quiz - Loaded Quiz
 * @param action - What the Learner did
 */
function eventKind<A extends "answer_checked" | "submitted" | "retaken">(quiz: QuizContext, action: A) {
  return quiz.isGoalCheck ? (`goal_check_${action}` as const) : (`quiz_${action}` as const);
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
    await store.updateQuizAttempt(request.learnerId, quiz.draft.id, { answers });
    return reload(store, request);
  });
}

/**
 * Per-item timing: locks one answered item and gives it right/wrong, plus the correct answer and why.
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
      await store.updateQuizAttempt(request.learnerId, quiz.draft.id, { answers });
      const item = quiz.body.items.find((row) => row.id === itemId);
      void recordProductEvent(eventKind(quiz, "answer_checked"), {
        learnerId: request.learnerId,
        detail: { courseId: request.courseId, lessonId: request.lessonId, itemId, correct: item ? isAnswerCorrect(item, answer) : null },
      });
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
    await store.updateQuizAttempt(request.learnerId, quiz.draft.id, {
      status: "submitted",
      answers,
      correct: score.correct,
      total: score.total,
      submittedAt: new Date(),
    });

    // A Goal Check completes on any scored attempt; a Quiz only on a pass.
    const plugin = quiz.isGoalCheck ? goalCheckPlugin : quizPlugin;
    const outcome = await plugin.complete(store, request.learnerId, quiz.lesson);
    if (!outcome.ok && (quiz.isGoalCheck || isPassingScore(score))) throw new Error(outcome.error);
    const scored = { courseId: request.courseId, lessonId: request.lessonId, correct: score.correct, total: score.total };
    void recordProductEvent(eventKind(quiz, "submitted"), {
      learnerId: request.learnerId,
      detail: quiz.isGoalCheck
        ? { ...scored, outcome: goalCheckOutcome(score), feedbackTiming: quiz.draft.feedbackTiming }
        : { ...scored, passed: isPassingScore(score), feedbackTiming: quiz.draft.feedbackTiming },
    });
    if (outcome.ok) await recordCourseCompletion(store, request.learnerId, request.courseId);

    // One reload serves both the Quiz and the Study payload.
    const next = await loadQuiz(store, request);
    if ("ok" in next) return next;
    const study = studyPayload(next.course);
    if (!study) return { ok: false, status: 404, error: "Published Course not found." };
    return { ok: true, quiz: quizView(next, request.profile), study };
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
      void recordProductEvent(eventKind(quiz, "retaken"), {
        learnerId: request.learnerId,
        detail: { courseId: request.courseId, lessonId: request.lessonId, lastCorrect: quiz.latest.correct, lastTotal: quiz.latest.total },
      });
    }
    return reload(store, request);
  });
}

/** Where the Learner opened a Quiz from (SEN-133): its sidebar row, or the card after the last Reading it covers. */
export const QUIZ_OPENED_FROM = ["sidebar", "card"] as const;
export type QuizOpenedFrom = (typeof QUIZ_OPENED_FROM)[number];

/** Result of recording a Quiz open or close: nothing on success, since it changes no Study state. */
export type QuizVisitResult = { ok: true } | QuizError;

/**
 * Records that the Learner opened a Quiz from "Take quiz" (SEN-133). It writes no Study state, only the product event,
 * with where they opened it and whether they had handed it in before. Only a Chapter Quiz counts; the Goal Check is a
 * stop in the reading flow and is opened by Next.
 * @param store - Study store
 * @param request - Quiz request
 * @param from - Where it was opened (unvalidated JSON)
 */
export function openQuiz(store: StudyStore, request: QuizRequest, from: unknown): Promise<QuizVisitResult> {
  return withQuiz("openQuiz", store, request, async (quiz) => {
    if (quiz.isGoalCheck) return { ok: false, status: 404, error: "Quiz not found." };
    if (typeof from !== "string" || !(QUIZ_OPENED_FROM as readonly string[]).includes(from)) {
      return { ok: false, status: 400, error: `from must be one of ${QUIZ_OPENED_FROM.join(", ")}.` };
    }
    void recordProductEvent("quiz_opened", {
      learnerId: request.learnerId,
      detail: {
        courseId: request.courseId,
        lessonId: request.lessonId,
        title: quiz.lesson.title,
        from,
        takenBefore: quiz.attempts.some((row) => row.status === "submitted"),
      },
    });
    return { ok: true };
  });
}

/**
 * Records that the Learner closed a Quiz and went back to reading (SEN-133). It writes no Study state, only the product
 * event, with whether they handed it in during that visit.
 * @param store - Study store
 * @param request - Quiz request
 * @param submitted - Whether the Learner handed it in during this visit (unvalidated JSON)
 */
export function closeQuiz(store: StudyStore, request: QuizRequest, submitted: unknown): Promise<QuizVisitResult> {
  return withQuiz("closeQuiz", store, request, async (quiz) => {
    if (quiz.isGoalCheck) return { ok: false, status: 404, error: "Quiz not found." };
    if (typeof submitted !== "boolean") return { ok: false, status: 400, error: "submitted must be true or false." };
    void recordProductEvent("quiz_closed", {
      learnerId: request.learnerId,
      detail: { courseId: request.courseId, lessonId: request.lessonId, title: quiz.lesson.title, submitted },
    });
    return { ok: true };
  });
}

/** Result of sending Goal Check feedback. */
export type GoalCheckFeedbackResult = { ok: true; feedback: GoalCheckFeedbackRow } | QuizError;

/** Result of choosing a next step. `newCourseHref` is set for `new_course`: a Course Request prefilled from what was missing. */
export type GoalCheckNextStepResult =
  | { ok: true; nextStep: GoalCheckNextStep; newCourseHref: string | null }
  | QuizError;

/**
 * The loaded Goal Check's current result, when it is "not met". Anything else is the error to send.
 * @param quiz - Loaded Quiz
 */
function notMetResult(quiz: QuizContext): GoalCheckResult | QuizError {
  if (!quiz.isGoalCheck) return { ok: false, status: 404, error: "Goal Check not found." };
  const result = goalCheckResultOf(quiz.lesson, quiz.attempts);
  if (!result) return { ok: false, status: 409, error: "Submit the Goal Check first." };
  if (result.outcome !== "not_met") {
    return { ok: false, status: 409, error: "Feedback is only asked for when the goal was not met." };
  }
  return result;
}

/**
 * Stores what the Learner says was missing after a "not met" Goal Check (decision 2026-11-04). Sending again replaces
 * the reasons and clears the next step, so it is chosen again.
 * @param store - Study store
 * @param request - Quiz request for the Goal Check
 * @param raw - Request body: `{ reasons, otherText }`
 */
export function sendGoalCheckFeedback(store: StudyStore, request: QuizRequest, raw: unknown): Promise<GoalCheckFeedbackResult> {
  return withQuiz("sendGoalCheckFeedback", store, request, async (quiz): Promise<GoalCheckFeedbackResult> => {
    const result = notMetResult(quiz);
    if ("ok" in result) return result;
    const feedback = parseGoalCheckFeedback(raw);
    if (!feedback) {
      return { ok: false, status: 400, error: "Pick at least one reason. \"Something else\" needs a few words, up to 500 characters." };
    }
    await store.saveGoalCheckFeedback(request.learnerId, quiz.lesson.id, feedback);
    void recordProductEvent("goal_check_feedback_given", {
      learnerId: request.learnerId,
      detail: {
        courseId: request.courseId, lessonId: request.lessonId, reasons: feedback.reasons, hasOtherText: feedback.otherText != null,
      },
    });
    return { ok: true, feedback: { ...feedback, nextStep: null } };
  });
}

/**
 * Stores what the Learner chose to do after a "not met" Goal Check and its feedback. `new_course` returns the New
 * Course Request link prefilled with the Course's subject and what was missing.
 * @param store - Study store
 * @param request - Quiz request for the Goal Check
 * @param raw - Request field `nextStep`
 */
export function chooseGoalCheckNextStep(store: StudyStore, request: QuizRequest, raw: unknown): Promise<GoalCheckNextStepResult> {
  return withQuiz("chooseGoalCheckNextStep", store, request, async (quiz): Promise<GoalCheckNextStepResult> => {
    const result = notMetResult(quiz);
    if ("ok" in result) return result;
    if (!quiz.feedback) return { ok: false, status: 409, error: "Say what was missing first." };
    const nextStep = parseGoalCheckNextStep(raw);
    if (!nextStep) return { ok: false, status: 400, error: "nextStep must be new_course or nothing." };
    await store.setGoalCheckNextStep(request.learnerId, quiz.lesson.id, nextStep);
    void recordProductEvent("goal_check_next_step_chosen", {
      learnerId: request.learnerId,
      detail: { courseId: request.courseId, lessonId: request.lessonId, nextStep },
    });
    const newCourseHref = nextStep === "new_course"
      ? newCourseRequestHref(quiz.course.course.subject, goalCheckFollowUpTopic(result, quiz.feedback))
      : null;
    return { ok: true, nextStep, newCourseHref };
  });
}

/**
 * The New Course Request page, prefilled: it reads `subject` and `topic` from the query.
 * @param subject - The Course's subject
 * @param topic - What was missing; left out when empty
 */
export function newCourseRequestHref(subject: string, topic: string): string {
  const query = new URLSearchParams({ subject, ...(topic ? { topic } : {}) });
  return `/new-course-request?${query.toString()}`;
}
