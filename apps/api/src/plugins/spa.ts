import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import fastifyStatic from "@fastify/static";

/** Options for serving the built SPA from the repo. */
type SpaOptions = { root: string };

/**
 * In production, Fastify serves the Vite build and SPA fallbacks.
 * Locally the dist folder is missing, so Vite owns the UI.
 * @param app - Fastify app
 * @param opts.root - Monorepo root
 */
async function spaPlugin(app: FastifyInstance, opts: SpaOptions) {
  try {
    const webDist = resolve(opts.root, "apps/web/dist");
    if (!existsSync(webDist)) {
      app.log.info({ webDist }, "SPA dist not found; Vite serves the UI in development");
      return;
    }

    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      const path = request.url.split("?")[0] ?? "";
      if (request.method === "GET" && !path.startsWith("/api") && !path.startsWith("/media")) {
        return reply.sendFile("index.html");
      }
      return reply.code(404).send({ error: "Not found" });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[spa.ts: spaPlugin] Failed to serve SPA || root=${opts.root} || ${message}`);
  }
}

export default fp(spaPlugin, { name: "spa" });
