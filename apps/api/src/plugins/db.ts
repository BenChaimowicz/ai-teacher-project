import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { createDb, type Database } from "@senoy/db";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

/**
 * Attaches a Drizzle client to the Fastify instance.
 * @param app - Fastify app
 */
async function dbPlugin(app: FastifyInstance) {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
    }
    app.decorate("db", createDb(url));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[db.ts: dbPlugin] Failed to decorate Fastify with Drizzle || ${message}`);
  }
}

export default fp(dbPlugin, { name: "db" });
