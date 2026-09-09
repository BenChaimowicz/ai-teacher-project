import type { FastifyInstance } from "fastify";
import { loadStudyCourse } from "../lib/study.ts";

/**
 * Study payload for a published Course.
 * @param app - Fastify app
 */
export async function studyRoutes(app: FastifyInstance) {
  app.get("/api/courses/:courseId", async (request, reply) => {
    try {
      const { courseId } = request.params as { courseId: string };
      const payload = await loadStudyCourse(app.db, request.currentLearner.id, courseId);
      if (!payload) {
        return reply.code(404).send({ error: "Published Course not found." });
      }
      return payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[study.ts: studyRoutes] Failed to load Study || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load Study." });
    }
  });
}
