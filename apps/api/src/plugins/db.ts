import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { createDb, DEFAULT_POOL_SIZE, warmDb, type Database } from "@senoy/db";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

/**
 * Attaches a Drizzle client to the Fastify instance, and opens its whole pool before the server accepts traffic, so the
 * first requests don't pay connection setup (SEN-103). A failed warm-up is logged, not fatal: requests reconnect.
 * @param app - Fastify app
 */
async function dbPlugin(app: FastifyInstance) {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
    }
    app.decorate("db", createDb(url, { max: DEFAULT_POOL_SIZE }));
    app.addHook("onReady", async () => {
      try {
        await warmDb(app.db, DEFAULT_POOL_SIZE);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        app.log.error(`[db.ts: dbPlugin] Database warm-up failed; the first requests will connect instead || ${message}`);
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[db.ts: dbPlugin] Failed to decorate Fastify with Drizzle || ${message}`);
  }
}

export default fp(dbPlugin, { name: "db" });
