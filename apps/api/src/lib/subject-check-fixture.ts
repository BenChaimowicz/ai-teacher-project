import type { SubjectReading } from "@senoy/db/course-request";
import type { SubjectChecker } from "./subject-check.ts";

/** The readings the fixture offers for a subject naming Mercury, most likely first. */
export const FIXTURE_SUBJECT_READINGS: SubjectReading[] = [
  { label: "Mercury (planet)", gloss: "The planet nearest the Sun" },
  { label: "Mercury (element)", gloss: "The liquid metal, Hg" },
  { label: "Freddie Mercury", gloss: "The singer of Queen" },
];

/**
 * Deterministic subject checker for browser tests (`DIAGNOSTIC_FIXTURE=1`): no provider calls. A subject naming
 * Mercury has several readings unless the goal settles it; a subject containing "[subject-unavailable]" fails like a
 * provider outage (and so goes straight on); everything else has one reading.
 */
export function createFixtureSubjectChecker(): SubjectChecker {
  return {
    async check({ subject, learningGoal }) {
      if (subject.includes("[subject-unavailable]")) return { kind: "check_failed", error: "[subject-check-fixture: check] Fixture provider outage" };
      if (/^mercury$/i.test(subject.trim()) && /^mercury$/i.test(learningGoal.trim())) {
        return { kind: "several", readings: FIXTURE_SUBJECT_READINGS.map((reading) => ({ ...reading })) };
      }
      return { kind: "single" };
    },
  };
}
