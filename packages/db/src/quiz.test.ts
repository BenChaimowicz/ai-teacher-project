import assert from "node:assert/strict";
import { test } from "node:test";
import { SEEDED_QUIZ_BODY } from "./fixture-course.ts";
import {
  bestQuizScore,
  canSubmitQuiz,
  isPassingScore,
  isPerfectScore,
  parseQuizAnswers,
  parseQuizBody,
  publicQuizBody,
  scoreQuiz,
  type QuizAnswers,
} from "./quiz.ts";

/** Answers every fixture item, getting the first `correct` items right. */
function answersWithCorrect(correct: number, checked = true): QuizAnswers {
  const answers: QuizAnswers = {};
  SEEDED_QUIZ_BODY.items.forEach((item, index) => {
    const wrong = item.options.find((option) => option.id !== item.correctOptionId)!;
    answers[item.id] = { optionId: index < correct ? item.correctOptionId : wrong.id, checked };
  });
  return answers;
}

test("Fixture Quiz body is a valid 5–10 item, four-option, single-key body", () => {
  const body = parseQuizBody(SEEDED_QUIZ_BODY);
  assert.ok(body);
  assert.equal(body.items.length, 5);
});

test("Quiz body is rejected outside 5–10 items, without four options, a valid key, or every explanation depth", () => {
  const [first] = SEEDED_QUIZ_BODY.items;
  assert.ok(first);
  assert.equal(parseQuizBody({ items: SEEDED_QUIZ_BODY.items.slice(0, 4) }), null);
  assert.equal(parseQuizBody({ items: Array.from({ length: 11 }, (_, i) => ({ ...first, id: `q${i}` })) }), null);
  const withItem = (item: unknown) => ({ items: [item, ...SEEDED_QUIZ_BODY.items.slice(1)] });
  assert.equal(parseQuizBody(withItem({ ...first, options: first.options.slice(0, 3) })), null);
  assert.equal(parseQuizBody(withItem({ ...first, correctOptionId: "z" })), null);
  assert.equal(parseQuizBody(withItem({ ...first, explanations: { brief: "x", standard: "y" } })), null);
  assert.equal(parseQuizBody(null), null);
});

test("Public Quiz body carries no answer key and no explanation", () => {
  const json = JSON.stringify(publicQuizBody(SEEDED_QUIZ_BODY));
  assert.ok(!json.includes("correctOptionId"));
  assert.ok(!json.includes("explanations"));
  assert.ok(!json.includes(SEEDED_QUIZ_BODY.items[0]!.explanations.standard));
});

test("Score is the raw count of correct items; pass is correct / n ≥ 0.70", () => {
  assert.deepEqual(scoreQuiz(SEEDED_QUIZ_BODY, answersWithCorrect(3)), { correct: 3, total: 5 });
  assert.equal(isPassingScore({ correct: 3, total: 5 }), false);
  assert.equal(isPassingScore({ correct: 4, total: 5 }), true);
  assert.equal(isPassingScore({ correct: 7, total: 10 }), true);
  assert.equal(isPassingScore({ correct: 6, total: 10 }), false);
  assert.equal(isPerfectScore({ correct: 5, total: 5 }), true);
  assert.equal(isPerfectScore({ correct: 4, total: 5 }), false);
});

test("Best score is the highest submitted score; a worse retake never lowers it", () => {
  assert.equal(bestQuizScore([]), null);
  assert.deepEqual(
    bestQuizScore([
      { correct: 2, total: 5 },
      { correct: 4, total: 5 },
      { correct: 1, total: 5 },
    ]),
    { correct: 4, total: 5 },
  );
});

test("Submit needs every item answered, and with per-item timing every item checked", () => {
  assert.equal(canSubmitQuiz(SEEDED_QUIZ_BODY, {}, "end_of_quiz"), false);
  assert.equal(canSubmitQuiz(SEEDED_QUIZ_BODY, answersWithCorrect(5, false), "end_of_quiz"), true);
  assert.equal(canSubmitQuiz(SEEDED_QUIZ_BODY, answersWithCorrect(5, false), "per_item"), false);
  assert.equal(canSubmitQuiz(SEEDED_QUIZ_BODY, answersWithCorrect(5, true), "per_item"), true);
  const partial = answersWithCorrect(5);
  delete partial.q5;
  assert.equal(canSubmitQuiz(SEEDED_QUIZ_BODY, partial, "end_of_quiz"), false);
});

test("Stored answers for unknown items or options are dropped", () => {
  const answers = parseQuizAnswers(
    { q1: { optionId: "a", checked: true }, q2: { optionId: "zz" }, nope: { optionId: "a" } },
    SEEDED_QUIZ_BODY,
  );
  assert.deepEqual(answers, { q1: { optionId: "a", checked: true } });
});
