import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bestGoalCheckAttempt,
  goalCheckFollowUpTopic,
  goalCheckOutcome,
  goalCheckResult,
  parseGoalCheckBody,
  parseGoalCheckFeedback,
  parseGoalCheckNextStep,
  type GoalCheckBody,
} from "./goal-check.ts";
import { parseQuizBody, publicQuizBody, type QuizAnswers } from "./quiz.ts";

/**
 * A Goal Check body of `n` items, cycling through the given objectives.
 * @param n - Item count
 * @param objectives - Objectives the items name, in turn
 */
function goalBody(n: number, objectives = ["read a chord chart", "keep time"]): GoalCheckBody {
  return {
    items: Array.from({ length: n }, (_, index) => ({
      id: `g${index + 1}`,
      prompt: `Question ${index + 1}?`,
      options: ["a", "b", "c", "d"].map((letter) => ({ id: `${letter}${index}`, text: `Answer ${letter}`, why: "Because." })),
      correctOptionId: `a${index}`,
      explanations: { brief: "b", standard: "s", detailed: "d" },
      objective: objectives[index % objectives.length]!,
    })),
  };
}

/**
 * Answers the first `correct` items right and the rest wrong.
 * @param body - Goal Check body
 * @param correct - How many to get right
 */
function answers(body: GoalCheckBody, correct: number): QuizAnswers {
  return Object.fromEntries(body.items.map((item, index) => [item.id, { optionId: index < correct ? item.correctOptionId : `b${index}`, checked: true }]));
}

test("A Goal Check body holds 6–12 items, each naming its objective", () => {
  assert.ok(parseGoalCheckBody(goalBody(6)));
  assert.ok(parseGoalCheckBody(goalBody(12)));
  assert.equal(parseGoalCheckBody(goalBody(5)), null);
  assert.equal(parseGoalCheckBody(goalBody(13)), null);
  const unnamed = goalBody(6);
  delete (unnamed.items[2] as { objective?: string }).objective;
  assert.equal(parseGoalCheckBody(unnamed), null);
});

test("The objective survives parsing but never reaches the browser", () => {
  const parsed = parseGoalCheckBody(goalBody(6))!;
  assert.equal(parsed.items[0]!.objective, "read a chord chart");
  assert.equal("objective" in publicQuizBody(parsed).items[0]!, false);
});

test("A Quiz body still parses at 5–10 items", () => {
  assert.ok(parseQuizBody(goalBody(10)));
  assert.equal(parseQuizBody(goalBody(11)), null);
});

test("Met at 70% or more, partly met from 50%, not met below (decision 2026-11-04)", () => {
  assert.equal(goalCheckOutcome({ correct: 7, total: 10 }), "met");
  assert.equal(goalCheckOutcome({ correct: 10, total: 10 }), "met");
  assert.equal(goalCheckOutcome({ correct: 69, total: 100 }), "partly_met");
  assert.equal(goalCheckOutcome({ correct: 5, total: 10 }), "partly_met");
  assert.equal(goalCheckOutcome({ correct: 49, total: 100 }), "not_met");
  assert.equal(goalCheckOutcome({ correct: 0, total: 0 }), "not_met");
});

test("The best attempt is the highest score, the earliest on a tie", () => {
  const first = { id: "1", score: { correct: 3, total: 6 } };
  const second = { id: "2", score: { correct: 5, total: 6 } };
  const third = { id: "3", score: { correct: 5, total: 6 } };
  assert.equal(bestGoalCheckAttempt([first, second, third]), second);
  assert.equal(bestGoalCheckAttempt([]), null);
});

test("The result names each missed objective once, in slot order, with its Lessons", () => {
  const body = goalBody(6, ["keep time", "read a chord chart", "change chords"]);
  const objectives = ["read a chord chart", "keep time", "change chords"];
  const lessons = { "change chords": ["L3", "L4"], "keep time": ["L1"], "read a chord chart": ["L2"] };
  // Items 1–2 right ("keep time", "read a chord chart"); 3–6 wrong: "change chords", "keep time", "read…", "change…".
  const result = goalCheckResult(body, answers(body, 2), objectives, lessons);
  assert.equal(result.outcome, "not_met");
  assert.deepEqual(result.best, { correct: 2, total: 6 });
  assert.deepEqual(result.missedObjectives, [
    { objective: "read a chord chart", lessonIds: ["L2"] },
    { objective: "keep time", lessonIds: ["L1"] },
    { objective: "change chords", lessonIds: ["L3", "L4"] },
  ]);
  const perfect = goalCheckResult(body, answers(body, 6), objectives, lessons);
  assert.equal(perfect.outcome, "met");
  assert.deepEqual(perfect.missedObjectives, []);
});

test("Feedback needs a known reason, and free text only with Something else", () => {
  assert.deepEqual(parseGoalCheckFeedback({ reasons: ["too_basic"] }), { reasons: ["too_basic"], otherText: null });
  assert.deepEqual(parseGoalCheckFeedback({ reasons: ["too_basic"], otherText: "ignored" }), { reasons: ["too_basic"], otherText: null });
  assert.deepEqual(parseGoalCheckFeedback({ reasons: ["missing_topic", "other"], otherText: "  fills  " }), {
    reasons: ["missing_topic", "other"],
    otherText: "fills",
  });
  assert.equal(parseGoalCheckFeedback({ reasons: [] }), null);
  assert.equal(parseGoalCheckFeedback({ reasons: ["bored"] }), null);
  assert.equal(parseGoalCheckFeedback({ reasons: ["too_basic", "too_basic"] }), null);
  assert.equal(parseGoalCheckFeedback({ reasons: ["other"], otherText: " " }), null);
  assert.equal(parseGoalCheckFeedback({ reasons: ["other"], otherText: "x".repeat(501) }), null);
  assert.equal(parseGoalCheckFeedback(null), null);
});

test("The next step is a new Course or nothing; adding Lessons is not offered", () => {
  assert.equal(parseGoalCheckNextStep("new_course"), "new_course");
  assert.equal(parseGoalCheckNextStep("nothing"), "nothing");
  assert.equal(parseGoalCheckNextStep("add_lessons"), null);
});

test("A follow-up Course topic is the missed objectives, then the Learner's words", () => {
  const result = { outcome: "not_met" as const, best: { correct: 1, total: 6 }, missedObjectives: [{ objective: "keep time", lessonIds: [] }] };
  assert.equal(goalCheckFollowUpTopic(result, { reasons: ["other"], otherText: "more songs" }), "keep time; more songs");
  assert.equal(goalCheckFollowUpTopic(result, null), "keep time");
});
