import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { courseCompletions, learners, lessonCompletions, type Database } from "@senoy/db";
import { cleanDisplayName } from "@senoy/db/learner-name";

/** Sent when a display name is empty or too long. */
export const DISPLAY_NAME_ERROR = "A name needs 1 to 40 characters.";

/** What the profile counts: Courses and Lessons the Learner finished. */
type Finished = { coursesFinished: number; lessonsFinished: number };

/**
 * Select fields that count the Learner's finished Courses and Lessons as two scalar subqueries, so they ride along
 * on the one statement a route already makes (a round trip to the database costs about 230 ms).
 * @param db - The database
 * @param learnerId - Whose completions to count
 */
function finishedCounts(db: Database, learnerId: string) {
  return {
    coursesFinished: db.$count(courseCompletions, eq(courseCompletions.learnerId, learnerId)),
    lessonsFinished: db.$count(lessonCompletions, eq(lessonCompletions.learnerId, learnerId)),
  };
}

/**
 * What the app shows of the signed-in Learner: their id, display name, the email their sign-in token carries, when
 * they joined, and how many Courses and Lessons they finished.
 * @param request - The request, with its Learner and token user
 * @param displayName - The display name to report
 * @param finished - The finished counts
 */
function meView(request: FastifyRequest, displayName: string, finished: Finished) {
  return {
    id: request.currentLearner.id,
    displayName,
    email: request.authUser.email ?? null,
    memberSince: new Date(request.currentLearner.createdAt).toISOString(),
    coursesFinished: Number(finished.coursesFinished),
    lessonsFinished: Number(finished.lessonsFinished),
  };
}

/**
 * GET and PATCH the signed-in Learner's own account details. Identity (email, password) stays in Supabase Auth.
 * Each costs one statement on top of the sign-in check: GET reads the counts, PATCH returns them from its update.
 * @param app - Fastify app
 */
export async function meRoutes(app: FastifyInstance) {
  app.get("/api/me", async (request, reply) => {
    const learnerId = request.currentLearner.id;
    try {
      const [row] = await app.db.select(finishedCounts(app.db, learnerId)).from(learners).where(eq(learners.id, learnerId));
      return meView(request, request.currentLearner.displayName, row ?? { coursesFinished: 0, lessonsFinished: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[me.ts: meRoutes] Failed to count finished Courses and Lessons || learnerId=${learnerId} || ${message}`);
      return reply.code(500).send({ error: "Couldn't load your account. Try again." });
    }
  });

  app.patch("/api/me", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
    const displayName = typeof body.displayName === "string" ? cleanDisplayName(body.displayName) : null;
    if (!displayName) return reply.code(400).send({ error: DISPLAY_NAME_ERROR });
    try {
      const [row] = await app.db.update(learners).set({ displayName })
        .where(eq(learners.id, request.currentLearner.id))
        .returning({ displayName: learners.displayName, ...finishedCounts(app.db, request.currentLearner.id) });
      if (!row) return reply.code(500).send({ error: "Couldn't save your name. Try again." });
      return meView(request, row.displayName, row);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[me.ts: meRoutes] Failed to save a display name || learnerId=${request.currentLearner.id} || ${message}`);
      return reply.code(500).send({ error: "Couldn't save your name. Try again." });
    }
  });
}
