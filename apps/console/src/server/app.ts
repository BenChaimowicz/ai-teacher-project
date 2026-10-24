import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { isOperator, OPERATOR_KEY_HEADER } from "./gate.ts";
import type { OpsStore } from "./ops-store.ts";
import {
  assertUuid,
  parseApiRequestQuery,
  parseCourseRequestQuery,
  parsePipelineEventQuery,
  parseProductEventQuery,
  parseRange,
  parseUsageRecordQuery,
  QueryError,
  type RawQuery,
} from "./query.ts";

/** How the Usage Console API is set up. */
export type ConsoleAppOptions = {
  /** When set, every `/api/ops/*` route except health needs this in `x-operator-key`. Unset = open (local dev). */
  operatorKey?: string;
  /** Whether Fastify logs (Pino); tests leave it off. */
  logger?: boolean;
  /** The current instant, injected for tests; defaults to the wall clock. */
  now?: () => Date;
};

/** A route's work: returns the body, or null for "not found". */
type RouteWork<T> = () => Promise<T | null>;

/**
 * Runs one route's work and answers: 400 for a bad query, 404 when the work found nothing, 500 (logged, details
 * kept server-side) when it threw.
 * @param request - The Fastify request (for its logger and URL)
 * @param reply - The Fastify reply
 * @param where - `GET /path` label for logs
 * @param work - Parses the query and reads the store
 * @param notFound - Message for a null result
 * @returns The reply
 */
async function answer<T>(
  request: FastifyRequest,
  reply: FastifyReply,
  where: string,
  work: RouteWork<T>,
  notFound = "Not found",
) {
  try {
    const body = await work();
    if (body === null) return reply.code(404).send({ error: notFound });
    return reply.send(body);
  } catch (error) {
    if (error instanceof QueryError) return reply.code(400).send({ error: error.message });
    const message = error instanceof Error ? error.message : String(error);
    request.log.error(`[app.ts: ${where}] Usage Console route failed || url=${request.url} || ${message}`);
    return reply.code(500).send({ error: "The Usage Console could not load this. Check the server log." });
  }
}

/**
 * Reads the `:id` path parameter and checks it is a UUID.
 * @param request - The Fastify request
 * @returns The id
 * @throws QueryError when it is not a UUID
 */
function idParam(request: FastifyRequest): string {
  const { id } = request.params as { id?: string };
  return assertUuid(id ?? "", "id");
}

/**
 * Builds the Usage Console API: `GET /api/ops/health` plus the Operator-gated `/api/ops/*` read routes.
 * @param store - Where the routes read from (the real database, or a fake in tests)
 * @param options - Operator key, logger, clock
 * @returns The Fastify app, not yet listening
 */
export function buildConsoleApp(store: OpsStore, options: ConsoleAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const operatorKey = options.operatorKey || undefined;
  const now = options.now ?? (() => new Date());
  const query = (request: FastifyRequest) => (request.query ?? {}) as RawQuery;

  app.get("/api/ops/health", async () => ({ ok: true, gated: operatorKey !== undefined }));

  app.register(
    async (ops) => {
      ops.addHook("onRequest", async (request, reply) => {
        if (!isOperator(request.headers[OPERATOR_KEY_HEADER], operatorKey)) {
          return reply.code(401).send({ error: "Operator key missing or wrong" });
        }
      });

      ops.get("/summary", (request, reply) =>
        answer(request, reply, "GET /summary", () => store.summary(parseRange(query(request), now()))));

      ops.get("/usage-records", (request, reply) =>
        answer(request, reply, "GET /usage-records", () =>
          store.listUsageRecords(parseUsageRecordQuery(query(request), now()))));

      ops.get("/usage-records/:id", (request, reply) =>
        answer(request, reply, "GET /usage-records/:id", () => store.getUsageRecord(idParam(request)),
          "Usage Record not found"));

      ops.get("/pipeline-events", (request, reply) =>
        answer(request, reply, "GET /pipeline-events", () =>
          store.listPipelineEvents(parsePipelineEventQuery(query(request), now()))));

      ops.get("/pipeline-events/:id", (request, reply) =>
        answer(request, reply, "GET /pipeline-events/:id", () => store.getPipelineEvent(idParam(request)),
          "Pipeline Event not found"));

      ops.get("/course-requests", (request, reply) =>
        answer(request, reply, "GET /course-requests", () =>
          store.listCourseRequests(parseCourseRequestQuery(query(request), now()))));

      ops.get("/course-requests/:id", (request, reply) =>
        answer(request, reply, "GET /course-requests/:id", () => store.getCourseRequest(idParam(request)),
          "Course Request not found"));

      ops.get("/failures", (request, reply) =>
        answer(request, reply, "GET /failures", () => store.listFailures(parseRange(query(request), now()))));

      ops.get("/product-events", (request, reply) =>
        answer(request, reply, "GET /product-events", () =>
          store.listProductEvents(parseProductEventQuery(query(request), now()))));

      ops.get("/api-requests", (request, reply) =>
        answer(request, reply, "GET /api-requests", () =>
          store.listApiRequests(parseApiRequestQuery(query(request), now()))));

      ops.get("/api-routes", (request, reply) =>
        answer(request, reply, "GET /api-routes", () => store.listApiRoutes(parseRange(query(request), now()))));
    },
    { prefix: "/api/ops" },
  );

  return app;
}
