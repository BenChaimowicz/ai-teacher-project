import {
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
  SEEDED_LEARNER_ID,
  SEEDED_MODULE_ID,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "./seed-ids.ts";
import type { QuizBody } from "./quiz.ts";
import type { NumberedSource, ReadingBody } from "./reading-lesson.ts";
import { READING_METHOD_ID, QUIZ_METHOD_ID } from "./reading-lesson.ts";

export {
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
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

/** Quiz body for the fixture. Every item is answerable from the reading Lesson alone. */
export const SEEDED_QUIZ_BODY: QuizBody = {
  items: [
    {
      id: "q1",
      prompt: "What is a square knot made of?",
      options: [
        { id: "a", text: "Two overhand knots tied in opposite directions" },
        { id: "b", text: "Two overhand knots tied in the same direction" },
        { id: "c", text: "One overhand knot and one half hitch" },
        { id: "d", text: "A single loop pulled through itself" },
      ],
      correctOptionId: "a",
      explanations: {
        brief: "Two overhand knots in opposite directions: that is the square knot.",
        standard:
          "A square knot is two overhand knots tied in opposite directions. Tying both the same way gives a granny knot instead.",
        detailed:
          "A square knot is two overhand knots tied in opposite directions, so the working ends finish on the same side of the standing parts. Tying both the same way gives a granny knot instead. Try it: tie right-over-left, then left-over-right.",
      },
    },
    {
      id: "q2",
      prompt: "You tie two overhand knots that both turn the same way. What do you get?",
      options: [
        { id: "a", text: "A square knot" },
        { id: "b", text: "A reef knot" },
        { id: "c", text: "A granny knot" },
        { id: "d", text: "A stronger square knot" },
      ],
      correctOptionId: "c",
      explanations: {
        brief: "Same direction twice makes a granny knot.",
        standard:
          "Both overhand knots turning the same way makes a granny knot. A reef knot is just another name for the square knot, which needs opposite directions.",
        detailed:
          "Both overhand knots turning the same way makes a granny knot, a different knot from the one this Lesson teaches. A reef knot is another name for the square knot, which needs the second overhand knot to turn the opposite way. If your knot looks twisted and lopsided, retie the second half the other way.",
      },
    },
    {
      id: "q3",
      prompt: "On a finished square knot, where do the working ends sit?",
      options: [
        { id: "a", text: "On opposite sides of the standing parts" },
        { id: "b", text: "On the same side of the standing parts" },
        { id: "c", text: "Wrapped around the standing parts" },
        { id: "d", text: "Tucked inside the knot" },
      ],
      correctOptionId: "b",
      explanations: {
        brief: "The working ends finish on the same side of the standing parts.",
        standard:
          "In a square knot the working ends finish on the same side of the standing parts. Ends on opposite sides are a sign of a different knot.",
        detailed:
          "In a square knot the working ends finish on the same side of the standing parts. This is a quick visual check: if the ends sit on opposite sides, the two overhand knots probably turned the same way. Look at the ends before you trust the knot.",
      },
    },
    {
      id: "q4",
      prompt: "Why does a square knot hold under tension?",
      options: [
        { id: "a", text: "The rope fibres fuse together under load" },
        { id: "b", text: "The working ends wrap around each other many times" },
        { id: "c", text: "The two loops press against each other, so each turn jams the other" },
        { id: "d", text: "Friction from the standing parts alone holds it" },
      ],
      correctOptionId: "c",
      explanations: {
        brief: "The loops press together and each turn jams the other.",
        standard:
          "Under tension the two loops press against each other. Each turn jams the other, so the knot holds while the load stays on.",
        detailed:
          "Under tension the two loops press against each other. Each turn jams the other, so the knot holds while the load stays on. That is why it suits binding: the load itself keeps it closed. Nothing fuses, and there are only two overhand turns, not many wraps.",
      },
    },
    {
      id: "q5",
      prompt: "Which job is a square knot NOT the right choice for?",
      options: [
        { id: "a", text: "Binding something closed" },
        { id: "b", text: "Joining two ropes when a life depends on the join" },
        { id: "c", text: "Tying off a bundle that stays under light tension" },
        { id: "d", text: "Practising the difference from a granny knot" },
      ],
      correctOptionId: "b",
      explanations: {
        brief: "It is a binding knot, not a life-safety join.",
        standard:
          "The square knot is a binding knot. It is not the knot to join two ropes when a life depends on the join.",
        detailed:
          "The square knot is a binding knot: it holds things closed while a load keeps it tight. It is not the knot to join two ropes when a life depends on the join. Binding a bundle or practising against a granny knot are fine uses.",
      },
    },
  ],
};

/** Seeded Quiz. Assesses the reading Lesson before it. */
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
  body: SEEDED_QUIZ_BODY,
};

/** Numbered Sources for the reading after the Quiz. */
export const SEEDED_FOLLOW_UP_CITATIONS: NumberedSource[] = SEEDED_READING_CITATIONS.slice(0, 1);

/** Reading body for the Lesson after the Quiz. Shows the linear unlock rule on the fixture. */
export const SEEDED_FOLLOW_UP_BODY: ReadingBody = {
  sections: [
    {
      heading: "When the ends are pulled",
      blocks: [
        {
          kind: "prose",
          text: "A square knot can spill. If one working end is pulled hard against its own standing part, the knot can turn into two loose hitches and slide apart.[1]",
        },
        {
          kind: "prose",
          text: "That is fine for a bundle you will untie by hand. It is a problem when anything snags the ends.",
        },
      ],
    },
    {
      heading: "Different ropes",
      blocks: [
        {
          kind: "prose",
          text: "Joining two ropes of different thickness or stiffness with a square knot is a common mistake. The knot cannot grip both evenly, and it can slip under load.[1]",
        },
        {
          kind: "prose",
          text: "Keep the square knot for binding. When you need to join two ropes, choose a knot made for joining.",
        },
      ],
    },
  ],
};

/** Seeded reading Lesson after the Quiz. Linear mode keeps it locked until the Quiz is passed. */
export const SEEDED_FOLLOW_UP_LESSON = {
  id: SEEDED_FOLLOW_UP_LESSON_ID,
  publishedCourseId: SEEDED_COURSE_ID,
  moduleId: SEEDED_MODULE_ID,
  position: 2,
  teachingMethod: READING_METHOD_ID,
  title: "When not to use a square knot",
  lessonGoal: "Recognise the jobs a square knot should not do.",
  objectives: [
    "Explain how a square knot can spill when an end is pulled",
    "Avoid using a square knot to join ropes of different thickness",
  ],
  topicTags: ["square-knot", "binding-knots"],
  assessedLessonIds: [] as string[],
  lineage: null,
  sources: SEEDED_FOLLOW_UP_CITATIONS,
  citations: SEEDED_FOLLOW_UP_CITATIONS,
  body: SEEDED_FOLLOW_UP_BODY,
};

/** Fixture Lessons in Course order. */
export const SEEDED_LESSONS = [SEEDED_READING_LESSON, SEEDED_QUIZ_LESSON, SEEDED_FOLLOW_UP_LESSON];
