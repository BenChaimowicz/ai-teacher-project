import type { FastifyInstance } from "fastify";

/**
 * Health check that does not require a Learner.
 * @param app - Fastify app
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get("/api/health", async () => ({ ok: true }));
}
