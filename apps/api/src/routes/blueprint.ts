import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  blueprintSlots,
  courseBlueprints,
  courseRequests,
  generationJobs,
  learnerBlueprint,
  publishedCourses,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  unpublishedLessons,
  type CourseRequestStatus,
  type Database,
  type GenerationJobStatus,
  type GenerationView,
  type SequenceMode,
} from "@senoy/db";
import { enqueueJob } from "../lib/generation-job.ts";
import { studyLinksByCourseId } from "../lib/study.ts";

/** Learner-facing Request fields; ownership is never exposed. */
const requestFields = {
  id: courseRequests.id,
  subject: courseRequests.subject,
  learningGoal: courseRequests.learningGoal,
  status: courseRequests.status,
  createdAt: courseRequests.createdAt,
  validity: courseRequests.validity,
  clarification: courseRequests.clarification,
  revisedFromId: courseRequests.revisedFromId,
  failureReason: courseRequests.failureReason,
};

/** Route parameters for one Request. */
type RequestParams = { Params: { requestId: string } };

/** A stored Blueprint row. */
type BlueprintRow = typeof courseBlueprints.$inferSelect;

/**
 * What Learner review sees: titles and Lesson goals, the Sequence mode pick, and whether it is approved.
 * @param row - Stored Blueprint
 */
function learnerView(row: BlueprintRow) {
  const approved = row.approved;
  return {
    blueprint: learnerBlueprint(approved?.blueprint ?? row.draft),
    sequenceMode: approved?.sequenceMode ?? row.sequenceMode,
    approved: approved !== null,
  };
}

/** Accepts only an object body. */
function bodyFields(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

/** Reads a Sequence mode from the body, or null when it is missing or unknown. */
function sequenceModeField(body: unknown): SequenceMode | null {
  const { sequenceMode } = bodyFields(body);
  return sequenceMode === "linear" || sequenceMode === "free_jump" ? sequenceMode : null;
}

/** Where a Learner can queue a stopped job again, and the Request status each leaves the Request in. */
type Requeueable = Partial<Record<GenerationJobStatus, CourseRequestStatus>>;

/** Resume picks up a cancelled or interrupted job. */
const RESUMABLE: Requeueable = {
  cancelled: "generation_cancelled",
  interrupted: "generation_failed",
};

/** Matches a Request's Course-generation job, never its Blueprint job. */
function courseJobOf(requestId: string) {
  return and(eq(generationJobs.courseRequestId, requestId), eq(generationJobs.kind, "course"));
}

/**
 * Retry re-attempts a failed job, or resumes an interrupted one (spec §5.1). A new run has a fresh repair budget, so
 * the failed Lesson is written again; finished checkpoints are kept.
 */
const RETRYABLE: Requeueable = {
  failed: "generation_failed",
  interrupted: "generation_failed",
};

/**
 * What the Waiting screen shows of a Request's Course job: stage, current Lesson, and N of M, never a draft or its Sources.
 * @param db - Database
 * @param requestId - The Request
 * @param blueprint - Its stored Blueprint
 * @returns The view, or null before Approve
 */
async function generationView(db: Database, requestId: string, blueprint: BlueprintRow | null): Promise<GenerationView | null> {
  const [job] = await db.select().from(generationJobs).where(courseJobOf(requestId)).limit(1);
  if (!job || !blueprint?.approved) return null;
  const slots = blueprintSlots(blueprint.approved.blueprint);
  const finished = await db.select({ slotId: unpublishedLessons.slotId }).from(unpublishedLessons)
    .where(eq(unpublishedLessons.courseRequestId, requestId));
  const index = job.status === "running" && job.stage === "lesson" ? slots.findIndex((slot) => slot.id === job.currentSlotId) : -1;
  return {
    status: job.status,
    stage: job.status === "running" ? job.stage : null,
    lessonNumber: index >= 0 ? index + 1 : null,
    lessonTitle: index >= 0 ? slots[index]!.title : null,
    finishedLessons: finished.length,
    totalLessons: slots.length,
  };
}

/**
 * Queues, shows, and approves the Course Blueprint for a Learner-owned Course Request; cancels, resumes, and retries its
 * Course job. The worker designs the Blueprint and generates the Course.
 */
export async function blueprintRoutes(app: FastifyInstance) {
  /** Reads a private Request, never leaking another Learner's history. */
  async function ownedRequest(id: string, learnerId: string, reply: FastifyReply) {
    if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id)) {
      reply.code(400).send({ error: "Invalid Course Request id." });
      return null;
    }
    const [row] = await app.db.select(requestFields).from(courseRequests).where(and(
      eq(courseRequests.id, id), eq(courseRequests.learnerId, learnerId),
    )).limit(1);
    if (!row) reply.code(404).send({ error: "Course Request not found." });
    return row ?? null;
  }

  /** The Request's Blueprint, if one was prepared. */
  async function blueprintOf(requestId: string) {
    const [row] = await app.db.select().from(courseBlueprints).where(eq(courseBlueprints.courseRequestId, requestId)).limit(1);
    return row ?? null;
  }

  /** Logs and reports an unexpected failure. */
  function fail(reply: FastifyReply, log: FastifyInstance["log"], where: string, requestId: string, error: unknown, message: string) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error(`[blueprint.ts: ${where}] ${message} || requestId=${requestId} || ${detail}`);
    return reply.code(500).send({ error: message });
  }

  /** Where a published Request's Course opens in Study; null until it publishes. */
  async function publishedCourseOf(requestId: string, learnerId: string) {
    const [course] = await app.db.select({ id: publishedCourses.id }).from(publishedCourses)
      .where(and(eq(publishedCourses.courseRequestId, requestId), eq(publishedCourses.learnerId, learnerId))).limit(1);
    if (!course) return null;
    const links = await studyLinksByCourseId(app.db, learnerId, [course.id]);
    return { href: links.get(course.id)?.href ?? null };
  }

  app.get<RequestParams>("/api/course-requests/:requestId/blueprint", async (request, reply) => {
    try {
      const learnerId = request.currentLearner.id;
      const row = await ownedRequest(request.params.requestId, learnerId, reply);
      if (!row) return reply;
      const blueprint = await blueprintOf(row.id);
      const course = row.status === "published" ? await publishedCourseOf(row.id, learnerId) : null;
      const generation = await generationView(app.db, row.id, blueprint);
      return { courseRequest: row, blueprint: blueprint ? learnerView(blueprint) : null, course, generation };
    } catch (error) {
      return fail(reply, request.log, "get", request.params.requestId, error, "Failed to load the Course Blueprint.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/blueprint", async (request, reply) => {
    try {
      const learner = request.currentLearner;
      const row = await ownedRequest(request.params.requestId, learner.id, reply);
      if (!row) return reply;
      if (row.status !== "starting_level_confirmed") return reply.code(409).send({ error: "This Request is not ready for a Course Blueprint." });
      if (learner.teachingProfileVersion !== TEACHING_PROFILE_VERSION || learner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before designing a Course Blueprint." });
      }
      const [attempt] = await app.db.select().from(startingLevelDiagnostics)
        .where(eq(startingLevelDiagnostics.courseRequestId, row.id))
        .orderBy(desc(startingLevelDiagnostics.createdAt)).limit(1);
      if (!attempt?.startingLevel || !attempt.confirmation) throw new Error("Confirmed Request has no confirmed Starting Level.");
      // The status and the queued job land together, so a restart mid-design leaves a job the worker picks up (spec §5.1).
      const preparing = await app.db.transaction(async (transaction) => {
        const [moved] = await transaction.update(courseRequests).set({ status: "blueprint_preparing", failureReason: null }).where(and(
          eq(courseRequests.id, row.id), eq(courseRequests.learnerId, learner.id), eq(courseRequests.status, "starting_level_confirmed"),
        )).returning(requestFields);
        if (!moved) throw new RequestChangedError();
        await enqueueJob(transaction, { courseRequestId: row.id, learnerId: learner.id, kind: "blueprint" });
        return moved;
      }).catch((error: unknown) => {
        if (error instanceof RequestChangedError) return null;
        throw error;
      });
      if (!preparing) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      return reply.code(202).send({ courseRequest: preparing });
    } catch (error) {
      return fail(reply, request.log, "prepare", request.params.requestId, error, "Failed to prepare the Course Blueprint.");
    }
  });

  app.put<RequestParams>("/api/course-requests/:requestId/blueprint/sequence-mode", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "blueprint_review") return reply.code(409).send({ error: "This Blueprint is not awaiting review." });
      const sequenceMode = sequenceModeField(request.body);
      if (!sequenceMode) return reply.code(400).send({ error: "Choose linear or free jump." });
      const [saved] = await app.db.update(courseBlueprints).set({ sequenceMode })
        .where(and(eq(courseBlueprints.courseRequestId, row.id), isNull(courseBlueprints.approved))).returning();
      if (!saved) return reply.code(409).send({ error: "This Blueprint changed. Reload it before continuing." });
      return { courseRequest: row, blueprint: learnerView(saved) };
    } catch (error) {
      return fail(reply, request.log, "sequence-mode", request.params.requestId, error, "Failed to save the Sequence mode.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/blueprint/approve", async (request, reply) => {
    try {
      const learnerId = request.currentLearner.id;
      const row = await ownedRequest(request.params.requestId, learnerId, reply);
      if (!row) return reply;
      if (row.status !== "blueprint_review") return reply.code(409).send({ error: "This Blueprint is not awaiting review." });
      const sequenceMode = sequenceModeField(request.body);
      if (!sequenceMode) return reply.code(400).send({ error: "Choose linear or free jump." });
      const current = await blueprintOf(row.id);
      if (!current) throw new Error("Reviewing Request has no Course Blueprint.");
      const approvedAt = new Date();
      const approved = { blueprint: current.draft, sequenceMode, approvedAt: approvedAt.toISOString() };
      // The snapshot, the status, and the queued job land together; the worker claims the job (spec §5.1).
      const outcome = await app.db.transaction(async (transaction) => {
        const [saved] = await transaction.update(courseBlueprints).set({ sequenceMode, approved, approvedAt })
          .where(and(eq(courseBlueprints.id, current.id), isNull(courseBlueprints.approved))).returning();
        if (!saved) return { error: "This Blueprint changed. Reload it before continuing." } as const;
        const [generating] = await transaction.update(courseRequests).set({ status: "generating" }).where(and(
          eq(courseRequests.id, row.id), eq(courseRequests.learnerId, learnerId), eq(courseRequests.status, "blueprint_review"),
        )).returning(requestFields);
        if (!generating) throw new RequestChangedError();
        await enqueueJob(transaction, { courseRequestId: row.id, learnerId, kind: "course" });
        return { saved, generating } as const;
      }).catch((error: unknown) => {
        if (error instanceof RequestChangedError) return { error: "This Request changed. Reload it before continuing." } as const;
        throw error;
      });
      if ("error" in outcome) return reply.code(409).send({ error: outcome.error });
      const generation = await generationView(app.db, row.id, outcome.saved);
      return { courseRequest: outcome.generating, blueprint: learnerView(outcome.saved), generation };
    } catch (error) {
      return fail(reply, request.log, "approve", request.params.requestId, error, "Failed to approve the Course Blueprint.");
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/generation/cancel", async (request, reply) => {
    try {
      const learnerId = request.currentLearner.id;
      const row = await ownedRequest(request.params.requestId, learnerId, reply);
      if (!row) return reply;
      // The worker notices at its next stage and saves nothing more; finished checkpoints stay (spec §5.1). The job row
      // is locked before the Request, in the order the worker's own writes take them.
      const cancelled = await app.db.transaction(async (transaction) => {
        await transaction.update(generationJobs).set({ status: "cancelled", claimToken: null, leaseExpiresAt: null, updatedAt: new Date() })
          .where(courseJobOf(row.id)).returning({ id: generationJobs.id });
        const [moved] = await transaction.update(courseRequests).set({ status: "generation_cancelled" }).where(and(
          eq(courseRequests.id, row.id), eq(courseRequests.learnerId, learnerId), eq(courseRequests.status, "generating"),
        )).returning(requestFields);
        if (!moved) throw new RequestChangedError();
        return moved;
      }).catch((error: unknown) => {
        if (error instanceof RequestChangedError) return null;
        throw error;
      });
      if (!cancelled) return reply.code(409).send({ error: "This Course is not being generated." });
      const generation = await generationView(app.db, row.id, await blueprintOf(row.id));
      return { courseRequest: cancelled, generation };
    } catch (error) {
      return fail(reply, request.log, "cancel", request.params.requestId, error, "Failed to cancel generation.");
    }
  });

  /**
   * Queues the Request's stopped job again: same job, same approved Blueprint, and the next claim continues from the
   * next unfinished Lesson.
   * @param action - Route name, for errors and logs
   * @param from - The job statuses this action accepts
   */
  function requeue(action: "resume" | "retry", from: Requeueable) {
    return async (request: FastifyRequest<RequestParams>, reply: FastifyReply) => {
      try {
        const learnerId = request.currentLearner.id;
        const row = await ownedRequest(request.params.requestId, learnerId, reply);
        if (!row) return reply;
        const [job] = await app.db.select({ id: generationJobs.id, status: generationJobs.status }).from(generationJobs)
          .where(courseJobOf(row.id)).limit(1);
        const status = job ? from[job.status] : undefined;
        if (!job || status !== row.status) return reply.code(409).send({ error: `This Course cannot be ${action === "resume" ? "resumed" : "retried"}.` });
        const queued = await app.db.transaction(async (transaction) => {
          const [requeued] = await transaction.update(generationJobs).set({ status: "queued", stage: null, currentSlotId: null, updatedAt: new Date() })
            .where(and(eq(generationJobs.id, job.id), eq(generationJobs.status, job.status))).returning({ id: generationJobs.id });
          if (!requeued) throw new RequestChangedError();
          const [moved] = await transaction.update(courseRequests).set({ status: "generating", failureReason: null }).where(and(
            eq(courseRequests.id, row.id), eq(courseRequests.learnerId, learnerId), eq(courseRequests.status, status),
          )).returning(requestFields);
          if (!moved) throw new RequestChangedError();
          return moved;
        }).catch((error: unknown) => {
          if (error instanceof RequestChangedError) return null;
          throw error;
        });
        if (!queued) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
        const generation = await generationView(app.db, row.id, await blueprintOf(row.id));
        return { courseRequest: queued, generation };
      } catch (error) {
        return fail(reply, request.log, action, request.params.requestId, error, `Failed to ${action} generation.`);
      }
    };
  }

  app.post<RequestParams>("/api/course-requests/:requestId/generation/resume", requeue("resume", RESUMABLE));
  app.post<RequestParams>("/api/course-requests/:requestId/generation/retry", requeue("retry", RETRYABLE));
}

/** Rolls back a transaction whose Request moved on before it committed. */
class RequestChangedError extends Error {}
