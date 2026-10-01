import {
  SEEDED_COURSE_ID,
  SEEDED_LEARNER_ID,
  SEEDED_MODULE_ID,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "./seed-ids.ts";
import type { NumberedSource, ReadingBody } from "./reading-lesson.ts";
import { READING_METHOD_ID, QUIZ_METHOD_ID } from "./reading-lesson.ts";

export {
  SEEDED_COURSE_ID,
  SEEDED_LEARNER_ID,
  SEEDED_MODULE_ID,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "./seed-ids.ts";

/** Seeded published Course snapshot (no Course Request). */
export const SEEDED_COURSE = {
  id: SEEDED_COURSE_ID,
  learnerId: SEEDED_LEARNER_ID,
  courseRequestId: null,
  title: "The square knot",
  subject: "Practical knots",
  learningGoal: "Tie a square knot that holds under tension",
  sequenceMode: "linear",
} as const;

/** Seeded Module. */
export const SEEDED_MODULE = {
  id: SEEDED_MODULE_ID,
  publishedCourseId: SEEDED_COURSE_ID,
  title: "The square knot",
  position: 0,
} as const;

/** Numbered Sources shown at the end of the fixture reading. */
export const SEEDED_READING_CITATIONS: NumberedSource[] = [
  {
    n: 1,
    title: "Reef knot (square knot) — Wikipedia",
    url: "https://en.wikipedia.org/wiki/Reef_knot",
  },
  {
    n: 2,
    title: "Square knot — Animated Knots",
    url: "https://www.animatedknots.com/square-knot",
  },
];

/** Reading body for the fixture Lesson. No Demonstrative media. */
export const SEEDED_READING_BODY: ReadingBody = {
  sections: [
    {
      heading: "Two overhand knots",
      blocks: [
        {
          kind: "prose",
          text: "A square knot — also called a reef knot — is two overhand knots tied in opposite directions. The working ends finish on the same side of the standing parts.[1]",
        },
        {
          kind: "prose",
          text: "If both overhand knots turn the same way, you get a granny knot. That is a different knot, and it is not what this Lesson is for.",
        },
      ],
    },
    {
      heading: "How the loops bind",
      blocks: [
        {
          kind: "prose",
          text: "Under tension the two loops press against each other. Each turn jams the other, so the knot holds while the load stays on.[2]",
        },
        {
          kind: "prose",
          text: "The square knot is a binding knot. It is not the knot you would choose to join two ropes when a life depends on the join.",
        },
      ],
    },
    {
      heading: "What this Lesson is not",
      blocks: [
        {
          kind: "prose",
          text: "This Lesson does not include a picture of the knot. Opening it was not completion. When you have read to the end, mark it complete.",
        },
      ],
    },
  ],
};

/** Seeded reading Lesson envelope with a playable body. */
export const SEEDED_READING_LESSON = {
  id: SEEDED_READING_LESSON_ID,
  publishedCourseId: SEEDED_COURSE_ID,
  moduleId: SEEDED_MODULE_ID,
  position: 0,
  teachingMethod: READING_METHOD_ID,
  title: "How a square knot holds",
  lessonGoal: "Explain why a square knot holds under tension.",
  objectives: [
    "Identify the two overhand knots that make a square knot",
    "Explain how the loops bind under load",
  ],
  topicTags: ["square-knot", "binding-knots"],
  assessedLessonIds: [] as string[],
  lineage: null,
  sources: SEEDED_READING_CITATIONS,
  citations: SEEDED_READING_CITATIONS,
  body: SEEDED_READING_BODY,
};

/** Seeded Quiz envelope. Body is empty. Assesses the reading Lesson. */
export const SEEDED_QUIZ_LESSON = {
  id: SEEDED_QUIZ_LESSON_ID,
  publishedCourseId: SEEDED_COURSE_ID,
  moduleId: SEEDED_MODULE_ID,
  position: 1,
  teachingMethod: QUIZ_METHOD_ID,
  title: "Square knot check",
  lessonGoal: "Check that you can tell a square knot from a granny knot.",
  objectives: ["Distinguish a square knot from a granny knot"],
  topicTags: ["square-knot", "binding-knots"],
  assessedLessonIds: [SEEDED_READING_LESSON_ID],
  lineage: null,
  sources: [] as unknown[],
  citations: [] as unknown[],
  body: null,
};
