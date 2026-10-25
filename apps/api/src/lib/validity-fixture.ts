import type { ValidityResult } from "@senoy/db/course-request";
import { VALIDITY_POLICY_VERSION, type ValidityGate } from "./validity.ts";

/** The clarification the fixture asks about unicorns, and the answers it offers. */
export const FIXTURE_CLARIFY_QUESTION = "Do you mean unicorns in myths and stories, or caring for a real animal?";
export const FIXTURE_CLARIFY_OPTIONS = ["Unicorns in myths and stories", "Writing my own unicorn stories", "Caring for a real unicorn"];

/**
 * Deterministic gate for browser tests (`DIAGNOSTIC_FIXTURE=1`): no provider calls. A subject naming unicorns is
 * clarified, and confirming the real-animal framing rejects it; a subject containing "[reject]" is rejected; a subject
 * containing "[unavailable]" fails like a provider outage; everything else passes.
 */
export function createFixtureValidityGate(): ValidityGate {
  const base = { policyVersion: VALIDITY_POLICY_VERSION, safeReframe: null, question: null } satisfies Partial<ValidityResult>;
  return {
    async evaluate({ subject, clarification }) {
      if (subject.includes("[unavailable]")) throw new Error("[validity-fixture: evaluate] Fixture provider outage");
      if (subject.includes("[reject]")) {
        return {
          ...base, outcome: "reject", reason: "This request would teach how to commit a serious offense.",
          safeReframe: "Study criminal law, crime prevention, or the consequences of offenses without instructions for committing them.",
        };
      }
      if (/unicorn/i.test(subject)) {
        if (!clarification) {
          return {
            ...base, outcome: "clarify", question: FIXTURE_CLARIFY_QUESTION, answerOptions: FIXTURE_CLARIFY_OPTIONS,
            reason: "The goal needs one clarification to distinguish a learnable framing from an unsupported premise or prohibited outcome.",
          };
        }
        if (/real/i.test(clarification.answer)) {
          return {
            ...base, outcome: "reject",
            reason: "The answer confirms an unsupported real-world factual premise, so this goal cannot be taught as factual knowledge.",
            safeReframe: "Study the premise as mythology, fiction, creative writing, or critical analysis rather than as a real-world fact.",
          };
        }
      }
      return { ...base, outcome: "pass", reason: "The subject and Learning Goal describe a learnable corpus or legitimate capability." };
    },
  };
}
