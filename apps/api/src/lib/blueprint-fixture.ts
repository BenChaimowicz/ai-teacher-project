import { isEvidenced } from "@senoy/db/starting-level";
import type { BlueprintBuilder } from "./blueprint.ts";

/**
 * Deterministic builder for browser tests (`DIAGNOSTIC_FIXTURE=1`): no provider calls.
 * Two Readings on the two most basic capabilities not evidenced, then a Quiz that assesses both, as the default Quiz
 * cadence places them. A revision from Learner review skips the capabilities of the Lessons the Learner marked.
 */
export function createFixtureBlueprintBuilder(): BlueprintBuilder {
  return {
    async build({ startingLevel, revision }) {
      const marked = revision
        ? revision.previousBlueprint.modules.flatMap((module) => module.slots).filter((slot) => revision.feedback.irrelevantSlotIds.includes(slot.id))
        : [];
      const gap = [...startingLevel.probedCapabilities].sort((a, b) => a.span - b.span)
        .filter((capability) => !isEvidenced(capability) && !marked.some((slot) => slot.title === `Reading: ${capability.statement}`));
      const [first, second] = [gap[0]?.statement ?? "the last steps", gap[1]?.statement ?? "the final step"];
      return {
        blueprint: {
          courseTitle: "Fixture Course",
          modules: [{
            title: "Fixture Module",
            slots: [
              {
                id: "slot1", method: "reading", title: `Reading: ${first}`, lessonGoal: `Use ${first} toward your goal.`,
                objectives: [`Explain ${first}`], topicTags: ["fixture", "reading"], assessesSlotIds: [],
              },
              {
                id: "slot2", method: "reading", title: `Reading: ${second}`, lessonGoal: `Use ${second} toward your goal.`,
                objectives: [`Explain ${second}`], topicTags: ["fixture", "reading"], assessesSlotIds: [],
              },
              {
                id: "slot3", method: "quiz", title: `Quiz: ${first} and ${second}`, lessonGoal: `Show you can use ${first} and ${second}.`,
                objectives: [`Explain ${first}`, `Explain ${second}`], topicTags: ["fixture", "quiz"], assessesSlotIds: ["slot1", "slot2"],
              },
            ],
          }],
        },
        judge: { pass: true, failedChecks: [], reasons: [] },
      };
    },
  };
}
