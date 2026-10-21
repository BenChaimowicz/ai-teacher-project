import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { ApprovedBlueprint, CourseBlueprint, JudgeResult } from "./blueprint.ts";
import { COURSE_REQUEST_STATUSES, type ValidityClarification, type ValidityResult } from "./course-request.ts";
import { GENERATION_JOB_KINDS, GENERATION_JOB_STATUSES, GENERATION_STAGES } from "./generation-job.ts";
import type { LessonSource } from "./lesson-checkpoint.ts";
import type { QuizAnswers, QuizAttemptStatus, QuizBody } from "./quiz.ts";
import type { NumberedSource, ReadingBody } from "./reading-lesson.ts";
import type { CapabilityPlan, DiagnosticAnswer, DiagnosticItem, GapConfirmation, ItemReview, StartingLevel } from "./starting-level.ts";
import type { SequenceMode } from "./sequence-mode.ts";
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

/** Where a Course Request is in its lifecycle. */
export const courseRequestStatus = pgEnum("course_request_status", COURSE_REQUEST_STATUSES);

/** A Course Request owned by a Learner. Home lists it in the Library until its Course publishes. */
export const courseRequests = pgTable("course_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  subject: text("subject").notNull(),
  learningGoal: text("learning_goal").notNull(),
  status: courseRequestStatus("status").notNull(),
  validity: jsonb("validity").$type<ValidityResult>(),
  clarification: jsonb("clarification").$type<ValidityClarification>(),
  revisedFromId: uuid("revised_from_id").references((): AnyPgColumn => courseRequests.id),
  /** Plain-language reason the last step failed, with its next step; cleared when the Learner tries again. */
  failureReason: text("failure_reason"),
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

/**
 * The Course Blueprint for one Course Request: the current draft, its system checks, and the last approved snapshot.
 * `sequenceMode` is the Learner's pick during review, kept so closing and returning preserves it.
 */
export const courseBlueprints = pgTable("course_blueprints", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseRequestId: uuid("course_request_id")
    .notNull()
    .unique()
    .references(() => courseRequests.id),
  learnerId: uuid("learner_id")
    .notNull()
    .references(() => learners.id),
  draft: jsonb("draft").$type<CourseBlueprint>().notNull(),
  judge: jsonb("judge").$type<JudgeResult>().notNull(),
  sequenceMode: text("sequence_mode").$type<SequenceMode>().notNull().default("linear"),
  approved: jsonb("approved").$type<ApprovedBlueprint>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
});

/** What a generation job produces. */
export const generationJobKind = pgEnum("generation_job_kind", GENERATION_JOB_KINDS);

/** Where a generation job is in its lifecycle. */
export const generationJobStatus = pgEnum("generation_job_status", GENERATION_JOB_STATUSES);

/** What a running generation job is doing. */
export const generationStage = pgEnum("generation_stage", GENERATION_STAGES);

/**
 * A durable job (spec §5.1): `blueprint` designs and checks the Course Blueprint; `course` generates and publishes the
 * Course for the approved Blueprint. At most one of each kind per Request.
 * A worker holds a `running` job through `claimToken` until `leaseExpiresAt`; a lapsed lease (the worker crashed) lets
 * another claim continue from the next unfinished Lesson. Every write the job makes checks it still holds the lease.
 */
export const generationJobs = pgTable(
  "generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseRequestId: uuid("course_request_id")
      .notNull()
      .references(() => courseRequests.id),
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    kind: generationJobKind("kind").notNull().default("course"),
    status: generationJobStatus("status").notNull().default("queued"),
    stage: generationStage("stage"),
    /** The Blueprint slot being written while the stage is `lesson`. */
    currentSlotId: text("current_slot_id"),
    claimToken: uuid("claim_token"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    /** How many times a worker has claimed the job. */
    claims: integer("claims").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("generation_jobs_request_kind").on(table.courseRequestId, table.kind),
    index("generation_jobs_claimable").on(table.status, table.createdAt),
  ],
);

/**
 * A finalized, unpublished Lesson checkpoint for one approved Blueprint slot (spec §5.1). Study and reuse read only
 * published tables, so a checkpoint is not playable or reusable until the Course publishes atomically.
 * `sourcePacks` is the Lesson's retrieval set as research returned it; the Code and Judge checks ran against it (ADR 0009).
 */
export const unpublishedLessons = pgTable(
  "unpublished_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseRequestId: uuid("course_request_id")
      .notNull()
      .references(() => courseRequests.id),
    slotId: text("slot_id").notNull(),
    position: integer("position").notNull(),
    teachingMethod: text("teaching_method").notNull(),
    title: text("title").notNull(),
    lessonGoal: text("lesson_goal").notNull(),
    objectives: jsonb("objectives").$type<string[]>().notNull(),
    topicTags: jsonb("topic_tags").$type<string[]>().notNull(),
    lineage: jsonb("lineage"),
    sources: jsonb("sources").$type<LessonSource[]>().notNull(),
    citations: jsonb("citations").$type<NumberedSource[]>().notNull(),
    body: jsonb("body").$type<ReadingBody | QuizBody>().notNull(),
    /** The Reading's Source packs; a Quiz is generated from its assessed Lessons and has none. */
    sourcePacks: jsonb("source_packs").$type<unknown[]>().notNull(),
    /** Retrieved Sources the Judge model vetted out before writing, with reasons. */
    rejectedSources: jsonb("rejected_sources").$type<{ sourceId: string; url: string; reason: string }[]>().notNull().default([]),
    judge: jsonb("judge").$type<JudgeResult>().notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("unpublished_lessons_request_slot").on(table.courseRequestId, table.slotId)],
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
 * Learner runtime: a published Course whose every Lesson is complete. Written once, when the last
 * completion lands; it is not re-derived on read and does not edit the snapshot (ADR 0013).
 */
export const courseCompletions = pgTable(
  "course_completions",
  {
    learnerId: uuid("learner_id")
      .notNull()
      .references(() => learners.id),
    publishedCourseId: uuid("published_course_id")
      .notNull()
      .references(() => publishedCourses.id),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.learnerId, table.publishedCourseId] })],
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
