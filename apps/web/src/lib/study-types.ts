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
  course: { id: string; title: string; sequenceMode: SequenceMode };
  progress: { completed: number; total: number };
  currentLessonId: string;
  modules: StudyModule[];
};

/** The attempt Study shows: the open draft, or the last submitted one. */
export type QuizAttemptView = {
  status: QuizAttemptStatus;
  answers: QuizAnswers;
  results: Record<string, boolean>;
  score: QuizScore | null;
};

/** Learner state of one Quiz. Never carries the answer key. */
export type QuizView = {
  feedbackTiming: FeedbackTiming;
  attempt: QuizAttemptView | null;
  best: QuizScore | null;
  passed: boolean;
  answersOpen: boolean;
};

/** A revealed correct answer. */
export type QuizAnswerKey = {
  itemId: string;
  correctOptionId: string;
  explanation: string;
};
