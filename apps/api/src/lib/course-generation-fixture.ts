import { createCourseGeneration, type CourseGeneration } from "./course-generation.ts";

/** A passing Judge verdict. */
const PASS = { pass: true, failedChecks: [], reasons: [] };

/** The fixture Reading's one Source. */
const SOURCE_URL = "https://en.wikipedia.org/w/index.php?oldid=1";

/** How many items the fixture Quiz asks. */
export const FIXTURE_QUIZ_ITEMS = 5;

/**
 * Deterministic Course generation for browser tests (`DIAGNOSTIC_FIXTURE=1`): no research or provider calls. The real
 * pipeline runs — checkpoints, whole-Course Code checks, and atomic publish — with fixed research, Generators, and Judge.
 * Each Quiz item's correct option reads "Right answer n"; the others read "Wrong answer n…".
 */
export function createFixtureCourseGeneration(): CourseGeneration {
  return createCourseGeneration({
    research: async () => [],
    readingGenerator: {
      async generate({ slot }) {
        return {
          judge: PASS,
          repairs: 0,
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
        return {
          judge: PASS,
          repairs: 0,
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
