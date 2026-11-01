import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

/** Options for the same-origin plugin. */
export type SameOriginOptions = {
  /** `APP_URL`, when set: one more origin the app is served from, allowed beside the request's own. */
  appUrl?: string;
};

/** Sent when a request that changes data came from another site. */
export const CROSS_SITE_ERROR = "This request came from another site, so it was refused.";

/** Methods that never change data, so a cross-site request using one is harmless. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * The origin of a URL in its standard form (default ports dropped), or null when it is not a URL.
 * @param url - A URL or origin
 */
function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * True when the request's browser headers say it came from another site.
 * @param request - Incoming request
 * @param allowed - The origins the app is served from
 */
function isCrossSite(request: FastifyRequest, allowed: Set<string>) {
  // The browser sets Sec-Fetch-Site from the page the user is on, and scripts can't change it. Trust it when present:
  // behind a proxy (Vite in dev, a host's edge later) Origin names the page while Host names the API, so they differ.
  const fetchSite = request.headers["sec-fetch-site"];
  if (fetchSite !== undefined) return fetchSite === "cross-site";
  const origin = request.headers.origin;
  if (origin === undefined) return false;
  const own = originOf(`${request.protocol}://${request.host}`);
  const normalized = originOf(origin);
  return normalized === null || (normalized !== own && !allowed.has(normalized));
}

/**
 * Refuses with 403 any `/api/*` request that could change data (not GET, HEAD or OPTIONS) when its `Origin` is
 * another site or its `Sec-Fetch-Site` says `cross-site` (ADR 0027). With `SameSite=Lax` cookies, this closes CSRF
 * without a token. A request with neither header passes: every browser we support sends at least one of them on such
 * a request, and only a browser can carry a Learner's cookies, so a header-less caller (curl, a server) can only use
 * a session it already holds.
 * @param app - Fastify app
 * @param options - Extra allowed origin
 */
async function sameOriginPlugin(app: FastifyInstance, options: SameOriginOptions) {
  const appOrigin = options.appUrl?.trim() ? originOf(options.appUrl.trim()) : null;
  const allowed = new Set(appOrigin ? [appOrigin] : []);

  app.addHook("onRequest", async (request, reply) => {
    if (SAFE_METHODS.has(request.method)) return;
    if (!request.url.startsWith("/api/")) return;
    if (!isCrossSite(request, allowed)) return;
    request.log.warn(
      `[same-origin.ts: sameOriginPlugin] Refused a cross-site request || url=${request.url} || origin=${request.headers.origin ?? "none"} || secFetchSite=${request.headers["sec-fetch-site"] ?? "none"}`,
    );
    return reply.code(403).send({ error: CROSS_SITE_ERROR });
  });
}

export default fp(sameOriginPlugin, { name: "same-origin" });
