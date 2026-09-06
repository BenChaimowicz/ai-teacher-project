import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import cors from "@fastify/cors";

/**
 * Allows the Vite dev server to call the API.
 * @param app - Fastify app
 */
async function corsPlugin(app: FastifyInstance) {
  try {
    await app.register(cors, {
      origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[cors.ts: corsPlugin] Failed to register CORS || ${message}`);
  }
}

export default fp(corsPlugin, { name: "cors" });
