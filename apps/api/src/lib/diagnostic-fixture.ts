import { isEvidenced } from "@senoy/db/starting-level";
import type { DiagnosticBuilder } from "./diagnostic.ts";

/**
 * Deterministic builder for browser tests (`DIAGNOSTIC_FIXTURE=1`): no provider calls.
 * Every key is the first option; the gap statement names the most basic capability not evidenced.
 */
export function createFixtureDiagnosticBuilder(): DiagnosticBuilder {
  return {
    async build() {
      const spans = Array.from({ length: 8 }, (_, index) => index + 1);
      return {
        capabilities: spans.map((span) => ({ id: `cap${span}`, statement: `Fixture capability ${span}`, itemId: `item${span}`, span })),
        items: spans.map((span) => ({
          id: `item${span}`, capabilityId: `cap${span}`, kind: span <= 2 ? "application" as const : "knowledge" as const,
          stem: `Fixture question ${span}?`, options: [`Right ${span}`, `Wrong ${span}a`, `Wrong ${span}b`], keyIndex: 0, warrant: "Fixture.",
        })),
        reviews: [],
        coverageNote: "Fixture coverage note.",
        authorModelId: "fixture/author",
        judgeModelId: "fixture/judge",
        factCheckVendor: null,
      };
    },
    async writeGapStatement({ capabilities }) {
      const first = [...capabilities].sort((a, b) => a.span - b.span).find((capability) => !isEvidenced(capability));
      return first ? `Your Course would start at Fixture capability ${first.span}.` : "Your Course would cover the last steps toward your goal.";
    },
  };
}
