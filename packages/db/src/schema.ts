import { sql } from "drizzle-orm";
import { doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import type { ApprovedBlueprint, CourseBlueprint, JudgeResult } from "./blueprint.ts";
import { COURSE_REQUEST_STATUSES, type ValidityClarification, type ValidityResult } from "./course-request.ts";
import { GENERATION_JOB_KINDS, GENERATION_JOB_STATUSES, GENERATION_STAGES } from "./generation-job.ts";
import type { LessonSource } from "./lesson-checkpoint.ts";
import type { QuizAnswers, QuizAttemptStatus, QuizBody } from "./quiz.ts";
import type { NumberedSource, ReadingBody } from "./reading-lesson.ts";
import type { CapabilityPlan, DiagnosticAnswer, DiagnosticItem, GapConfirmation, ItemReview, StartingLevel } from "./starting-level.ts";
import type { SequenceMode } from "./sequence-mode.ts";
import type { FeedbackTiming, TeachingProfileAnswers } from "./teaching-profile.ts";
import type { BalanceVendor, CostBasis, PipelineEventKind, PipelineEventStatus, ProductEventKind, UsageOutcome, UsageRole, UsageVendor } from "./usage.ts";

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
 * The Source packs researched for one Reading slot of an approved Blueprint: Primary and Secondary, exactly as research
 * returned them. Every Reading is researched at once after Approve and stored here before writing starts; the writer
 * reads its packs from this row, and they stay the retrieval set its Code and Judge checks ran against (ADR 0009).
 */
export const lessonResearch = pgTable(
  "lesson_research",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseRequestId: uuid("course_request_id")
      .notNull()
      .references(() => courseRequests.id),
    slotId: text("slot_id").notNull(),
    sourcePacks: jsonb("source_packs").$type<unknown[]>().notNull(),
    researchedAt: timestamp("researched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("lesson_research_request_slot").on(table.courseRequestId, table.slotId)],
);

/**
 * A finalized, unpublished Lesson checkpoint for one approved Blueprint slot (spec §5.1). Study and reuse read only
 * published tables, so a checkpoint is not playable or reusable until the Course publishes atomically.
 * A Reading's retrieval set is its `lesson_research` row (ADR 0009).
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
    /** Retrieved Sources the Judge model vetted out before writing, with reasons. */
    rejectedSources: jsonb("rejected_sources").$type<{ sourceId: string; url: string; reason: string }[]>().notNull().default([]),
    judge: jsonb("judge").$type<JudgeResult>().notNull(),
    /** Every model that wrote a draft of this Lesson, so the whole-Course Judge is none of them (ADR 0015). Empty before SEN-57: the primary Generator. */
    authorModelIds: jsonb("author_model_ids").$type<string[]>().notNull().default([]),
    /** The model whose Judge pass let this Lesson checkpoint; null before SEN-57. */
    judgeModelId: text("judge_model_id"),
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

/**
 * One step of the platform's own work (validity, a diagnostic, a Lesson write, publish), tied to the Course Request it
 * serves. Steps nest through `parentId` (Course generation → one Reading → its research). Written `running` when the
 * step starts and closed when it returns or throws. Tracking writes never fail the step (ADR 0008).
 */
export const pipelineEvents = pgTable(
  "pipeline_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentId: uuid("parent_id").references((): AnyPgColumn => pipelineEvents.id),
    kind: text("kind").$type<PipelineEventKind>().notNull(),
    /** Human label, such as the Lesson title or slot id. */
    label: text("label"),
    courseRequestId: uuid("course_request_id").references(() => courseRequests.id),
    learnerId: uuid("learner_id").references(() => learners.id),
    status: text("status").$type<PipelineEventStatus>().notNull().default("running"),
    /** The thrown error's message when the step failed. */
    error: text("error"),
    /** Step-specific facts worth seeing (round counts, verdicts). Never credentials. */
    detail: jsonb("detail"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("pipeline_events_started").on(table.startedAt),
    index("pipeline_events_request").on(table.courseRequestId),
    index("pipeline_events_parent").on(table.parentId),
  ],
);

/**
 * One captured call to an external paid service: an OpenRouter model call (one attempt; a retry is its own row) or a
 * research vendor call. Keeps the full request and response with no retention limit (ADR 0008). Its Course Request is
 * reached through its Pipeline Event, never stored twice.
 */
export const usageRecords = pgTable(
  "usage_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pipelineEventId: uuid("pipeline_event_id").references(() => pipelineEvents.id),
    vendor: text("vendor").$type<UsageVendor>().notNull(),
    role: text("role").$type<UsageRole>().notNull(),
    /** The OpenRouter model id, or the research adapter id. */
    modelId: text("model_id").notNull(),
    /** The OpenRouter host that answered. */
    provider: text("provider"),
    /** OpenRouter response id or vendor request/run id. */
    responseId: text("response_id"),
    /** 1-based position among the port's attempts for one request (ADR 0015). */
    attempt: integer("attempt").notNull().default(1),
    outcome: text("outcome").$type<UsageOutcome>().notNull(),
    invalidCause: text("invalid_cause"),
    httpStatus: integer("http_status"),
    /** Safe error text: never provider bodies, prompts, or credentials. */
    error: text("error"),
    promptTokens: integer("prompt_tokens"),
    completionTokens: integer("completion_tokens"),
    reasoningTokens: integer("reasoning_tokens"),
    cachedTokens: integer("cached_tokens"),
    costUsd: doublePrecision("cost_usd"),
    costBasis: text("cost_basis").$type<CostBasis>().notNull(),
    /**
     * Research calls only: what the vendor's balance dropped by across this call, read before and after it. Null when
     * it could not be measured; `measurementNote` says why (overlapping call, balance not readable, still settling).
     */
    measuredCostUsd: doublePrecision("measured_cost_usd"),
    measurementNote: text("measurement_note"),
    request: jsonb("request").notNull(),
    /** The provider body as received; null when none arrived. */
    response: jsonb("response"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms"),
  },
  (table) => [
    index("usage_records_created").on(table.createdAt),
    index("usage_records_event").on(table.pipelineEventId),
    index("usage_records_model").on(table.modelId, table.createdAt),
  ],
);

/** Something a Learner did. */
export const productEvents = pgTable(
  "product_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<ProductEventKind>().notNull(),
    learnerId: uuid("learner_id").references(() => learners.id),
    courseRequestId: uuid("course_request_id").references(() => courseRequests.id),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("product_events_created").on(table.createdAt)],
);

/** One hit on the platform's own `/api/*`, except the Usage Console's own routes. */
export const apiRequests = pgTable(
  "api_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    method: text("method").notNull(),
    /** The route pattern, such as `/api/course-requests/:id`; the raw URL when no route matched. */
    route: text("route").notNull(),
    url: text("url").notNull(),
    statusCode: integer("status_code").notNull(),
    durationMs: integer("duration_ms").notNull(),
    learnerId: uuid("learner_id").references(() => learners.id),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("api_requests_created").on(table.createdAt), index("api_requests_route").on(table.route, table.createdAt)],
);

/**
 * One reading of a paid vendor's account, taken on a schedule by the Usage Console API. Comparing how the balance
 * moved with what was recorded shows spend we did not capture (calls before recording began, other keys, timeouts).
 * A failed reading is kept with its error so gaps are visible.
 */
export const vendorBalanceSnapshots = pgTable(
  "vendor_balance_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendor: text("vendor").$type<BalanceVendor>().notNull(),
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    /** Prepaid money left, in USD. */
    balanceUsd: doublePrecision("balance_usd"),
    /** Parallel: money held for runs still in progress and charges not yet settled, in USD. */
    pendingUsd: doublePrecision("pending_usd"),
    /** OpenRouter: all credits ever bought on the account, in USD. */
    creditsTotalUsd: doublePrecision("credits_total_usd"),
    /** OpenRouter: everything the account has ever spent, across all keys, in USD. */
    accountUsageUsd: doublePrecision("account_usage_usd"),
    /** OpenRouter: everything our API key has ever spent, in USD. */
    keyUsageUsd: doublePrecision("key_usage_usd"),
    /** The vendor's body as received, minus nothing secret (these endpoints return no secrets). */
    raw: jsonb("raw"),
    error: text("error"),
  },
  (table) => [index("vendor_balance_snapshots_vendor_taken").on(table.vendor, table.takenAt)],
);
