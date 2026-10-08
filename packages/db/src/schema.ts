import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { CourseRequestStatus, ValidityClarification, ValidityResult } from "./course-request.ts";
import type { QuizAnswers, QuizAttemptStatus } from "./quiz.ts";
import type { CapabilityPlan, DiagnosticAnswer, DiagnosticItem, GapConfirmation, ItemReview, StartingLevel } from "./starting-level.ts";
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
  status: text("status").$type<CourseRequestStatus>().notNull(),
  validity: jsonb("validity").$type<ValidityResult>(),
  clarification: jsonb("clarification").$type<ValidityClarification>(),
  revisedFromId: uuid("revised_from_id").references((): AnyPgColumn => courseRequests.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One Starting Level diagnostic attempt for a Course Request. A retry is a new row.
 * Keys, warrants, and reviews never leave the server. Model IDs are recorded for provenance (ADR 0007).
 */
export const startingLevelDiagnostics = pgTable(
  "starting_level_diagnostics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseRequestId: uuid("course_request_id")
      .notNull()
      .references(() => courseRequests.id),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    capabilities: jsonb("capabilities").$type<CapabilityPlan[]>().notNull().default([]),
    items: jsonb("items").$type<DiagnosticItem[]>().notNull().default([]),
    reviews: jsonb("reviews").$type<ItemReview[]>().notNull().default([]),
    coverageNote: text("coverage_note"),
    answers: jsonb("answers").$type<Record<string, DiagnosticAnswer>>(),
    startingLevel: jsonb("starting_level").$type<StartingLevel>(),
    confirmation: text("confirmation").$type<GapConfirmation>(),
    authorModelId: text("author_model_id"),
    judgeModelId: text("judge_model_id"),
    factCheckVendor: text("fact_check_vendor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  },
  (table) => [index("starting_level_diagnostics_request").on(table.courseRequestId)],
);

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
