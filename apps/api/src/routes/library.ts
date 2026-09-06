import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { courseRequests, publishedCourses } from "@senoy/db";

/**
 * Library and Open items queries for the current Learner.
 * @param app - Fastify app
 */
export async function libraryRoutes(app: FastifyInstance) {
  app.get("/api/library", async (request, reply) => {
    try {
      const learnerId = request.currentLearner.id;

      const requests = await app.db
        .select({
          id: courseRequests.id,
          subject: courseRequests.subject,
          status: courseRequests.status,
        })
        .from(courseRequests)
        .where(eq(courseRequests.learnerId, learnerId));

      const courses = await app.db
        .select({
          id: publishedCourses.id,
          title: publishedCourses.title,
        })
        .from(publishedCourses)
        .where(eq(publishedCourses.learnerId, learnerId));

      return {
        items: [
          ...courses.map((course) => ({
            id: course.id,
            kind: "course" as const,
            title: course.title,
            status: "published",
          })),
          ...requests.map((row) => ({
            id: row.id,
            kind: "course_request" as const,
            title: row.subject,
            status: row.status,
          })),
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[library.ts: libraryRoutes] Failed to load Library || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load Library." });
    }
  });

  app.get("/api/open-items", async (request, reply) => {
    try {
      const learnerId = request.currentLearner.id;
      const rows = await app.db
        .select({
          id: courseRequests.id,
          subject: courseRequests.subject,
          status: courseRequests.status,
        })
        .from(courseRequests)
        .where(eq(courseRequests.learnerId, learnerId));

      return {
        items: rows.map((row) => ({
          id: row.id,
          title: row.subject,
          status: row.status,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[library.ts: libraryRoutes] Failed to load Open items || learnerId=${request.currentLearner.id} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load Open items." });
    }
  });
}
