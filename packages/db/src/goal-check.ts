import { QUIZ_PASS_RATIO, parseQuizItems, type QuizAnswers, type QuizBody, type QuizItem, type QuizScore } from "./quiz.ts";

/**
 * Teaching-method id for the Goal Check (SEN-81): the one Lesson at the end of every Course that checks the Learning
 * Goal itself, not the chunk just taught. It plays like a Quiz (four options, single correct, decision 2026-11-04) but
 * is planned from the Learning Goal, sits outside Progress, and completes on its first scored attempt.
 */
export const GOAL_CHECK_METHOD_ID = "goal_check" as const;

/** Fewest and most items a Goal Check holds. More than a Quiz's 5–10: it covers the whole Course. */
export const GOAL_CHECK_MIN_ITEMS = 6;
export const GOAL_CHECK_MAX_ITEMS = 12;

/** Fewest and most goal objectives a Goal Check slot lists. Each one is a part of the Learning Goal. */
export const MIN_GOAL_OBJECTIVES = 2;
export const MAX_GOAL_OBJECTIVES = 6;

/** Best `correct / n` at or above this is "met": the same bar as a Quiz pass (decision 2026-11-04). */
export const GOAL_MET_RATIO = QUIZ_PASS_RATIO;

/** Best `correct / n` at or above this, and below {@link GOAL_MET_RATIO}, is "partly met" (decision 2026-11-04). */
export const GOAL_PARTLY_MET_RATIO = 0.5;

/** How far the Learner got toward the Learning Goal, by best score. */
export const GOAL_CHECK_OUTCOMES = ["met", "partly_met", "not_met"] as const;
export type GoalCheckOutcome = (typeof GOAL_CHECK_OUTCOMES)[number];

/** A Goal Check item: a Quiz item that names the goal objective it checks, one of its slot's objectives. */
export type GoalCheckItem = QuizItem & { objective: string };

/** Method-private body of a Goal Check Lesson. Stored in `published_lessons.body` like a Quiz body. */
export type GoalCheckBody = { items: GoalCheckItem[] };

/**
 * Reads a Goal Check body: a Quiz-shaped body of {@link GOAL_CHECK_MIN_ITEMS}–{@link GOAL_CHECK_MAX_ITEMS} items, each
 * naming its objective. Anything short of that is null.
 * @param raw - `published_lessons.body`
 */
export function parseGoalCheckBody(raw: unknown): GoalCheckBody | null {
  const items = parseQuizItems(raw, GOAL_CHECK_MIN_ITEMS, GOAL_CHECK_MAX_ITEMS);
  if (!items) return null;
  if (items.some((item) => !item.objective?.trim())) return null;
  return { items: items as GoalCheckItem[] };
}

/**
 * The Goal Check body as a Quiz body, so the Quiz scoring and answer helpers work on it unchanged.
 * @param body - Parsed Goal Check body
 */
export function asQuizBody(body: GoalCheckBody): QuizBody {
  return body;
}

/**
 * Where a best score lands against the Learning Goal.
 * @param score - Best scored attempt
 */
export function goalCheckOutcome(score: QuizScore): GoalCheckOutcome {
  const ratio = score.total === 0 ? 0 : score.correct / score.total;
  if (ratio >= GOAL_MET_RATIO) return "met";
  if (ratio >= GOAL_PARTLY_MET_RATIO) return "partly_met";
  return "not_met";
}

/**
 * The best of several scored attempts: the highest `correct / total`, the earliest on a tie (as `bestQuizScore`).
 * @param attempts - Submitted attempts with their scores
 * @returns The best attempt, or null before the first Submit
 */
export function bestGoalCheckAttempt<T extends { score: QuizScore }>(attempts: readonly T[]): T | null {
  let best: T | null = null;
  for (const attempt of attempts) {
    if (!best || attempt.score.correct / attempt.score.total > best.score.correct / best.score.total) best = attempt;
  }
  return best;
}

/** A goal objective the best attempt missed, with the published Lessons that teach it. */
export type MissedObjective = { objective: string; lessonIds: string[] };

/** What the Learner sees after a Goal Check: the outcome, the best score, and what to go back to. */
export type GoalCheckResult = {
  outcome: GoalCheckOutcome;
  best: QuizScore;
  missedObjectives: MissedObjective[];
};

/**
 * The result of a Goal Check from its best attempt. An objective is missed when any of its items was answered wrong
 * in that attempt. Missed objectives keep the order of `objectives`; the map's key order is not used, since Postgres
 * `jsonb` does not keep it.
 * @param body - Parsed Goal Check body
 * @param bestAnswers - Answers of the best submitted attempt
 * @param objectives - `published_lessons.objectives`: the goal objectives in slot order
 * @param objectiveLessonIds - `published_lessons.objective_lesson_ids`: each objective's teaching Lessons
 */
export function goalCheckResult(
  body: GoalCheckBody,
  bestAnswers: QuizAnswers,
  objectives: readonly string[],
  objectiveLessonIds: Record<string, string[]>,
): GoalCheckResult {
  const missed: string[] = [];
  let correct = 0;
  for (const item of body.items) {
    const right = bestAnswers[item.id]?.optionId === item.correctOptionId;
    if (right) correct += 1;
    else if (!missed.includes(item.objective)) missed.push(item.objective);
  }
  missed.sort((a, b) => rank(objectives, a) - rank(objectives, b));
  const best = { correct, total: body.items.length };
  return {
    outcome: goalCheckOutcome(best),
    best,
    missedObjectives: missed.map((objective) => ({ objective, lessonIds: objectiveLessonIds[objective] ?? [] })),
  };
}

/**
 * Index of `value` in `order`, with anything absent last.
 * @param order - Known order
 * @param value - Value to place
 */
function rank(order: readonly string[], value: string): number {
  const index = order.indexOf(value);
  return index === -1 ? order.length : index;
}

/**
 * Why a "not met" Course fell short, as the Learner says (decision 2026-11-04). More than one may be picked; `other`
 * needs free text.
 */
export const GOAL_CHECK_MISSING_REASONS = ["too_advanced", "too_basic", "missing_topic", "too_theoretical", "other"] as const;
export type GoalCheckMissingReason = (typeof GOAL_CHECK_MISSING_REASONS)[number];

/** What the Learner reads for each reason. */
export const GOAL_CHECK_MISSING_REASON_LABELS: Record<GoalCheckMissingReason, string> = {
  too_advanced: "Too advanced for me",
  too_basic: "Too basic",
  missing_topic: "Missing a topic I needed",
  too_theoretical: "Too theoretical, not practical enough",
  other: "Something else",
};

/** Longest free text a Learner may send with "Something else". */
export const GOAL_CHECK_OTHER_MAX_LENGTH = 500;

/**
 * What the Learner does after a "not met" Goal Check: start a new Course Request built around what was missing, or
 * nothing. Adding Lessons to this Course is out of scope (decision 2026-11-04).
 */
export const GOAL_CHECK_NEXT_STEPS = ["new_course", "nothing"] as const;
export type GoalCheckNextStep = (typeof GOAL_CHECK_NEXT_STEPS)[number];

/** The Learner's account of what was missing. */
export type GoalCheckFeedback = { reasons: GoalCheckMissingReason[]; otherText: string | null };

/**
 * Reads feedback a Learner sent. At least one known reason, no repeats; `other` needs non-empty text of at most
 * {@link GOAL_CHECK_OTHER_MAX_LENGTH} characters, and text without `other` is dropped.
 * @param raw - Request body
 * @returns The feedback, or null when it is not valid
 */
export function parseGoalCheckFeedback(raw: unknown): GoalCheckFeedback | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { reasons?: unknown; otherText?: unknown };
  if (!Array.isArray(row.reasons) || row.reasons.length === 0) return null;
  const known = GOAL_CHECK_MISSING_REASONS as readonly string[];
  if (row.reasons.some((reason) => typeof reason !== "string" || !known.includes(reason))) return null;
  const reasons = row.reasons as GoalCheckMissingReason[];
  if (new Set(reasons).size !== reasons.length) return null;
  if (!reasons.includes("other")) return { reasons, otherText: null };
  const text = typeof row.otherText === "string" ? row.otherText.trim() : "";
  if (!text || text.length > GOAL_CHECK_OTHER_MAX_LENGTH) return null;
  return { reasons, otherText: text };
}

/**
 * Reads a next step a Learner chose.
 * @param raw - Request field
 */
export function parseGoalCheckNextStep(raw: unknown): GoalCheckNextStep | null {
  return (GOAL_CHECK_NEXT_STEPS as readonly unknown[]).includes(raw) ? (raw as GoalCheckNextStep) : null;
}

/**
 * The topic a new Course Request is prefilled with after "not met": the missed objectives, then the Learner's own
 * words when they wrote some. Fed to `/new-course-request?subject=…&topic=…`.
 * @param result - The Goal Check result
 * @param feedback - What the Learner said was missing
 */
export function goalCheckFollowUpTopic(result: GoalCheckResult, feedback: GoalCheckFeedback | null): string {
  const parts = result.missedObjectives.map((missed) => missed.objective);
  if (feedback?.otherText) parts.push(feedback.otherText);
  return parts.join("; ");
}
