import type { FastifyInstance, FastifyReply } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { courseRequests, generationJobs, unpublishedLessons, TEACHING_PROFILE_VERSION, type Database, type ValidityClarification } from "@senoy/db";
import { recordProductEvent, withPipelineEvent } from "../lib/usage-tracking.ts";
import { createValidityGate, type ValidityGate } from "../lib/validity.ts";

/** Learner-facing fields; ownership is never accepted from or exposed to the browser. */
const requestFields = {
  id: courseRequests.id,
  subject: courseRequests.subject,
  learningGoal: courseRequests.learningGoal,
  status: courseRequests.status,
  createdAt: courseRequests.createdAt,
  validity: courseRequests.validity,
  clarification: courseRequests.clarification,
  focus: courseRequests.focus,
  revisedFromId: courseRequests.revisedFromId,
  failureReason: courseRequests.failureReason,
};

/** Injectable domain gate; persistence and HTTP semantics remain in these routes. */
type CourseRequestOptions = { validityGate?: ValidityGate };

/** Route parameters shared by unpublished Request operations. */
type RequestParams = { Params: { requestId: string } };

/** Accepts only an object body; caller validates the fields it actually consumes. */
function bodyFields(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

/** Reads editable Request fields without accepting ownership or status from the browser. */
function editableFields(body: unknown) {
  const { subject, learningGoal } = bodyFields(body);
  if (typeof subject !== "string" || !subject.trim() || typeof learningGoal !== "string" || !learningGoal.trim()) return null;
  return { subject: subject.trim(), learningGoal: learningGoal.trim() };
}

/** A Course Request id: a UUID. */
const REQUEST_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** Creates, reviews, clarifies, and revises unpublished Learner-owned Course Requests. */
export async function courseRequestRoutes(app: FastifyInstance, options: CourseRequestOptions = {}) {
  const gate = options.validityGate ?? createValidityGate();

  /** Validates the ID and reads a private Request, never leaking another Learner's history. */
  async function ownedRequest(id: string, learnerId: string, reply: FastifyReply) {
    if (!REQUEST_ID.test(id)) {
      reply.code(400).send({ error: "Invalid Course Request id." });
      return null;
    }
    const [row] = await app.db.select(requestFields).from(courseRequests).where(and(
      eq(courseRequests.id, id), eq(courseRequests.learnerId, learnerId),
    )).limit(1);
    if (!row) reply.code(404).send({ error: "Course Request not found." });
    return row ?? null;
  }

  app.post("/api/course-requests", async (request, reply) => {
    try {
      if (request.currentLearner.teachingProfileVersion !== TEACHING_PROFILE_VERSION ||
          request.currentLearner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before creating a Course Request." });
      }
      const fields = editableFields(request.body);
      if (!fields) return reply.code(400).send({ error: "Enter a subject and Learning Goal." });
      const [row] = await app.db.insert(courseRequests).values({
        learnerId: request.currentLearner.id, ...fields, status: "awaiting_validity",
      }).returning(requestFields);
      if (!row) return reply.code(500).send({ error: "Failed to save Course Request." });
      void recordProductEvent("course_request_created", { learnerId: request.currentLearner.id, courseRequestId: row.id });
      return reply.code(201).send({ courseRequest: row });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[course-requests.ts: courseRequestRoutes] Failed to save Course Request || learnerId=${request.currentLearner.id} || ${message}`);
      return reply.code(500).send({ error: "Failed to save Course Request." });
    }
  });

  app.get<RequestParams>("/api/course-requests/:requestId", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      return row ? { courseRequest: row } : reply;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[course-requests.ts: courseRequestRoutes] Failed to load Course Request || requestId=${request.params.requestId} || ${message}`);
      return reply.code(500).send({ error: "Failed to load Course Request." });
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/validity", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "awaiting_validity" && row.status !== "awaiting_clarification") {
        return reply.code(409).send({ error: "This Request is not awaiting validity review." });
      }
      const { answer } = bodyFields(request.body);
      let clarification: ValidityClarification | null = null;
      if (row.status === "awaiting_clarification") {
        if (typeof answer !== "string" || !answer.trim()) return reply.code(400).send({ error: "Answer the clarification question." });
        if (!row.validity?.question) throw new Error("Stored clarification question is missing.");
        clarification = { question: row.validity.question, answer: answer.trim() };
      } else if (answer !== undefined) {
        return reply.code(400).send({ error: "Review the Request before answering a clarification." });
      }
      let validity;
      try {
        validity = await withPipelineEvent("validity", {
          label: clarification ? "With clarification" : row.subject,
          courseRequestId: row.id,
          learnerId: request.currentLearner.id,
          detail: { clarified: clarification !== null },
        }, async (event) => {
          const result = await gate.evaluate({ subject: row.subject, learningGoal: row.learningGoal, clarification });
          event.setDetail({ outcome: result.outcome });
          return result;
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.log.error(`[course-requests.ts: courseRequestRoutes] Validity provider failed || requestId=${row.id} || ${message}`);
        return reply.code(502).send({ error: "Validity review could not finish. Your Request is unchanged; try again." });
      }
      // An unresolved answer is asked the same question again; keep offering its answers if the gate offered none.
      if (validity.outcome === "clarify" && !validity.answerOptions?.length && row.validity?.answerOptions?.length) {
        validity = { ...validity, answerOptions: row.validity.answerOptions };
      }
      const status = validity.outcome === "pass" ? "validity_passed" : validity.outcome === "reject" ? "rejected" : "awaiting_clarification";
      const [updated] = await app.db.update(courseRequests).set({ validity, clarification, status }).where(and(
        eq(courseRequests.id, row.id), eq(courseRequests.learnerId, request.currentLearner.id),
        eq(courseRequests.status, row.status),
        row.clarification ? eq(courseRequests.clarification, row.clarification) : isNull(courseRequests.clarification),
      )).returning(requestFields);
      if (!updated) return reply.code(409).send({ error: "This Request changed during review. Reload it before continuing." });
      if (clarification) {
        void recordProductEvent("course_request_clarified", {
          learnerId: request.currentLearner.id, courseRequestId: row.id, detail: { outcome: validity.outcome },
        });
      }
      return { courseRequest: updated };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[course-requests.ts: courseRequestRoutes] Failed to persist validity review || requestId=${request.params.requestId} || ${message}`);
      return reply.code(500).send({ error: "Could not save validity review. Reload the Request before trying again." });
    }
  });

  app.post<RequestParams>("/api/course-requests/:requestId/revise", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      // Revise request follows a rejection, or a Course that could not be generated (spec §5.1); the original stays as it is.
      if (row.status !== "rejected" && row.status !== "generation_failed") {
        return reply.code(409).send({ error: "Only a rejected or failed Request can be revised here." });
      }
      if (request.currentLearner.teachingProfileVersion !== TEACHING_PROFILE_VERSION || request.currentLearner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before creating a Course Request." });
      }
      // The current (possibly focused) goal carries over as editable text; `focus` does not, so the draft goes through
      // Validity and focusing again, where a precise goal passes straight through (SEN-90).
      // Only a failed Request has Lessons and a job to end with the new draft, so only it needs a transaction (SEN-102).
      const revise = async (transaction: Pick<Database, "insert" | "delete" | "update">) => {
        const [created] = await transaction.insert(courseRequests).values({
          learnerId: request.currentLearner.id, subject: row.subject, learningGoal: row.learningGoal,
          status: "draft", revisedFromId: row.id,
        }).returning(requestFields);
        if (!created) throw new Error("Revised Request was not saved.");
        // After a generation failure the revised draft takes over: the failed Request stays failed, its unpublished
        // Lessons are discarded, and its job ends `revised` so nothing can Retry it (spec §5.1). Published Courses are
        // in their own tables and are never touched; a rejected Request never generated and has nothing to discard.
        if (row.status === "generation_failed") {
          await transaction.delete(unpublishedLessons).where(eq(unpublishedLessons.courseRequestId, row.id));
          await transaction.update(generationJobs).set({ status: "revised", claimToken: null, leaseExpiresAt: null, updatedAt: new Date() })
            .where(and(eq(generationJobs.courseRequestId, row.id), eq(generationJobs.kind, "course")))
            .returning({ id: generationJobs.id });
        }
        return created;
      };
      const draft = row.status === "generation_failed" ? await app.db.transaction(revise) : await revise(app.db);
      void recordProductEvent("course_request_created", {
        learnerId: request.currentLearner.id, courseRequestId: draft.id, detail: { revisedFromId: row.id, from: row.status },
      });
      return reply.code(201).send({ courseRequest: draft });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[course-requests.ts: courseRequestRoutes] Failed to revise Course Request || requestId=${request.params.requestId} || ${message}`);
      return reply.code(500).send({ error: "Could not create the revised Request. The original is unchanged." });
    }
  });

  app.patch<RequestParams>("/api/course-requests/:requestId", async (request, reply) => {
    try {
      const { requestId } = request.params;
      if (!REQUEST_ID.test(requestId)) return reply.code(400).send({ error: "Invalid Course Request id." });
      if (request.currentLearner.teachingProfileVersion !== TEACHING_PROFILE_VERSION || request.currentLearner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before creating a Course Request." });
      }
      const fields = editableFields(request.body);
      if (!fields) return reply.code(400).send({ error: "Enter a subject and Learning Goal." });
      // One conditional write: it lands only on this Learner's draft. The Request is read only to say why it didn't.
      const [updated] = await app.db.update(courseRequests).set({ ...fields, status: "awaiting_validity" }).where(and(
        eq(courseRequests.id, requestId), eq(courseRequests.learnerId, request.currentLearner.id), eq(courseRequests.status, "draft"),
      )).returning(requestFields);
      if (updated) return { courseRequest: updated };
      const row = await ownedRequest(requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      return reply.code(409).send({ error: row.status !== "draft" ? "Only a draft Request can be edited." : "This Request changed. Reload it before continuing." });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[course-requests.ts: courseRequestRoutes] Failed to save revised Request || requestId=${request.params.requestId} || ${message}`);
      return reply.code(500).send({ error: "Could not save the revised Request." });
    }
  });
}