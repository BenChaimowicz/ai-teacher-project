import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import type { BillingService } from "./billing.ts";
import type { DecisionsReader } from "./decisions.ts";
import type { OpsStore } from "./ops-store.ts";
import type { OpenRouterHistoryReader } from "./openrouter-history.ts";
import type { SetupReader } from "./setup.ts";
import { isSetupChecklistItem, type SetupChecklistService } from "./setup-checklist.ts";
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
  /** Reads the configured models and research vendors; without it `/setup` answers 404. */
  setup?: SetupReader;
  /** OpenRouter's imported history for our key; without it `/openrouter-history` answers 404. */
  openrouterHistory?: OpenRouterHistoryReader;
  /** The billing check; without it `/billing` answers 404. */
  billing?: BillingService;
  /** The team's decision log on disk; without it `/decisions` answers 404. */
  decisions?: DecisionsReader;
  /** The founders' shared setup checklist; without it `/setup-checklist` answers 404. */
  setupChecklist?: SetupChecklistService;
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

/** Host names a request to this console may carry; anything else is a page on another site reaching us (DNS rebinding). */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Refuses a checklist write that did not come from this machine's console screen, so the only people who can tick
 * items are those running the console in their own checkout. Answers 403 for a non-loopback Host or a checkout with no
 * `git config user.name`, and 415 for a body that is not JSON (which a browser cannot send cross-site without a
 * CORS preflight this API never grants).
 * @param request - The Fastify request
 * @param reply - The Fastify reply
 * @param operator - Who this console ticks items as, or null
 * @returns The reply when refused, else null
 */
function refuseChecklistWrite(request: FastifyRequest, reply: FastifyReply, operator: string | null) {
  const host = (request.headers.host ?? "").replace(/:\d+$/, "").toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) return reply.code(403).send({ error: "The setup checklist only takes changes from this machine." });
  if (!(request.headers["content-type"] ?? "").startsWith("application/json")) {
    return reply.code(415).send({ error: "Send the change as JSON." });
  }
  if (!operator) {
    return reply.code(403).send({ error: "Set your name with `git config user.name` to tick items, then restart the console." });
  }
  return null;
}

/**
 * Builds the Usage Console API: `GET /api/ops/health` plus the `/api/ops/*` read routes. There is no key; the server
 * listens on localhost only.
 * @param store - Where the routes read from (the real database, or a fake in tests)
 * @param options - Logger, clock
 * @returns The Fastify app, not yet listening
 */
export function buildConsoleApp(store: OpsStore, options: ConsoleAppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false });
  const now = options.now ?? (() => new Date());
  const query = (request: FastifyRequest) => (request.query ?? {}) as RawQuery;

  app.get("/api/ops/health", async () => ({ ok: true }));

  app.register(
    async (ops) => {
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

      ops.get("/setup", (request, reply) =>
        answer(request, reply, "GET /setup", async () => (options.setup ? options.setup() : null), "Setup is not available"));

      ops.get("/decisions", (request, reply) =>
        answer(request, reply, "GET /decisions", async () => (options.decisions ? options.decisions() : null),
          "The decision log is not available"));

      ops.get("/setup-checklist", (request, reply) =>
        answer(request, reply, "GET /setup-checklist", async () => (options.setupChecklist ? options.setupChecklist.read() : null),
          "The setup checklist is not available"));

      ops.put("/setup-checklist/items/:key", async (request, reply) => {
        const checklist = options.setupChecklist;
        if (!checklist) return reply.code(404).send({ error: "The setup checklist is not available" });
        const refused = refuseChecklistWrite(request, reply, checklist.operator);
        if (refused) return refused;
        const { key } = request.params as { key: string };
        if (!isSetupChecklistItem(key)) return reply.code(404).send({ error: "No such checklist item" });
        const done = (request.body as { done?: unknown } | null)?.done;
        if (typeof done !== "boolean") return reply.code(400).send({ error: "Body must be { \"done\": true | false }" });
        return answer(request, reply, "PUT /setup-checklist/items/:key", () => checklist.setDone(key, done));
      });

      ops.get("/openrouter-history", (request, reply) =>
        answer(request, reply, "GET /openrouter-history", async () => (options.openrouterHistory ? options.openrouterHistory() : null),
          "OpenRouter history is not available"));

      ops.get("/billing", (request, reply) =>
        answer(request, reply, "GET /billing", async () => {
          const range = parseRange(query(request), now());
          return options.billing ? options.billing.billing(range) : null;
        }, "Billing check is not available"));

      ops.post("/billing/refresh", (request, reply) =>
        answer(request, reply, "POST /billing/refresh", async () => {
          const range = parseRange(query(request), now());
          return options.billing ? options.billing.refresh(range) : null;
        }, "Billing check is not available"));
    },
    { prefix: "/api/ops" },
  );

  return app;
}
