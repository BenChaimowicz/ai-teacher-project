import type { FocusQuestion } from "@senoy/db/course-request";
import type { FocusTurn, GoalFocuser } from "./goal-focus.ts";

/** A subject containing this (case-insensitive) is treated as broad by the fixture focuser. */
export const FIXTURE_BROAD_MARKER = "[broad]";

/** The fixture's first focusing question and its options. */
export const FIXTURE_FOCUS_PART_QUESTION = "Which part do you want the course to be about?";
export const FIXTURE_FOCUS_PART_OPTIONS = ["How the parts fit together", "Where our knowledge comes from"];

/** The fixture's second focusing question and its options. */
export const FIXTURE_FOCUS_DEPTH_QUESTION = "How deep should it go?";
export const FIXTURE_FOCUS_DEPTH_OPTIONS = ["A clear overview", "Enough to explain it to someone"];

/** The fixture proposal's single out-of-scope entry. */
export const FIXTURE_FOCUS_OUT_OF_SCOPE = ["Everything else about the subject"];

/**
 * The Learning Goal the fixture proposes after one answered round.
 * @param subject - The Request's subject, marker included or not
 * @param partAnswer - The Learner's answer to the first question
 * @returns e.g. `Explain how the parts fit together in Astronomy`
 */
export function fixtureFocusedGoal(subject: string, partAnswer: string): string {
  return `Explain ${partAnswer.toLowerCase()} in ${subject.replace(/\[broad\]/i, "").trim()}`;
}

/**
 * The fixture's two questions for one round.
 * @param round - 1-based round number, for the ids
 */
function fixtureQuestions(round: number): FocusQuestion[] {
  return [
    { id: `r${round}q1`, question: FIXTURE_FOCUS_PART_QUESTION, options: [...FIXTURE_FOCUS_PART_OPTIONS] },
    { id: `r${round}q2`, question: FIXTURE_FOCUS_DEPTH_QUESTION, options: [...FIXTURE_FOCUS_DEPTH_OPTIONS] },
  ];
}

/**
 * Deterministic focuser for browser tests (`DIAGNOSTIC_FIXTURE=1`): no provider calls. A subject containing "[broad]"
 * is asked one round of two questions, then gets a proposal built from the answers; a "not quite" asks the same two
 * questions again. Every other goal is precise.
 */
export function createFixtureGoalFocuser(): GoalFocuser {
  return {
    async next({ subject, rounds, notQuite }): Promise<FocusTurn> {
      if (!subject.toLowerCase().includes(FIXTURE_BROAD_MARKER)) return { kind: "precise" };
      const last = rounds.at(-1);
      if (notQuite || !last?.answers) return { kind: "ask", questions: fixtureQuestions(rounds.length + 1) };
      const answerTo = (index: number) => last.answers?.find((answer) => answer.questionId === last.questions[index]?.id)?.answer ?? "";
      const part = answerTo(0);
      return {
        kind: "propose",
        proposal: {
          learningGoal: fixtureFocusedGoal(subject, part),
          scope: { inScope: [part, answerTo(1)], outOfScope: [...FIXTURE_FOCUS_OUT_OF_SCOPE] },
        },
      };
    },
  };
}
