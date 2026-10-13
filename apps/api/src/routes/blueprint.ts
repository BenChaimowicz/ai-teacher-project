import type { FastifyInstance, FastifyReply } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  courseBlueprints,
  courseRequests,
  learnerBlueprint,
  resolveTeachingProfile,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  type CourseRequestStatus,
  type SequenceMode,
} from "@senoy/db";
import { BlueprintFailedError, createBlueprintBuilder, type BlueprintBuilder } from "../lib/blueprint.ts";
import { createCourseGeneration, type CourseGeneration } from "../lib/course-generation.ts";

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
};

/** Injectable builder and generation; persistence and HTTP semantics stay in these routes. */
type BlueprintOptions = { blueprintBuilder?: BlueprintBuilder; courseGeneration?: CourseGeneration };

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

/** Prepares, shows, and approves the Course Blueprint for a Learner-owned Course Request. */
export async function blueprintRoutes(app: FastifyInstance, options: BlueprintOptions = {}) {
  const builder = options.blueprintBuilder ?? createBlueprintBuilder();
  const generation = options.courseGeneration ?? createCourseGeneration();

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

  /** Moves a Request between statuses only if nothing else moved it first. */
  async function transition(requestId: string, learnerId: string, from: CourseRequestStatus, to: CourseRequestStatus) {
    const [updated] = await app.db.update(courseRequests).set({ status: to }).where(and(
      eq(courseRequests.id, requestId), eq(courseRequests.learnerId, learnerId), eq(courseRequests.status, from),
    )).returning(requestFields);
    return updated ?? null;
  }

  /** Logs and reports an unexpected failure. */
  function fail(reply: FastifyReply, log: FastifyInstance["log"], where: string, requestId: string, error: unknown, message: string) {
    const detail = error instanceof Error ? error.message : String(error);
    log.error(`[blueprint.ts: ${where}] ${message} || requestId=${requestId} || ${detail}`);
    return reply.code(500).send({ error: message });
  }

  app.get<RequestParams>("/api/course-requests/:requestId/blueprint", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      const blueprint = await blueprintOf(row.id);
      return { courseRequest: row, blueprint: blueprint ? learnerView(blueprint) : null };
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
      const preparing = await transition(row.id, learner.id, "starting_level_confirmed", "blueprint_preparing");
      if (!preparing) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });

      const profile = resolveTeachingProfile(learner.teachingProfileAnswers);
      let checked;
      try {
        checked = await builder.build({
          subject: row.subject,
          learningGoal: row.learningGoal,
          startingLevel: attempt.startingLevel,
          confirmation: attempt.confirmation,
          profile: {
            instructionLanguage: profile.instructionLanguage.value,
            quizCadence: profile.quizCadence.value,
            explanationOrder: profile.explanationOrder.value,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.log.error(`[blueprint.ts: prepare] Blueprint preparation failed || requestId=${row.id} || ${message}`);
        await transition(row.id, learner.id, "blueprint_preparing", "starting_level_confirmed");
        const copy = error instanceof BlueprintFailedError
          ? "The Course Blueprint we designed did not pass our checks. Your Request is unchanged; try again."
          : "We couldn't design your Course Blueprint. Your Request is unchanged; try again.";
        return reply.code(502).send({ error: copy });
      }
      const [saved] = await app.db.insert(courseBlueprints).values({
        courseRequestId: row.id, learnerId: learner.id, draft: checked.blueprint, judge: checked.judge,
      }).returning();
      if (!saved) throw new Error("Course Blueprint was not saved.");
      const ready = await transition(row.id, learner.id, "blueprint_preparing", "blueprint_review");
      if (!ready) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      return { courseRequest: ready, blueprint: learnerView(saved) };
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
      const [saved] = await app.db.update(courseBlueprints).set({ sequenceMode, approved, approvedAt })
        .where(and(eq(courseBlueprints.id, current.id), isNull(courseBlueprints.approved))).returning();
      if (!saved) return reply.code(409).send({ error: "This Blueprint changed. Reload it before continuing." });
      const generating = await transition(row.id, learnerId, "blueprint_review", "generating");
      if (!generating) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      // In-process happy path; the Learner sees the waiting screen while it runs. Durable jobs come later (spec §5.1).
      void generation.start({ db: app.db, courseRequestId: row.id, learnerId, approved }).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error);
        request.log.error(`[blueprint.ts: approve] Course generation failed || requestId=${row.id} || ${detail}`);
      });
      return { courseRequest: generating, blueprint: learnerView(saved) };
    } catch (error) {
      return fail(reply, request.log, "approve", request.params.requestId, error, "Failed to approve the Course Blueprint.");
    }
  });
}
