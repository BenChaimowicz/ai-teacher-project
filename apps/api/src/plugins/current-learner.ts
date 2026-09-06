import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { learners } from "@senoy/db";

/** A Learner row as stored in Postgres. */
type Learner = typeof learners.$inferSelect;

declare module "fastify" {
  interface FastifyRequest {
    currentLearner: Learner;
  }
}

/**
 * True when the request needs `currentLearner` (Learner-owned API routes).
 * @param request - Incoming request
 */
function needsLearner(request: FastifyRequest) {
  const path = request.url.split("?")[0] ?? "";
  if (!path.startsWith("/api/")) return false;
  if (path === "/api/health") return false;
  return true;
}

/**
 * Loads the only Learner row onto the request. Later this hook becomes auth.
 * @param app - Fastify app
 */
async function currentLearnerPlugin(app: FastifyInstance) {
  app.addHook("onRequest", async (request, reply) => {
    if (!needsLearner(request)) return;
    try {
      const [row] = await app.db.select().from(learners).limit(1);
      if (!row) {
        return reply.code(500).send({ error: "No Learner is seeded." });
      }
      request.currentLearner = row;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[current-learner.ts: currentLearnerPlugin] Failed to load current Learner || url=${request.url} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load current Learner." });
    }
  });
}

export default fp(currentLearnerPlugin, { name: "current-learner", dependencies: ["db"] });
