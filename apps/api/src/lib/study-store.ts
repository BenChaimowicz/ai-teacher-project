import { and, asc, eq } from "drizzle-orm";
import {
  courseCompletions,
  goalCheckFeedback,
  lessonCompletions,
  publishedCourses,
  publishedLessons,
  publishedModules,
  quizAttempts,
  type Database,
  type FeedbackTiming,
  type GoalCheckFeedback,
  type GoalCheckNextStep,
  type QuizAnswers,
  type QuizAttemptStatus,
  type SequenceMode,
} from "@senoy/db";

/** Published Course fields Study needs. */
export type CourseRow = { id: string; title: string; subject: string; learningGoal: string; sequenceMode: string };

/** Published Module fields Study needs. */
export type ModuleRow = { id: string; title: string; position: number };

/** Published Lesson fields Study needs. */
export type LessonRow = {
  id: string;
  moduleId: string;
  title: string;
  teachingMethod: string;
  position: number;
  lessonGoal: string;
  body: unknown;
  citations: unknown;
  /** The Lesson's objectives; on the Goal Check, the goal objectives in the order the slot listed them. */
  objectives: string[];
  /** On the Goal Check only: each goal objective's teaching Lessons. Empty otherwise. */
  objectiveLessonIds: Record<string, string[]>;
};

/** What a Learner said was missing after a "not met" Goal Check, and the next step they chose (null until chosen). */
export type GoalCheckFeedbackRow = GoalCheckFeedback & { nextStep: GoalCheckNextStep | null };

/** One stored Quiz attempt. */
export type QuizAttemptRow = {
  id: string;
  status: QuizAttemptStatus;
  feedbackTiming: FeedbackTiming;
  answers: unknown;
  correct: number | null;
  total: number | null;
  startedAt: Date;
};

/** Changes allowed on an attempt. */
export type QuizAttemptPatch = Partial<Pick<QuizAttemptRow, "status" | "correct" | "total">> & {
  answers?: QuizAnswers;
  submittedAt?: Date;
};

/**
 * The reads and writes Study and Quiz play make. Routes take this so tests can swap in memory for Postgres.
 */
export type StudyStore = {
  findCourse(learnerId: string, courseId: string): Promise<CourseRow | null>;
  listModules(courseId: string): Promise<ModuleRow[]>;
  /** Lessons in Course order. */
  listLessons(courseId: string): Promise<LessonRow[]>;
  /** This Learner's completed Lessons in one Course, read with the Course's Lessons in one statement. */
  completedLessonIds(learnerId: string, courseId: string): Promise<Set<string>>;
  /** Idempotent: Progress never drops and never double-counts. */
  insertCompletion(learnerId: string, lessonId: string): Promise<void>;
  /** Writes only a Course this Learner owns. */
  setSequenceMode(learnerId: string, courseId: string, mode: SequenceMode): Promise<void>;
  /** When this Learner completed the Course, or null. */
  courseCompletedAt(learnerId: string, courseId: string): Promise<Date | null>;
  /** Idempotent: the first completion time is kept. */
  insertCourseCompletion(learnerId: string, courseId: string): Promise<void>;
  /** Attempts oldest first. */
  listQuizAttempts(learnerId: string, lessonId: string): Promise<QuizAttemptRow[]>;
  insertQuizAttempt(
    learnerId: string,
    lessonId: string,
    feedbackTiming: FeedbackTiming,
    answers: QuizAnswers,
  ): Promise<QuizAttemptRow>;
  /** Writes only an attempt this Learner owns. */
  updateQuizAttempt(learnerId: string, id: string, patch: QuizAttemptPatch): Promise<void>;
  /** This Learner's feedback on one Goal Check, or null before they sent any. */
  getGoalCheckFeedback(learnerId: string, lessonId: string): Promise<GoalCheckFeedbackRow | null>;
  /** Stores feedback, replacing any earlier one; the next step is cleared so it is chosen again. */
  saveGoalCheckFeedback(learnerId: string, lessonId: string, feedback: GoalCheckFeedback): Promise<void>;
  /** Stores the next step on existing feedback. */
  setGoalCheckNextStep(learnerId: string, lessonId: string, nextStep: GoalCheckNextStep): Promise<void>;
};

const attemptColumns = {
  id: quizAttempts.id,
  status: quizAttempts.status,
  feedbackTiming: quizAttempts.feedbackTiming,
  answers: quizAttempts.answers,
  correct: quizAttempts.correct,
  total: quizAttempts.total,
  startedAt: quizAttempts.startedAt,
};

/**
 * Postgres-backed Study store.
 * @param db - Drizzle client
 */
export function drizzleStudyStore(db: Database): StudyStore {
  return {
    async findCourse(learnerId, courseId) {
      const [course] = await db
        .select({
          id: publishedCourses.id,
          title: publishedCourses.title,
          subject: publishedCourses.subject,
          learningGoal: publishedCourses.learningGoal,
          sequenceMode: publishedCourses.sequenceMode,
        })
        .from(publishedCourses)
        .where(and(eq(publishedCourses.id, courseId), eq(publishedCourses.learnerId, learnerId)))
        .limit(1);
      return course ?? null;
    },

    async listModules(courseId) {
      return db
        .select({ id: publishedModules.id, title: publishedModules.title, position: publishedModules.position })
        .from(publishedModules)
        .where(eq(publishedModules.publishedCourseId, courseId))
        .orderBy(asc(publishedModules.position));
    },

    async listLessons(courseId) {
      return db
        .select({
          id: publishedLessons.id,
          moduleId: publishedLessons.moduleId,
          title: publishedLessons.title,
          teachingMethod: publishedLessons.teachingMethod,
          position: publishedLessons.position,
          lessonGoal: publishedLessons.lessonGoal,
          body: publishedLessons.body,
          citations: publishedLessons.citations,
          objectives: publishedLessons.objectives,
          objectiveLessonIds: publishedLessons.objectiveLessonIds,
        })
        .from(publishedLessons)
        .where(eq(publishedLessons.publishedCourseId, courseId))
        .orderBy(asc(publishedLessons.position));
    },

    async completedLessonIds(learnerId, courseId) {
      const rows = await db
        .select({ lessonId: lessonCompletions.lessonId })
        .from(lessonCompletions)
        .innerJoin(publishedLessons, eq(publishedLessons.id, lessonCompletions.lessonId))
        .where(and(eq(lessonCompletions.learnerId, learnerId), eq(publishedLessons.publishedCourseId, courseId)));
      return new Set(rows.map((row) => row.lessonId));
    },

    async insertCompletion(learnerId, lessonId) {
      await db.insert(lessonCompletions).values({ learnerId, lessonId }).onConflictDoNothing();
    },

    async setSequenceMode(learnerId, courseId, mode) {
      await db.update(publishedCourses).set({ sequenceMode: mode })
        .where(and(eq(publishedCourses.id, courseId), eq(publishedCourses.learnerId, learnerId)));
    },

    async courseCompletedAt(learnerId, courseId) {
      const [row] = await db
        .select({ completedAt: courseCompletions.completedAt })
        .from(courseCompletions)
        .where(and(eq(courseCompletions.learnerId, learnerId), eq(courseCompletions.publishedCourseId, courseId)))
        .limit(1);
      return row?.completedAt ?? null;
    },

    async insertCourseCompletion(learnerId, courseId) {
      await db.insert(courseCompletions).values({ learnerId, publishedCourseId: courseId }).onConflictDoNothing();
    },

    async listQuizAttempts(learnerId, lessonId) {
      return db
        .select(attemptColumns)
        .from(quizAttempts)
        .where(and(eq(quizAttempts.learnerId, learnerId), eq(quizAttempts.lessonId, lessonId)))
        .orderBy(asc(quizAttempts.startedAt));
    },

    async insertQuizAttempt(learnerId, lessonId, feedbackTiming, answers) {
      const [row] = await db
        .insert(quizAttempts)
        .values({ learnerId, lessonId, feedbackTiming, answers })
        .returning(attemptColumns);
      if (!row) throw new Error("Quiz attempt was not inserted.");
      return row;
    },

    async updateQuizAttempt(learnerId, id, patch) {
      await db.update(quizAttempts).set(patch).where(and(eq(quizAttempts.id, id), eq(quizAttempts.learnerId, learnerId)));
    },

    async getGoalCheckFeedback(learnerId, lessonId) {
      const [row] = await db
        .select({ reasons: goalCheckFeedback.reasons, otherText: goalCheckFeedback.otherText, nextStep: goalCheckFeedback.nextStep })
        .from(goalCheckFeedback)
        .where(and(eq(goalCheckFeedback.learnerId, learnerId), eq(goalCheckFeedback.lessonId, lessonId)))
        .limit(1);
      return row ?? null;
    },

    async saveGoalCheckFeedback(learnerId, lessonId, feedback) {
      const values = { reasons: feedback.reasons, otherText: feedback.otherText, nextStep: null, updatedAt: new Date() };
      await db
        .insert(goalCheckFeedback)
        .values({ learnerId, lessonId, ...values })
        .onConflictDoUpdate({ target: [goalCheckFeedback.learnerId, goalCheckFeedback.lessonId], set: values });
    },

    async setGoalCheckNextStep(learnerId, lessonId, nextStep) {
      await db
        .update(goalCheckFeedback)
        .set({ nextStep, updatedAt: new Date() })
        .where(and(eq(goalCheckFeedback.learnerId, learnerId), eq(goalCheckFeedback.lessonId, lessonId)));
    },
  };
}
