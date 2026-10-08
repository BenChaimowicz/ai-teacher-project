import type { FeedbackDepth, FeedbackTiming } from "./teaching-profile.ts";

/** Fewest and most items a Quiz body may hold (spec §5.5). */
export const QUIZ_MIN_ITEMS = 5;
export const QUIZ_MAX_ITEMS = 10;

/** Options per Quiz item. */
export const QUIZ_OPTION_COUNT = 4;

/** A Quiz completes when best `correct / n` reaches this ratio. */
export const QUIZ_PASS_RATIO = 0.7;

/** One answer choice on a Quiz item. */
export type QuizOption = {
  id: string;
  text: string;
};

/**
 * The reason behind the correct answer, written at every Feedback detail level.
 * Feedback detail is a show-time field, so Study picks one when it presents the item.
 */
export type QuizExplanations = Record<FeedbackDepth, string>;

/** One single-correct, four-option Quiz item. */
export type QuizItem = {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanations: QuizExplanations;
};

/** Method-private body of a Quiz Lesson. */
export type QuizBody = {
  items: QuizItem[];
};

/** A Quiz item as the browser sees it: no correct option, no explanation. */
export type PublicQuizItem = {
  id: string;
  prompt: string;
  options: QuizOption[];
};

/** Quiz body as the browser sees it. */
export type PublicQuizBody = {
  items: PublicQuizItem[];
};

/** The Learner's answer to one item inside an attempt. `checked` locks it and shows right/wrong. */
export type QuizItemAnswer = {
  optionId: string;
  checked: boolean;
};

/** Answers in one attempt, keyed by item id. */
export type QuizAnswers = Record<string, QuizItemAnswer>;

/** Draft until Submit; scored after. */
export type QuizAttemptStatus = "draft" | "submitted";

/** A scored result. */
export type QuizScore = {
  correct: number;
  total: number;
};

const FEEDBACK_DEPTHS: FeedbackDepth[] = ["brief", "standard", "detailed"];

/**
 * True when `value` is a non-empty string.
 * @param value - Unknown JSON field
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Reads one option. Invalid rows are null.
 * @param raw - One JSON row
 */
function parseOption(raw: unknown): QuizOption | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { id?: unknown; text?: unknown };
  if (!isNonEmptyString(row.id) || !isNonEmptyString(row.text)) return null;
  return { id: row.id, text: row.text.trim() };
}

/**
 * Reads one item. Anything short of four distinct options, one valid key, and all three explanations is null.
 * @param raw - One JSON row
 */
function parseItem(raw: unknown): QuizItem | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as {
    id?: unknown;
    prompt?: unknown;
    options?: unknown;
    correctOptionId?: unknown;
    explanations?: unknown;
  };
  if (!isNonEmptyString(row.id) || !isNonEmptyString(row.prompt)) return null;
  if (!Array.isArray(row.options) || row.options.length !== QUIZ_OPTION_COUNT) return null;
  const options = row.options.map((option) => parseOption(option));
  if (options.some((option) => option == null)) return null;
  const valid = options as QuizOption[];
  if (new Set(valid.map((option) => option.id)).size !== valid.length) return null;
  if (!isNonEmptyString(row.correctOptionId)) return null;
  if (!valid.some((option) => option.id === row.correctOptionId)) return null;
  if (!row.explanations || typeof row.explanations !== "object") return null;
  const rawExplanations = row.explanations as Record<string, unknown>;
  const explanations = {} as QuizExplanations;
  for (const depth of FEEDBACK_DEPTHS) {
    const text = rawExplanations[depth];
    if (!isNonEmptyString(text)) return null;
    explanations[depth] = text.trim();
  }
  return {
    id: row.id,
    prompt: row.prompt.trim(),
    options: valid,
    correctOptionId: row.correctOptionId,
    explanations,
  };
}

/**
 * Reads a Quiz body. Any invalid item, or an item count outside 5–10, makes the whole body null.
 * @param raw - `published_lessons.body`
 */
export function parseQuizBody(raw: unknown): QuizBody | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as { items?: unknown };
    if (!Array.isArray(row.items)) return null;
    if (row.items.length < QUIZ_MIN_ITEMS || row.items.length > QUIZ_MAX_ITEMS) return null;
    const items = row.items.map((item) => parseItem(item));
    if (items.some((item) => item == null)) return null;
    const valid = items as QuizItem[];
    if (new Set(valid.map((item) => item.id)).size !== valid.length) return null;
    return { items: valid };
  } catch {
    return null;
  }
}

/**
 * Strips the answer key and explanations so the body is safe to send to the browser.
 * @param body - Parsed Quiz body
 */
export function publicQuizBody(body: QuizBody): PublicQuizBody {
  return {
    items: body.items.map((item) => ({
      id: item.id,
      prompt: item.prompt,
      options: item.options.map((option) => ({ ...option })),
    })),
  };
}

/**
 * Reads stored attempt answers. Rows for unknown items or options are dropped.
 * @param raw - `quiz_attempts.answers`
 * @param body - The Quiz the attempt belongs to
 */
export function parseQuizAnswers(raw: unknown, body: QuizBody): QuizAnswers {
  const answers: QuizAnswers = {};
  if (!raw || typeof raw !== "object") return answers;
  const rows = raw as Record<string, unknown>;
  for (const item of body.items) {
    const row = rows[item.id];
    if (!row || typeof row !== "object") continue;
    const { optionId, checked } = row as { optionId?: unknown; checked?: unknown };
    if (typeof optionId !== "string") continue;
    if (!item.options.some((option) => option.id === optionId)) continue;
    answers[item.id] = { optionId, checked: checked === true };
  }
  return answers;
}

/**
 * Right/wrong for one answered item.
 * @param item - Quiz item with its key
 * @param answer - The Learner's answer
 */
export function isAnswerCorrect(item: QuizItem, answer: QuizItemAnswer | undefined): boolean {
  return answer != null && answer.optionId === item.correctOptionId;
}

/**
 * Raw count of correct items. Every item weighs the same.
 * @param body - Quiz body
 * @param answers - Attempt answers
 */
export function scoreQuiz(body: QuizBody, answers: QuizAnswers): QuizScore {
  const correct = body.items.filter((item) => isAnswerCorrect(item, answers[item.id])).length;
  return { correct, total: body.items.length };
}

/**
 * True when a score passes the Quiz (`correct / total ≥ 0.70`).
 * @param score - Scored result
 */
export function isPassingScore(score: QuizScore): boolean {
  if (score.total === 0) return false;
  return score.correct / score.total >= QUIZ_PASS_RATIO;
}

/**
 * True when a score is 100%. The correct answers stay closed once the best score gets here.
 * @param score - Scored result
 */
export function isPerfectScore(score: QuizScore): boolean {
  return score.total > 0 && score.correct === score.total;
}

/**
 * Highest score across submitted attempts. A worse retake never lowers it.
 * @param scores - Scores of submitted attempts
 * @returns Best score, or null before the first Submit
 */
export function bestQuizScore(scores: QuizScore[]): QuizScore | null {
  let best: QuizScore | null = null;
  for (const score of scores) {
    if (!best || score.correct / score.total > best.correct / best.total) best = score;
  }
  return best;
}

/**
 * True when Submit is allowed: every item answered, and with per-item timing every item checked.
 * @param body - Quiz body
 * @param answers - Draft answers
 * @param timing - Feedback timing this attempt started with
 */
export function canSubmitQuiz(body: QuizBody, answers: QuizAnswers, timing: FeedbackTiming): boolean {
  return body.items.every((item) => {
    const answer = answers[item.id];
    if (!answer) return false;
    return timing === "per_item" ? answer.checked : true;
  });
}
