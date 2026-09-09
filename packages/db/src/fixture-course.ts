import {
  SEEDED_COURSE_ID,
  SEEDED_LEARNER_ID,
  SEEDED_MODULE_ID,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "./seed-ids.ts";

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

/** Seeded reading Lesson envelope. Body is empty. */
export const SEEDED_READING_LESSON = {
  id: SEEDED_READING_LESSON_ID,
  publishedCourseId: SEEDED_COURSE_ID,
  moduleId: SEEDED_MODULE_ID,
  position: 0,
  teachingMethod: "reading",
  title: "How a square knot holds",
  lessonGoal: "Explain why a square knot holds under tension.",
  objectives: [
    "Identify the two overhand knots that make a square knot",
    "Explain how the loops bind under load",
  ],
  topicTags: ["square-knot", "binding-knots"],
  assessedLessonIds: [] as string[],
  lineage: null,
  sources: [] as unknown[],
  citations: [] as unknown[],
  body: null,
};

/** Seeded Quiz envelope. Body is empty. Assesses the reading Lesson. */
export const SEEDED_QUIZ_LESSON = {
  id: SEEDED_QUIZ_LESSON_ID,
  publishedCourseId: SEEDED_COURSE_ID,
  moduleId: SEEDED_MODULE_ID,
  position: 1,
  teachingMethod: "quiz",
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
