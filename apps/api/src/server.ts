import Fastify from "fastify";
import { loadRootEnv } from "@senoy/db";
import corsPlugin from "./plugins/cors.ts";
import currentLearnerPlugin from "./plugins/current-learner.ts";
import dbPlugin from "./plugins/db.ts";
import spaPlugin from "./plugins/spa.ts";
import { healthRoutes } from "./routes/health.ts";
import { libraryRoutes } from "./routes/library.ts";
import { mediaRoutes } from "./routes/media.ts";
import { teachingProfileRoutes } from "./routes/teaching-profile.ts";

/**
 * Starts the Fastify API (JSON, `/media/…`, and the built SPA when present).
 */
async function start() {
  const root = loadRootEnv(import.meta.url, 3);
  const app = Fastify({ logger: true });

  try {
    await app.register(dbPlugin);
    await app.register(currentLearnerPlugin);
    await app.register(corsPlugin);
    await app.register(healthRoutes);
    await app.register(libraryRoutes);
    await app.register(teachingProfileRoutes);
    await app.register(mediaRoutes);
    await app.register(spaPlugin, { root });

    const port = Number(process.env.PORT ?? 3000);
    const host = process.env.HOST ?? "127.0.0.1";
    await app.listen({ port, host });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    app.log.error(`[server.ts: start] Failed to start API || ${message}`);
    process.exit(1);
  }
}

await start();
