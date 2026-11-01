import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { recordApiRequest } from "../lib/usage-tracking.ts";

/** Why a request failed, by request: a thrown error's message, or the `error` text the route sent. */
const failures = new WeakMap<FastifyRequest, string>();

/**
 * True when the request is one of the platform's own `/api/*` hits worth recording. The Usage Console's own routes and
 * the health check are not.
 * @param url - Raw request URL
 */
export function isRecordedApiPath(url: string) {
  const path = url.split("?")[0] ?? "";
  if (!path.startsWith("/api/")) return false;
  return path !== "/api/health" && path !== "/api/ops" && !path.startsWith("/api/ops/");
}

/**
 * The URL to record: email-link landings carry a single-use sign-in token in their query, which is never stored.
 * @param url - Raw request URL
 */
export function recordedUrl(url: string) {
  const path = url.split("?")[0] ?? url;
  return path === "/api/auth/confirm" ? path : url;
}

/**
 * The `error` field of a JSON error body, if there is one.
 * @param payload - The serialized reply payload
 */
function errorText(payload: unknown): string | null {
  if (typeof payload !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    if (parsed && typeof parsed === "object" && "error" in parsed && typeof parsed.error === "string") return parsed.error;
  } catch {
    // Not JSON; nothing to keep.
  }
  return null;
}

/**
 * Records every finished `/api/*` request as an API Request (method, route pattern, URL, status, duration, Learner,
 * and error). Recording is fire-and-forget and never affects the reply; it is a no-op until usage tracking is installed.
 * @param app - Fastify app
 */
async function apiRequestsPlugin(app: FastifyInstance) {
  app.addHook("onError", async (request, _reply, error) => {
    if (isRecordedApiPath(request.url)) failures.set(request, error.message);
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (reply.statusCode >= 400 && !failures.has(request) && isRecordedApiPath(request.url)) {
      const text = errorText(payload);
      if (text) failures.set(request, text);
    }
    return payload;
  });

  app.addHook("onResponse", async (request, reply) => {
    try {
      if (!isRecordedApiPath(request.url)) return;
      void recordApiRequest({
        method: request.method,
        route: request.routeOptions.url ?? request.url.split("?")[0] ?? request.url,
        url: recordedUrl(request.url),
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        learnerId: (request.currentLearner as { id?: string } | undefined)?.id ?? null,
        error: failures.get(request) ?? null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(`[api-requests.ts: apiRequestsPlugin] Failed to record API Request || url=${recordedUrl(request.url)} || ${message}`);
    }
  });
}

export default fp(apiRequestsPlugin, { name: "api-requests" });
