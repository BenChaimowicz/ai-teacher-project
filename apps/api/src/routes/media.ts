import type { FastifyInstance } from "fastify";

/**
 * Stable `/media/…` path. Files do not exist yet, so every request is 404.
 * Signed URLs are never stored.
 * @param app - Fastify app
 */
export async function mediaRoutes(app: FastifyInstance) {
  app.get("/media/*", async (_request, reply) => {
    return reply.code(404).send({ error: "Not found" });
  });
}
