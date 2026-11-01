import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { learners } from "@senoy/db";
import { cleanDisplayName } from "@senoy/db/learner-name";

/** Sent when a display name is empty or too long. */
export const DISPLAY_NAME_ERROR = "A name needs 1 to 40 characters.";

/**
 * What the app shows of the signed-in Learner: their id, display name, and the email their sign-in token carries.
 * @param request - The request, with its Learner and token user
 * @param displayName - The display name to report
 */
function meView(request: FastifyRequest, displayName: string) {
  return { id: request.currentLearner.id, displayName, email: request.authUser.email ?? null };
}

/**
 * GET and PATCH the signed-in Learner's own account details. Identity (email, password) stays in Supabase Auth.
 * @param app - Fastify app
 */
export async function meRoutes(app: FastifyInstance) {
  app.get("/api/me", async (request) => meView(request, request.currentLearner.displayName));

  app.patch("/api/me", async (request, reply) => {
    const body = request.body && typeof request.body === "object" ? (request.body as Record<string, unknown>) : {};
    const displayName = typeof body.displayName === "string" ? cleanDisplayName(body.displayName) : null;
    if (!displayName) return reply.code(400).send({ error: DISPLAY_NAME_ERROR });
    try {
      const [row] = await app.db.update(learners).set({ displayName })
        .where(eq(learners.id, request.currentLearner.id)).returning({ displayName: learners.displayName });
      if (!row) return reply.code(500).send({ error: "Couldn't save your name. Try again." });
      return meView(request, row.displayName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[me.ts: meRoutes] Failed to save a display name || learnerId=${request.currentLearner.id} || ${message}`);
      return reply.code(500).send({ error: "Couldn't save your name. Try again." });
    }
  });
}
