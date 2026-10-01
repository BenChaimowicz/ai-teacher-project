import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { courseRequests, TEACHING_PROFILE_VERSION } from "@senoy/db";

/** Learner-facing fields; ownership is never accepted from or exposed to the browser. */
const requestFields = {
  id: courseRequests.id,
  subject: courseRequests.subject,
  learningGoal: courseRequests.learningGoal,
  status: courseRequests.status,
  createdAt: courseRequests.createdAt,
};

/**
 * Creates and reads unpublished Course Requests owned by the current Learner.
 * @param app - Fastify app
 */
export async function courseRequestRoutes(app: FastifyInstance) {
  app.post("/api/course-requests", async (request, reply) => {
    try {
      if (request.currentLearner.teachingProfileVersion !== TEACHING_PROFILE_VERSION ||
          request.currentLearner.teachingProfileAnswers == null) {
        return reply.code(409).send({ error: "Save your Teaching Profile before creating a Course Request." });
      }
      const body = request.body && typeof request.body === "object" && !Array.isArray(request.body)
        ? request.body as Record<string, unknown>
        : {};
      if (typeof body.subject !== "string" || !body.subject.trim() ||
          typeof body.learningGoal !== "string" || !body.learningGoal.trim()) {
        return reply.code(400).send({ error: "Enter a subject and Learning Goal." });
      }
      const [row] = await app.db.insert(courseRequests).values({
        learnerId: request.currentLearner.id,
        subject: body.subject.trim(),
        learningGoal: body.learningGoal.trim(),
        status: "awaiting_validity",
      }).returning(requestFields);
      if (!row) return reply.code(500).send({ error: "Failed to save Course Request." });
      const { id, subject, learningGoal, status, createdAt } = row;
      return reply.code(201).send({ courseRequest: { id, subject, learningGoal, status, createdAt } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[course-requests.ts: courseRequestRoutes] Failed to save Course Request || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to save Course Request." });
    }
  });

  app.get<{ Params: { requestId: string } }>("/api/course-requests/:requestId", async (request, reply) => {
    try {
      if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(request.params.requestId)) {
        return reply.code(400).send({ error: "Invalid Course Request id." });
      }
      const [row] = await app.db.select(requestFields).from(courseRequests).where(and(
        eq(courseRequests.id, request.params.requestId),
        eq(courseRequests.learnerId, request.currentLearner.id),
      )).limit(1);
      if (!row) return reply.code(404).send({ error: "Course Request not found." });
      const { id, subject, learningGoal, status, createdAt } = row;
      return { courseRequest: { id, subject, learningGoal, status, createdAt } };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[course-requests.ts: courseRequestRoutes] Failed to load Course Request || learnerId=${request.currentLearner.id} || requestId=${request.params.requestId} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load Course Request." });
    }
  });
}