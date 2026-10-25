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
  course: { id: string; title: string; sequenceMode: SequenceMode; completedAt: string | null };
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
  passed: boolean;
};

/** A correct answer, revealed with an item's feedback. */
export type QuizAnswerKey = {
  itemId: string;
  correctOptionId: string;
  explanation: string;
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
};
