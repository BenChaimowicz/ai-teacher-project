import { and, desc, eq, isNull, ne } from "drizzle-orm";
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
          learningGoal: courseRequests.learningGoal,
          status: courseRequests.status,
        })
        .from(courseRequests)
        // A published Request is listed as its Course.
        .where(and(eq(courseRequests.learnerId, learnerId), ne(courseRequests.status, "published"), isNull(courseRequests.hiddenAt)))
        // Newest first, so a Learner who started the same subject again lands on the latest Request.
        .orderBy(desc(courseRequests.createdAt), desc(courseRequests.id));

      const courses = await app.db
        .select({
          id: publishedCourses.id,
          title: publishedCourses.title,
        })
        .from(publishedCourses)
        .where(and(eq(publishedCourses.learnerId, learnerId), isNull(publishedCourses.hiddenAt)))
        .orderBy(desc(publishedCourses.publishedAt), desc(publishedCourses.id));

      const links = await studyLinksByCourseId(
        app.db,
        learnerId,
        courses.map((course) => course.id),
      );

      return {
        items: [
          ...courses.map((course) => {
            const link = links.get(course.id);
            return {
              id: course.id,
              kind: "course" as const,
              title: course.title,
              status: link?.courseCompleted ? "Completed" : "Published",
              href: link?.href ?? null,
              progress: { completed: link?.completed ?? 0, total: link?.total ?? 0 },
            };
          }),
          ...requests.map((row) => ({
            id: row.id,
            kind: "course_request" as const,
            title: row.subject,
            learningGoal: row.learningGoal,
            status: row.status,
            href: `/course-requests/${row.id}`,
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

  // Removes a Course or Course Request from the Library (Home and the sidebar). Nothing is deleted.
  app.post("/api/library/hide", async (request, reply) => {
    const learnerId = request.currentLearner.id;
    const body = request.body as { kind?: unknown; id?: unknown } | null;
    const kind = body?.kind;
    const id = typeof body?.id === "string" ? body.id : null;
    if ((kind !== "course" && kind !== "course_request") || !id || !/^[\da-f-]{36}$/i.test(id)) {
      return reply.code(400).send({ error: "Say which course to remove." });
    }
    try {
      const table = kind === "course" ? publishedCourses : courseRequests;
      const hidden = await app.db
        .update(table)
        .set({ hiddenAt: new Date() })
        .where(and(eq(table.id, id), eq(table.learnerId, learnerId)))
        .returning({ id: table.id });
      if (!hidden.length) return reply.code(404).send({ error: "That course wasn't found." });
      return reply.code(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[library.ts: libraryRoutes] Failed to hide a Library item || learnerId=${learnerId} || kind=${String(kind)} || id=${id} || ${message}`);
      return reply.code(500).send({ error: "Couldn't remove that course. Try again." });
    }
  });

  app.get("/api/open-items", async (request, reply) => {
    try {
      const learnerId = request.currentLearner.id;
      const requestRows = await app.db
        .select({
          id: courseRequests.id,
          subject: courseRequests.subject,
          learningGoal: courseRequests.learningGoal,
          status: courseRequests.status,
        })
        .from(courseRequests)
        // A published Request is listed as its Course.
        .where(and(eq(courseRequests.learnerId, learnerId), ne(courseRequests.status, "published"), isNull(courseRequests.hiddenAt)))
        // Newest first, so a Learner who started the same subject again lands on the latest Request.
        .orderBy(desc(courseRequests.createdAt), desc(courseRequests.id));

      const courses = await app.db
        .select({
          id: publishedCourses.id,
          title: publishedCourses.title,
        })
        .from(publishedCourses)
        .where(and(eq(publishedCourses.learnerId, learnerId), isNull(publishedCourses.hiddenAt)))
        .orderBy(desc(publishedCourses.publishedAt), desc(publishedCourses.id));

      const links = await studyLinksByCourseId(
        app.db,
        learnerId,
        courses.map((course) => course.id),
      );

      const courseItems = courses.flatMap((course) => {
        const link = links.get(course.id);
        if (!link?.href || link.courseCompleted) return [];
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
            learningGoal: row.learningGoal,
            status: row.status,
            href: `/course-requests/${row.id}`,
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
