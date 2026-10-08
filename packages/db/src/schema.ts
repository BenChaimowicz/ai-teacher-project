import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { ValidityClarification, ValidityResult } from "./course-request.ts";
import type { QuizAnswers, QuizAttemptStatus } from "./quiz.ts";
import type { FeedbackTiming, TeachingProfileAnswers } from "./teaching-profile.ts";

/** One person taking Courses. The prototype seeds a single row. Teaching Profile lives here. */
export const learners = pgTable("learners", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  teachingProfileVersion: integer("teaching_profile_version"),
  teachingProfileAnswers: jsonb("teaching_profile_answers").$type<TeachingProfileAnswers>(),
  teachingProfileAssessedAt: timestamp("teaching_profile_assessed_at", { withTimezone: true }),
  teachingProfileUpdatedAt: timestamp("teaching_profile_updated_at", { withTimezone: true }),
});

/** Unpublished Course Request owned by a Learner. Home lists these in the Library. */
export const courseRequests = pgTable("course_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  subject: text("subject").notNull(),
  learningGoal: text("learning_goal").notNull(),
  status: text("status").notNull(),
  validity: jsonb("validity").$type<ValidityResult>(),
  clarification: jsonb("clarification").$type<ValidityClarification>(),
  revisedFromId: uuid("revised_from_id").references((): AnyPgColumn => courseRequests.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Published Course snapshot owned by a Learner. Progress is not stored here. */
export const publishedCourses = pgTable("published_courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  courseRequestId: uuid("course_request_id").references(() => courseRequests.id),
  title: text("title").notNull(),
  subject: text("subject").notNull(),
  learningGoal: text("learning_goal").notNull(),
  sequenceMode: text("sequence_mode").notNull().default("linear"),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Named grouping of Lessons inside a published Course. */
export const publishedModules = pgTable(
  "published_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publishedCourseId: uuid("published_course_id")
      .notNull()
      .references(() => publishedCourses.id),
    title: text("title").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [unique("published_modules_course_position").on(table.publishedCourseId, table.position)],
);

/** One published Lesson. Body, lineage, Sources, and Citations may be empty on a stub. */
export const publishedLessons = pgTable(
  "published_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    publishedCourseId: uuid("published_course_id")
      .notNull()
      .references(() => publishedCourses.id),
    moduleId: uuid("module_id")
      .notNull()
      .references(() => publishedModules.id),
    position: integer("position").notNull(),
    teachingMethod: text("teaching_method").notNull(),
    title: text("title").notNull(),
    lessonGoal: text("lesson_goal").notNull(),
    objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
    topicTags: jsonb("topic_tags").$type<string[]>().notNull().default([]),
    assessedLessonIds: jsonb("assessed_lesson_ids").$type<string[]>().notNull().default([]),
    lineage: jsonb("lineage"),
    sources: jsonb("sources").$type<unknown[]>().notNull().default([]),
    citations: jsonb("citations").$type<unknown[]>().notNull().default([]),
    body: jsonb("body"),
  },
  (table) => [unique("published_lessons_course_position").on(table.publishedCourseId, table.position)],
);

/** Learner runtime: a Lesson counted toward Progress. Does not edit the snapshot. */
export const lessonCompletions = pgTable(
  "lesson_completions",
  {
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => publishedLessons.id),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.learnerId, table.lessonId] })],
);

/**
 * Learner runtime: one Quiz attempt. A draft until Submit, then scored. Best score is derived across submitted rows.
 * `feedbackTiming` is the Teaching Profile value when the attempt started; it holds for the whole attempt.
 */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    lessonId: uuid("lesson_id")
      .notNull()
      .references(() => publishedLessons.id),
    status: text("status").$type<QuizAttemptStatus>().notNull().default("draft"),
    feedbackTiming: text("feedback_timing").$type<FeedbackTiming>().notNull(),
    answers: jsonb("answers").$type<QuizAnswers>().notNull().default({}),
    correct: integer("correct"),
    total: integer("total"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
  },
  (table) => [
    index("quiz_attempts_learner_lesson").on(table.learnerId, table.lessonId),
    uniqueIndex("quiz_attempts_one_draft").on(table.learnerId, table.lessonId).where(sql`${table.status} = 'draft'`),
  ],
);
