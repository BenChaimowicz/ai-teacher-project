import type { FastifyInstance, FastifyReply } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { courseRequests, TEACHING_PROFILE_VERSION, type ValidityClarification } from "@senoy/db";
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
  revisedFromId: courseRequests.revisedFromId,
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

/** Creates, reviews, clarifies, and revises unpublished Learner-owned Course Requests. */
export async function courseRequestRoutes(app: FastifyInstance, options: CourseRequestOptions = {}) {
  const gate = options.validityGate ?? createValidityGate();

  /** Validates the ID and reads a private Request, never leaking another Learner's history. */
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
        validity = await gate.evaluate({ subject: row.subject, learningGoal: row.learningGoal, clarification });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.log.error(`[course-requests.ts: courseRequestRoutes] Validity provider failed || requestId=${row.id} || ${message}`);
        return reply.code(502).send({ error: "Validity review could not finish. Your Request is unchanged; try again." });
      }
      const status = validity.outcome === "pass" ? "validity_passed" : validity.outcome === "reject" ? "rejected" : "awaiting_clarification";
      const [updated] = await app.db.update(courseRequests).set({ validity, clarification, status }).where(and(
        eq(courseRequests.id, row.id), eq(courseRequests.learnerId, request.currentLearner.id),
        eq(courseRequests.status, row.status),
        row.clarification ? eq(courseRequests.clarification, row.clarification) : isNull(courseRequests.clarification),
      )).returning(requestFields);
      if (!updated) return reply.code(409).send({ error: "This Request changed during review. Reload it before continuing." });
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
      if (row.status !== "rejected") return reply.code(409).send({ error: "Only a rejected Request can be revised here." });
      if (request.currentLearner.teachingProfileVersion !== TEACHING_PROFILE_VERSION || request.currentLearner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before creating a Course Request." });
      }
      const [draft] = await app.db.insert(courseRequests).values({
        learnerId: request.currentLearner.id, subject: row.subject, learningGoal: row.learningGoal,
        status: "draft", revisedFromId: row.id,
      }).returning(requestFields);
      if (!draft) throw new Error("Revised Request was not saved.");
      return reply.code(201).send({ courseRequest: draft });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[course-requests.ts: courseRequestRoutes] Failed to revise Course Request || requestId=${request.params.requestId} || ${message}`);
      return reply.code(500).send({ error: "Could not create the revised Request. The original is unchanged." });
    }
  });

  app.patch<RequestParams>("/api/course-requests/:requestId", async (request, reply) => {
    try {
      const row = await ownedRequest(request.params.requestId, request.currentLearner.id, reply);
      if (!row) return reply;
      if (row.status !== "draft") return reply.code(409).send({ error: "Only a draft Request can be edited." });
      if (request.currentLearner.teachingProfileVersion !== TEACHING_PROFILE_VERSION || request.currentLearner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before creating a Course Request." });
      }
      const fields = editableFields(request.body);
      if (!fields) return reply.code(400).send({ error: "Enter a subject and Learning Goal." });
      const [updated] = await app.db.update(courseRequests).set({ ...fields, status: "awaiting_validity" }).where(and(
        eq(courseRequests.id, row.id), eq(courseRequests.learnerId, request.currentLearner.id), eq(courseRequests.status, "draft"),
      )).returning(requestFields);
      if (!updated) return reply.code(409).send({ error: "This Request changed. Reload it before continuing." });
      return { courseRequest: updated };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[course-requests.ts: courseRequestRoutes] Failed to save revised Request || requestId=${request.params.requestId} || ${message}`);
      return reply.code(500).send({ error: "Could not save the revised Request." });
    }
  });
}