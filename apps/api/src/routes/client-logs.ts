import type { FastifyInstance } from "fastify";
import { CLIENT_LOG_LIMITS } from "@senoy/db/logs";
import type { LogSink } from "@senoy/logging";

/** What the client-log route needs. */
export type ClientLogRouteOptions = {
  /** The API's one Log Entry sink, shared with its logger. */
  sink: LogSink;
  /** The current instant, injected for tests; defaults to the wall clock. */
  now?: () => Date;
};

/**
 * `POST /api/client-logs` (ADR 0029): the web app's browser errors and failed API calls, as a `ClientLogBatch`. Open
 * to signed-out browsers; the Learner is attached when the session is good (`OPTIONAL_SIGN_IN_PATHS`). Each event is
 * validated and capped, stored as component `web` with a level the server sets, and pushed to the sink. Answers 204
 * at once and never fails the caller: 413 over `CLIENT_LOG_LIMITS.maxBodyBytes`, 429 over the per-IP batch limit.
 * @param app - Fastify app
 * @param options - The sink and the clock
 */
export async function clientLogRoutes(app: FastifyInstance, options: ClientLogRouteOptions) {
  // Stub (SEN-116): job 03 validates, caps, rate-limits, and pushes each event to `options.sink`.
  void options;
  app.post("/api/client-logs", { bodyLimit: CLIENT_LOG_LIMITS.maxBodyBytes }, async (_request, reply) => reply.code(204).send());
}
