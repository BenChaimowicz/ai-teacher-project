import type { FocusProposal, FocusQuestion, FocusRound } from "@senoy/db/course-request";

/** What one focusing turn is decided from (SEN-90). Learner content is serialized only into the user message. */
export type FocusTurnInput = {
  subject: string;
  /** The Learning Goal as the Learner typed it (`GoalFocus.originalGoal`). */
  learningGoal: string;
  /** Every round so far, each with its answers. Empty on the first turn. */
  rounds: FocusRound[];
  /** Set when the Learner said this proposal was "not quite" right: ask what would fix it. */
  notQuite?: FocusProposal;
};

/**
 * The Course Guide's next move. `precise`: the goal already names a facet, a depth or purpose, and a finish line, so
 * nothing is asked (only on the first turn). `ask`: 1-`MAX_FOCUS_QUESTIONS` questions, each with
 * `MIN_FOCUS_OPTIONS`-`MAX_FOCUS_OPTIONS` options (only while fewer than `MAX_FOCUS_ROUNDS` rounds exist). `propose`: a
 * rewritten Learning Goal with its in-scope and out-of-scope lists (always, once `MAX_FOCUS_ROUNDS` rounds are answered).
 */
export type FocusTurn =
  | { kind: "precise" }
  | { kind: "ask"; questions: FocusQuestion[] }
  | { kind: "propose"; proposal: FocusProposal };

/** Decides whether a Learning Goal is specific enough to design one Course for, and questions the Learner until it is. */
export interface GoalFocuser {
  /** Returns the next move, or throws a safe provider/validation error; never a fallback `precise`. */
  next(input: FocusTurnInput): Promise<FocusTurn>;
}
