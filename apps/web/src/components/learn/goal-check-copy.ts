import type { GoalCheckOutcome } from "@senoy/db/goal-check";

/** The Goal Check outcome as the Learner reads it: on the result card, the best-score line and Course complete. */
export const GOAL_OUTCOME_LABEL: Record<GoalCheckOutcome, string> = {
  met: "Goal met",
  partly_met: "Partly met",
  not_met: "Not met yet",
};

/** One sentence under the outcome, set against the Learning Goal. */
export const GOAL_OUTCOME_SUB: Record<GoalCheckOutcome, string> = {
  met: "You can do what you set out to do.",
  partly_met: "Most of it is there. A few parts are worth another look.",
  not_met: "This Course didn't get you there yet. That's on the Course, not on you.",
};
