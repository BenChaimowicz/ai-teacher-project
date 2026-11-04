import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyServerOptions } from "fastify";
import { LogController } from "fastify";
import fp from "fastify-plugin";
import { runInRequestContext, setContextLearner } from "../lib/usage-tracking.ts";

/**
 * The request id (ADR 0029, CONTEXT.md: Request id): every API request gets a fresh uuid as Fastify's `request.id`. It
 * is never taken from the caller. Pino lines carry it as `requestId`, the reply's `x-request-id` header echoes it, and
 * the tracking context carries it to the API Request row, the request's Log Entries, and any Generation job it queues.
 */

/** The reply header that carries the request id; the web app reads it off a failed reply. */
export const REQUEST_ID_HEADER = "x-request-id";

/** The Fastify options that make the request id: a fresh uuid, never the caller's, logged as `requestId`. */
export const REQUEST_ID_OPTIONS = {
  genReqId: () => randomUUID(),
  requestIdHeader: false,
  logController: new LogController({ requestIdLogLabel: "requestId" }),
} satisfies Pick<FastifyServerOptions, "genReqId" | "requestIdHeader" | "logController">;

/**
 * Sets the `x-request-id` header and runs the rest of each request inside the tracking context with its request id;
 * once the sign-in check has loaded the Learner, the context names them too. Register it before every other plugin,
 * so their hooks and every handler run inside the context.
 * @param app - Fastify app
 */
async function requestContextPlugin(app: FastifyInstance) {
  app.addHook("onRequest", (request, reply, done) => {
    try {
      reply.header(REQUEST_ID_HEADER, request.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.warn(`[request-context.ts: requestContextPlugin] Failed to set the request id header || url=${request.url} || ${message}`);
    }
    // The callback form: `done` runs the later hooks and the handler, so they inherit the context.
    runInRequestContext(request.id, done);
  });

  app.addHook("preHandler", (request, _reply, done) => {
    setContextLearner((request.currentLearner as { id?: string } | undefined)?.id ?? null);
    done();
  });
}

export default fp(requestContextPlugin, { name: "request-context" });
