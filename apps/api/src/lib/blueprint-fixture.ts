import { isEvidenced } from "@senoy/db/starting-level";
import type { BlueprintBuilder } from "./blueprint.ts";

/**
 * Deterministic builder for browser tests (`DIAGNOSTIC_FIXTURE=1`): no provider calls.
 * One Reading on the most basic capability not evidenced, then a Quiz that assesses it.
 */
export function createFixtureBlueprintBuilder(): BlueprintBuilder {
  return {
    async build({ startingLevel }) {
      const first = [...startingLevel.probedCapabilities].sort((a, b) => a.span - b.span).find((capability) => !isEvidenced(capability));
      const topic = first?.statement ?? "the last steps";
      return {
        blueprint: {
          courseTitle: "Fixture Course",
          modules: [{
            title: "Fixture Module",
            slots: [
              {
                id: "slot1", method: "reading", title: `Reading: ${topic}`, lessonGoal: `Use ${topic} toward your goal.`,
                objectives: [`Explain ${topic}`], topicTags: ["fixture", "reading"], assessesSlotIds: [],
              },
              {
                id: "slot2", method: "quiz", title: `Quiz: ${topic}`, lessonGoal: `Show you can use ${topic}.`,
                objectives: [`Explain ${topic}`], topicTags: ["fixture", "quiz"], assessesSlotIds: ["slot1"],
              },
            ],
          }],
        },
        judge: { pass: true, failedChecks: [], reasons: [] },
      };
    },
  };
}
