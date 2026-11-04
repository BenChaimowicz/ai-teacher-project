import {
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
  SEEDED_GOAL_CHECK_LESSON_ID,
  SEEDED_LEARNER_ID,
  SEEDED_MODULE_ID,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "./seed-ids.ts";
import { GOAL_CHECK_METHOD_ID, type GoalCheckBody } from "./goal-check.ts";
import type { QuizBody } from "./quiz.ts";
import type { NumberedSource, ReadingBody } from "./reading-lesson.ts";
import { READING_METHOD_ID, QUIZ_METHOD_ID } from "./reading-lesson.ts";

export {
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
  SEEDED_GOAL_CHECK_LESSON_ID,
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

/** The fixture Goal Check's goal objectives: the parts of the Learning Goal, in the order the result lists them. */
export const SEEDED_GOAL_OBJECTIVES = [
  "Tell a square knot from a granny knot",
  "Explain why a square knot holds under load",
  "Know when not to use a square knot",
] as const;

/**
 * Goal Check body for the fixture (SEN-81): six items across the whole Course, each naming the goal objective it
 * checks, two per objective in objective order.
 */
export const SEEDED_GOAL_CHECK_BODY: GoalCheckBody = {
  items: [
    {
      id: "g1",
      objective: SEEDED_GOAL_OBJECTIVES[0],
      prompt: "You tie right-over-left, then right-over-left again. What have you tied?",
      options: [
        { id: "a", text: "A square knot" },
        { id: "b", text: "A granny knot" },
        { id: "c", text: "A reef knot" },
        { id: "d", text: "A half hitch" },
      ],
      correctOptionId: "b",
      explanations: {
        brief: "The same direction twice makes a granny knot.",
        standard: "Two overhand knots turning the same way make a granny knot. A square knot needs the second one to turn the other way.",
        detailed:
          "Two overhand knots turning the same way make a granny knot. A square (reef) knot needs right-over-left, then left-over-right. A half hitch is a single turn around something else.",
      },
    },
    {
      id: "g2",
      objective: SEEDED_GOAL_OBJECTIVES[0],
      prompt: "You look at a finished knot to check it is a square knot. What do you look for?",
      options: [
        { id: "a", text: "The working ends sit on opposite sides of the standing parts" },
        { id: "b", text: "The knot looks twisted and lopsided" },
        { id: "c", text: "The working ends sit on the same side of the standing parts" },
        { id: "d", text: "There are three overhand turns" },
      ],
      correctOptionId: "c",
      explanations: {
        brief: "On a square knot both working ends finish on the same side.",
        standard:
          "A square knot's working ends finish on the same side of the standing parts. Ends on opposite sides, or a twisted look, point to a granny knot.",
        detailed:
          "A square knot's working ends finish on the same side of the standing parts, and the knot lies flat. Ends on opposite sides, or a twisted, lopsided knot, point to a granny knot. It is only ever two overhand turns.",
      },
    },
    {
      id: "g3",
      objective: SEEDED_GOAL_OBJECTIVES[1],
      prompt: "What keeps a square knot closed while it is under load?",
      options: [
        { id: "a", text: "The two loops press against each other, so each turn jams the other" },
        { id: "b", text: "The fibres of the rope grip by themselves" },
        { id: "c", text: "The working ends are long" },
        { id: "d", text: "Nothing: it only holds with no load on it" },
      ],
      correctOptionId: "a",
      explanations: {
        brief: "The loops press together and jam each other.",
        standard: "Under tension the two loops press against each other. Each turn jams the other, so the knot holds while the load stays on.",
        detailed:
          "Under tension the two loops press against each other. Each turn jams the other, so the load itself keeps the knot closed. Long ends and rope fibres are not what holds it.",
      },
    },
    {
      id: "g4",
      objective: SEEDED_GOAL_OBJECTIVES[1],
      prompt: "The load on a square knot binding a bundle gets heavier. What happens to the knot?",
      options: [
        { id: "a", text: "It loosens, because the loops slide apart" },
        { id: "b", text: "It stays closed, because the load presses the loops together" },
        { id: "c", text: "It turns into a granny knot" },
        { id: "d", text: "It unties itself at once" },
      ],
      correctOptionId: "b",
      explanations: {
        brief: "A load presses the loops together, so it stays closed.",
        standard: "A square knot binds: the load presses the two loops together, so it stays closed while the load is on.",
        detailed:
          "A square knot binds: the load presses the two loops together, and each turn jams the other. A knot cannot change into a different knot by itself; a granny comes from how it is tied.",
      },
    },
    {
      id: "g5",
      objective: SEEDED_GOAL_OBJECTIVES[2],
      prompt: "You need to join a thick rope to a thin one. Is a square knot a good choice?",
      options: [
        { id: "a", text: "Yes, it suits any two ropes" },
        { id: "b", text: "Yes, if you pull it extra tight" },
        { id: "c", text: "No, it cannot grip both evenly and can slip" },
        { id: "d", text: "No, because square knots only work on thin rope" },
      ],
      correctOptionId: "c",
      explanations: {
        brief: "Different ropes make a square knot slip.",
        standard:
          "A square knot cannot grip ropes of different thickness or stiffness evenly, so it can slip under load. Choose a knot made for joining.",
        detailed:
          "A square knot cannot grip ropes of different thickness or stiffness evenly, so it can slip under load, however tight you pull it. It works on thick rope too; the trouble is the mismatch. Choose a knot made for joining.",
      },
    },
    {
      id: "g6",
      objective: SEEDED_GOAL_OBJECTIVES[2],
      prompt: "Which of these is a job for a square knot?",
      options: [
        { id: "a", text: "Tying off a bundle you will untie by hand" },
        { id: "b", text: "Joining two climbing ropes" },
        { id: "c", text: "A join where something may snag the ends" },
        { id: "d", text: "Joining a thick rope to a thin one" },
      ],
      correctOptionId: "a",
      explanations: {
        brief: "Binding a bundle is what it is for.",
        standard:
          "A square knot is a binding knot: fine for a bundle you will untie by hand, not for a join a life depends on or one whose ends may snag.",
        detailed:
          "A square knot is a binding knot: fine for a bundle you will untie by hand. It can spill when an end is pulled, so not where ends may snag, and not for a join a life depends on or for ropes of different thickness.",
      },
    },
  ],
};

/**
 * Seeded Goal Check, the Course's last Lesson (SEN-81). Outside Progress; it completes on its first scored attempt.
 * Each goal objective links back to the Reading that teaches it.
 */
export const SEEDED_GOAL_CHECK_LESSON = {
  id: SEEDED_GOAL_CHECK_LESSON_ID,
  publishedCourseId: SEEDED_COURSE_ID,
  moduleId: SEEDED_MODULE_ID,
  position: 3,
  teachingMethod: GOAL_CHECK_METHOD_ID,
  title: "Goal Check: the square knot",
  lessonGoal: SEEDED_COURSE.learningGoal,
  objectives: [...SEEDED_GOAL_OBJECTIVES] as string[],
  topicTags: ["square-knot", "binding-knots"],
  assessedLessonIds: [SEEDED_READING_LESSON_ID, SEEDED_FOLLOW_UP_LESSON_ID],
  objectiveLessonIds: {
    [SEEDED_GOAL_OBJECTIVES[0]]: [SEEDED_READING_LESSON_ID],
    [SEEDED_GOAL_OBJECTIVES[1]]: [SEEDED_READING_LESSON_ID],
    [SEEDED_GOAL_OBJECTIVES[2]]: [SEEDED_FOLLOW_UP_LESSON_ID],
  } as Record<string, string[]>,
  lineage: null,
  sources: [] as unknown[],
  citations: [] as unknown[],
  body: SEEDED_GOAL_CHECK_BODY,
};

/** The fixture's taught Lessons in Course order: everything before the Goal Check, which is what Progress counts. */
export const SEEDED_LESSONS = [SEEDED_READING_LESSON, SEEDED_QUIZ_LESSON, SEEDED_FOLLOW_UP_LESSON];

/** Every Lesson the fixture Course is seeded with, in Course order: the taught Lessons, then the Goal Check. */
export const SEEDED_COURSE_LESSONS = [...SEEDED_LESSONS, SEEDED_GOAL_CHECK_LESSON];
