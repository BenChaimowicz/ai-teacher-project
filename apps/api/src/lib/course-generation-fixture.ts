import { setTimeout as sleep } from "node:timers/promises";
import type { SourcePack } from "@senoy/research";
import { createCourseGeneration, type CourseGeneration } from "./course-generation.ts";
import { allSupported } from "./objective-grounding.ts";
import { ReadingFailedError } from "./reading-generation.ts";

/** A passing Judge verdict. */
const PASS = { pass: true, failedChecks: [], reasons: [] };

/** The fixture Reading's one Source. */
const SOURCE_URL = "https://en.wikipedia.org/w/index.php?oldid=1";

/** How many items the fixture Quiz asks. */
export const FIXTURE_QUIZ_ITEMS = 5;

/** A Learning Goal containing this fails each Reading's first attempt, so browser tests can see a failure and Retry. */
export const FAIL_ONCE_MARKER = "[fail-once]";

/** The fixture research: one Source with one excerpt, enough to ground every Reading. */
function fixturePacks(topic: string): SourcePack[] {
  const source = {
    sourceId: "src_fixture000", url: SOURCE_URL, title: "Fixture Source", host: "en.wikipedia.org", preferred: true,
    retrievedAt: "2026-10-18T00:00:00.000Z", excerptOrigin: "vendor" as const, excerpts: [{ id: "e1", text: "Fixture excerpt." }],
  };
  const pack = { topic, error: null, startedAt: "2026-10-18T00:00:00.000Z", latencyMs: 0, estimatedCostUsd: 0, vendorRequestId: null, vendorSummary: null, filteredOut: [], warnings: [] };
  return [
    { ...pack, slot: "primary", adapter: "parallel-pro", status: "ok", sources: [source] },
    { ...pack, slot: "secondary", adapter: "you-research", status: "empty_vendor", sources: [] },
  ];
}

/**
 * Deterministic Course generation for browser tests (`DIAGNOSTIC_FIXTURE=1`): no research or provider calls. The real
 * pipeline runs — checkpoints, whole-Course Code checks, and atomic publish — with fixed research, Generators, and Judge.
 * Each Quiz item's correct option reads "Right answer n"; the others read "Wrong answer n…".
 * @param lessonDelayMs - How long each Lesson takes, so browser tests can see a job mid-run
 */
export function createFixtureCourseGeneration(lessonDelayMs = 0): CourseGeneration {
  /** Readings that already failed once, by Learning Goal and slot. */
  const failedOnce = new Set<string>();
  return createCourseGeneration({
    research: async (topic) => fixturePacks(topic),
    readingGenerator: {
      async generate({ slot, learningGoal }) {
        await sleep(lessonDelayMs);
        const attempt = `${learningGoal}|${slot.id}`;
        if (learningGoal.includes(FAIL_ONCE_MARKER) && !failedOnce.has(attempt)) {
          failedOnce.add(attempt);
          throw new ReadingFailedError([], { pass: false, failedChecks: ["claim_support"], reasons: ["Fixture failure."] });
        }
        return {
          judge: PASS,
          repairs: 0,
          grounding: allSupported(slot.objectives),
          authorModelIds: ["fixture/author"],
          judgeModelId: "fixture/judge",
          rounds: [],
          rejectedSources: [],
          lesson: {
            slotId: slot.id, teachingMethod: "reading", title: slot.title, lessonGoal: slot.lessonGoal,
            objectives: slot.objectives, topicTags: slot.topicTags, lineage: null,
            body: { sections: [{ heading: "Fixture section", blocks: [{ kind: "prose", text: `Fixture prose for ${slot.title}.[1]` }] }] },
            citations: [{ n: 1, title: "Fixture Source", url: SOURCE_URL }],
            sources: [{
              n: 1, sourceId: "src_fixture000", title: "Fixture Source", url: SOURCE_URL, publisher: "en.wikipedia.org",
              retrievedAt: "2026-10-18T00:00:00.000Z", usedAs: "paraphrase",
            }],
          },
        };
      },
    },
    quizGenerator: {
      async generate({ slot }) {
        await sleep(lessonDelayMs);
        return {
          judge: PASS,
          repairs: 0,
          grounding: allSupported(slot.objectives),
          authorModelIds: ["fixture/author"],
          judgeModelId: "fixture/judge",
          lesson: {
            slotId: slot.id, teachingMethod: "quiz", title: slot.title, lessonGoal: slot.lessonGoal,
            objectives: slot.objectives, topicTags: slot.topicTags, lineage: null, sources: [], citations: [],
            body: {
              items: Array.from({ length: FIXTURE_QUIZ_ITEMS }, (_, index) => {
                const n = index + 1;
                return {
                  id: `item${n}`,
                  prompt: `Fixture question ${n}?`,
                  options: [
                    { id: "opt1", text: `Wrong answer ${n}a` },
                    { id: "opt2", text: `Right answer ${n}` },
                    { id: "opt3", text: `Wrong answer ${n}b` },
                    { id: "opt4", text: `Wrong answer ${n}c` },
                  ],
                  correctOptionId: "opt2",
                  explanations: { brief: `Brief ${n}.`, standard: `Standard ${n}.`, detailed: `Detailed ${n}.` },
                };
              }),
            },
          },
        };
      },
    },
    courseJudge: { async judge() { return PASS; } },
  });
}
