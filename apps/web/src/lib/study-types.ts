import type { GoalCheckMissingReason, GoalCheckNextStep, GoalCheckResult } from "@senoy/db/goal-check";
import type { NumberedSource } from "@senoy/db/reading-lesson";
import type { QuizAnswers, QuizAttemptStatus, QuizScore } from "@senoy/db/quiz";
import type { SequenceMode } from "@senoy/db/sequence-mode";
import type { FeedbackTiming } from "@senoy/db/teaching-profile";

/** One Lesson in the Study list. */
export type StudyLesson = {
  id: string;
  title: string;
  teachingMethod: string;
  position: number;
  lessonGoal: string;
  completed: boolean;
  /** Linear Sequence mode: after a Quiz that is not passed yet. */
  locked: boolean;
  body: unknown;
  citations: NumberedSource[];
};

/** One Module in the Study list. */
export type StudyModule = {
  id: string;
  title: string;
  position: number;
  lessons: StudyLesson[];
};

/** Published Course payload for Study chrome. */
export type StudyPayload = {
  /** `completedAt` is set once every Lesson is complete. */
  course: { id: string; title: string; learningGoal: string; sequenceMode: SequenceMode; completedAt: string | null };
  progress: { completed: number; total: number };
  currentLessonId: string;
  modules: StudyModule[];
};

/** The attempt Study shows: the open draft, or the last submitted one. */
export type QuizAttemptView = {
  status: QuizAttemptStatus;
  answers: QuizAnswers;
  results: Record<string, boolean>;
  /** Correct answer and why, only for items that already have feedback (checked, or after Submit). */
  answerKeys: Record<string, QuizAnswerKey>;
  score: QuizScore | null;
};

/** Learner state of one Quiz. An item's answer key arrives only once that item has feedback. */
export type QuizView = {
  feedbackTiming: FeedbackTiming;
  attempt: QuizAttemptView | null;
  best: QuizScore | null;
  /** For a Goal Check, true once it has a scored attempt, whatever the score (decision 2026-11-04). */
  passed: boolean;
  /** Goal Check only, once it has a scored attempt: where the best attempt lands against the Learning Goal. */
  goal?: GoalCheckView | null;
};

/** What the Learner said after a "not met" Goal Check, and what they chose next (null until they choose). */
export type GoalCheckFeedbackView = {
  reasons: GoalCheckMissingReason[];
  otherText: string | null;
  nextStep: GoalCheckNextStep | null;
};

/** A Goal Check's result as Study shows it: outcome, best score, missed objectives, and the Learner's feedback. */
export type GoalCheckView = GoalCheckResult & { feedback: GoalCheckFeedbackView | null };

/** The reply to choosing a next step after a "not met" Goal Check. `newCourseHref` is set for `new_course`. */
export type GoalCheckNextStepReply = { nextStep: GoalCheckNextStep; newCourseHref: string | null };

/** A correct answer, revealed with an item's feedback. */
export type QuizAnswerKey = {
  itemId: string;
  correctOptionId: string;
  explanation: string;
  /** One sentence per option, by option id, saying why it is right or wrong (decision 2026-11-03); absent on older Quizzes. */
  optionNotes?: Record<string, string>;
};

/** What the Course-complete screen shows. */
export type CourseSummary = {
  course: { id: string; title: string; learningGoal: string; completedAt: string };
  modules: {
    id: string;
    title: string;
    lessons: { id: string; title: string; lessonGoal: string; teachingMethod: string }[];
  }[];
  quizzes: { lessonId: string; title: string; best: QuizScore | null }[];
  /** The Course's Goal Check and its result (null before a scored attempt); null on Courses made before SEN-81. */
  goalCheck: { lessonId: string; result: GoalCheckResult | null } | null;
};
