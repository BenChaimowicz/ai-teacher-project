import rateLimit, { normalizeIP } from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import type { learners } from "@senoy/db";
import { CLIENT_LOG_LIMITS } from "@senoy/db/logs";
import type { LogSink } from "@senoy/logging";
import { acceptClientLogBatch, createClientLogMinuteCap } from "@senoy/logging/client";

/** What the client-log route needs. */
export type ClientLogRouteOptions = {
  /** The API's one Log Entry sink, shared with its logger. */
  sink: LogSink;
  /** The current instant, injected for tests; defaults to the wall clock. */
  now?: () => Date;
};

/** A Learner row, as the current-Learner plugin attaches it. */
type Learner = typeof learners.$inferSelect;

/** Sent with a 415 when the body is not JSON; the web app never sends one. */
export const CLIENT_LOG_NOT_JSON_ERROR = "Send client logs as JSON.";

/**
 * True when the request says its body is JSON. Fastify also parses `text/plain`, which this route refuses.
 * @param contentType - The `Content-Type` header
 */
function isJson(contentType: string | undefined): boolean {
  return (contentType ?? "").split(";")[0]!.trim().toLowerCase() === "application/json";
}

/**
 * `POST /api/client-logs` (ADR 0029): the web app's browser errors and failed API calls, as a `ClientLogBatch`. Open
 * to signed-out browsers; the Learner is attached when the session is good (`OPTIONAL_SIGN_IN_PATHS`). Each event is
 * validated and capped, stored as component `web` with a level the server sets, and pushed to the sink. Answers 204
 * at once and never fails the caller: 413 over `CLIENT_LOG_LIMITS.maxBodyBytes`, 415 for a body that is not JSON, 429
 * over `apiBatchesPerIpPerMinute` batches from one IP. Past `apiEventsPerMinute` stored events a minute, across every
 * client, events are dropped, and at most one `warn` line a minute says how many.
 * @param app - Fastify app
 * @param options - The sink and the clock
 */
export async function clientLogRoutes(app: FastifyInstance, options: ClientLogRouteOptions) {
  const now = options.now ?? (() => new Date());
  const cap = createClientLogMinuteCap(CLIENT_LOG_LIMITS.apiEventsPerMinute);
  await app.register(rateLimit, { global: false });

  app.post(
    "/api/client-logs",
    {
      bodyLimit: CLIENT_LOG_LIMITS.maxBodyBytes,
      config: {
        rateLimit: {
          max: CLIENT_LOG_LIMITS.apiBatchesPerIpPerMinute,
          timeWindow: "1 minute",
          keyGenerator: (request) => `client-logs:ip:${normalizeIP(request.ip)}`,
        },
      },
    },
    async (request, reply) => {
      if (!isJson(request.headers["content-type"])) return reply.code(415).send({ error: CLIENT_LOG_NOT_JSON_ERROR });
      try {
        const at = now();
        const userAgent = request.headers["user-agent"];
        acceptClientLogBatch(request.body, {
          sink: options.sink,
          component: "web",
          now: at,
          learnerId: (request.currentLearner as Learner | undefined)?.id ?? null,
          userAgent: typeof userAgent === "string" ? userAgent : null,
          cap,
        });
        const dropped = cap.dropsToReport(at);
        if (dropped > 0) {
          request.log.warn(`[client-logs: POST /api/client-logs] Dropped ${dropped} web client log events || reason=over the per-minute cap`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        request.log.error(`[client-logs: POST /api/client-logs] Client log batch failed || ${message}`);
      }
      return reply.code(204).send();
    },
  );
}
