import assert from "node:assert/strict";
import { test } from "node:test";
import { canExpandGap, expandGap, extremityOf, isEvidenced, scoreDiagnostic, type DiagnosticAnswer } from "./starting-level.ts";

/** Eight Probed capabilities, span 1 (basic) to 8 (near-goal); every key is option 0. */
const capabilities = Array.from({ length: 8 }, (_, index) => ({
  id: `cap${index + 1}`,
  statement: `Capability ${index + 1}`,
  itemId: `item${index + 1}`,
  span: index + 1,
}));
const keys = Object.fromEntries(capabilities.map((capability) => [capability.itemId, 0]));

/** Answers keyed by item: a number is a chosen option, otherwise I don't know. */
function answers(...choices: DiagnosticAnswer[]) {
  return Object.fromEntries(capabilities.map((capability, index) => [capability.itemId, choices[index] ?? "dont_know"]));
}

test("Correct is evidenced; incorrect and I don't know are not, and neither is turned into a score", () => {
  const scored = scoreDiagnostic(capabilities, keys, answers(0, 2, "dont_know", 0, 1, 0, "dont_know", 0));
  assert.deepEqual(scored.probedCapabilities.map((capability) => capability.status), [
    "correct", "incorrect", "dont_know", "correct", "incorrect", "correct", "dont_know", "correct",
  ]);
  assert.equal(scored.extremity, "mixed");
  assert.equal("percentCorrect" in scored, false);
});

test("Extremity: one or fewer evidenced is floor, all but one is ceiling, all I don't know is floor", () => {
  assert.equal(scoreDiagnostic(capabilities, keys, answers()).extremity, "floor");
  assert.equal(scoreDiagnostic(capabilities, keys, answers(0)).extremity, "floor");
  assert.equal(scoreDiagnostic(capabilities, keys, answers(0, 0)).extremity, "mixed");
  assert.equal(scoreDiagnostic(capabilities, keys, answers(0, 0, 0, 0, 0, 0, 1, 0)).extremity, "ceiling");
  assert.equal(scoreDiagnostic(capabilities, keys, answers(0, 0, 0, 0, 0, 0, 0, 0)).extremity, "ceiling");
  assert.equal(scoreDiagnostic(capabilities, keys, answers(0, 0, 0, 0, 0, 1, 1, 0)).extremity, "mixed");
});

test("Too easy moves the most basic evidenced capabilities into the gap and keeps the real answers", () => {
  // Learner missed span 2 but got the rest: 7 of 8, ceiling.
  const scored = scoreDiagnostic(capabilities, keys, answers(0, 1, 0, 0, 0, 0, 0, 0));
  const expanded = expandGap(scored.probedCapabilities);
  assert.deepEqual(expanded.filter((capability) => capability.expandedByLearner).map((capability) => capability.span), [1, 3]);
  assert.deepEqual(expanded.map((capability) => capability.status), scored.probedCapabilities.map((capability) => capability.status));
  assert.equal(extremityOf(expanded), "mixed", "A ceiling Learner who widens the gap sees the ordinary screen.");
});

test("Too easy is repeatable until nothing is evidenced, then it is unavailable", () => {
  let current = scoreDiagnostic(capabilities, keys, answers(0, 0, 0, 1)).probedCapabilities;
  assert.equal(canExpandGap(current), true);
  current = expandGap(current);
  assert.deepEqual(current.filter(isEvidenced).map((capability) => capability.span), [3]);
  assert.equal(extremityOf(current), "floor");
  current = expandGap(current);
  assert.equal(current.filter(isEvidenced).length, 0);
  assert.equal(canExpandGap(current), false);
  assert.throws(() => expandGap(current));
});
