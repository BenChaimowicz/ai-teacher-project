import { and, asc, eq, inArray } from "drizzle-orm";
import {
  lessonCompletions,
  publishedCourses,
  publishedLessons,
  publishedModules,
  quizAttempts,
  type Database,
  type FeedbackTiming,
  type QuizAnswers,
  type QuizAttemptStatus,
  type SequenceMode,
} from "@senoy/db";

/** Published Course fields Study needs. */
export type CourseRow = { id: string; title: string; sequenceMode: string };

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
};

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
  completedLessonIds(learnerId: string, lessonIds: string[]): Promise<Set<string>>;
  /** Idempotent: Progress never drops and never double-counts. */
  insertCompletion(learnerId: string, lessonId: string): Promise<void>;
  setSequenceMode(courseId: string, mode: SequenceMode): Promise<void>;
  /** Attempts oldest first. */
  listQuizAttempts(learnerId: string, lessonId: string): Promise<QuizAttemptRow[]>;
  insertQuizAttempt(
    learnerId: string,
    lessonId: string,
    feedbackTiming: FeedbackTiming,
    answers: QuizAnswers,
  ): Promise<QuizAttemptRow>;
  updateQuizAttempt(id: string, patch: QuizAttemptPatch): Promise<void>;
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
        })
        .from(publishedLessons)
        .where(eq(publishedLessons.publishedCourseId, courseId))
        .orderBy(asc(publishedLessons.position));
    },

    async completedLessonIds(learnerId, lessonIds) {
      if (lessonIds.length === 0) return new Set();
      const rows = await db
        .select({ lessonId: lessonCompletions.lessonId })
        .from(lessonCompletions)
        .where(and(eq(lessonCompletions.learnerId, learnerId), inArray(lessonCompletions.lessonId, lessonIds)));
      return new Set(rows.map((row) => row.lessonId));
    },

    async insertCompletion(learnerId, lessonId) {
      await db.insert(lessonCompletions).values({ learnerId, lessonId }).onConflictDoNothing();
    },

    async setSequenceMode(courseId, mode) {
      await db.update(publishedCourses).set({ sequenceMode: mode }).where(eq(publishedCourses.id, courseId));
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

    async updateQuizAttempt(id, patch) {
      await db.update(quizAttempts).set(patch).where(eq(quizAttempts.id, id));
    },
  };
}
