import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { courseRequests, publishedCourses } from "@senoy/db";
import { studyLinksByCourseId } from "../lib/study.ts";

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

      const links = await studyLinksByCourseId(
        app.db,
        learnerId,
        courses.map((course) => course.id),
      );

      return {
        items: [
          ...courses.map((course) => ({
            id: course.id,
            kind: "course" as const,
            title: course.title,
            status: "Published",
            href: links.get(course.id)?.href ?? null,
          })),
          ...requests.map((row) => ({
            id: row.id,
            kind: "course_request" as const,
            title: row.subject,
            status: row.status,
            href: null,
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
      const requestRows = await app.db
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

      const links = await studyLinksByCourseId(
        app.db,
        learnerId,
        courses.map((course) => course.id),
      );

      const courseItems = courses.flatMap((course) => {
        const link = links.get(course.id);
        if (!link?.href) return [];
        if (link.total > 0 && link.completed >= link.total) return [];
        return [
          {
            id: course.id,
            kind: "course" as const,
            title: course.title,
            status: "Published",
            href: link.href,
          },
        ];
      });

      return {
        items: [
          ...courseItems,
          ...requestRows.map((row) => ({
            id: row.id,
            kind: "course_request" as const,
            title: row.subject,
            status: row.status,
            href: null as string | null,
          })),
        ],
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
