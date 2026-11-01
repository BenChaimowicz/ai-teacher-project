import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { eq } from "drizzle-orm";
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import { learners } from "@senoy/db";
import { randomDisplayName } from "@senoy/db/learner-name";
import { clearSessionCookies, readSessionCookies, setSessionCookies } from "../lib/session-cookies.ts";
import { AuthServiceError, type SessionTokens } from "../lib/supabase-auth.ts";

/** A Learner row as stored in Postgres. */
type Learner = typeof learners.$inferSelect;

/** Who a valid access token says is signed in: the Supabase user id, and their email when the token carries one. */
export type VerifiedToken = { sub: string; email?: string };

/**
 * Checks an access token. Resolves with its user, or throws when the token is missing a part, forged, or expired. A
 * check that could not run at all (the signing keys could not be fetched) throws {@link TokenCheckUnavailableError}.
 */
export type TokenVerifier = (token: string) => Promise<VerifiedToken>;

/**
 * Trades a refresh token for a new session. Throws {@link AuthServiceError} when Supabase refuses it, or when Supabase
 * could not be reached (`unavailable`).
 */
export type SessionRefresher = (refreshToken: string) => Promise<SessionTokens>;

/** Options for the current-Learner plugin. */
export type CurrentLearnerOptions = {
  /** Checks each request's access token; the server passes {@link supabaseTokenVerifier}, tests a stand-in. */
  verifyToken: TokenVerifier;
  /** Refreshes an expired session; the server passes the Supabase auth service's `refresh`, tests a stand-in. */
  refreshSession: SessionRefresher;
};

/** The token check could not run, so the token is neither valid nor invalid: answered 503, not 401. */
export class TokenCheckUnavailableError extends Error {}

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in Learner; set on every `/api/*` request but `/api/health`. */
    currentLearner: Learner;
    /** The Supabase user the access token names; set alongside `currentLearner`. */
    authUser: VerifiedToken;
    /** The session the request was checked with, after any refresh; set alongside `currentLearner`. */
    authTokens: { accessToken: string; refreshToken: string | null };
  }
}

/** Sent for a missing, invalid, or expired token; the web app sends the person to sign-in. */
export const SIGN_IN_ERROR = "Sign in to continue.";

/** A Supabase user id: a UUID, as `learners.auth_user_id` stores it. */
const USER_ID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

/** jose failures that mean the signing keys could not be read, not that the token is bad. */
const UNAVAILABLE_CODES = new Set([joseErrors.JWKSTimeout.code, joseErrors.JWKSInvalid.code]);

/**
 * The token checker for a Supabase project (ADR 0026): ES256 against the project's public keys, its issuer, audience
 * `authenticated`, and the expiry. jose caches the keys, so a check makes no network call once they are loaded.
 * @param supabaseUrl - `SUPABASE_URL`, such as `https://abc.supabase.co`
 * @throws Error at startup when `supabaseUrl` is missing or not a URL
 */
export function supabaseTokenVerifier(supabaseUrl: string | undefined): TokenVerifier {
  if (!supabaseUrl?.trim()) {
    throw new Error("[current-learner.ts: supabaseTokenVerifier] SUPABASE_URL is not set || Set it in the root .env (see .env.example)");
  }
  let base: string;
  let keys: ReturnType<typeof createRemoteJWKSet>;
  try {
    base = supabaseUrl.trim().replace(/\/+$/, "");
    keys = createRemoteJWKSet(new URL(`${base}/auth/v1/.well-known/jwks.json`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[current-learner.ts: supabaseTokenVerifier] SUPABASE_URL is not a URL || supabaseUrl=${supabaseUrl} || ${message}`);
  }
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: `${base}/auth/v1`,
        audience: "authenticated",
        algorithms: ["ES256"],
      });
      if (typeof payload.sub !== "string") throw new joseErrors.JWTClaimValidationFailed('missing "sub" claim', payload, "sub", "missing");
      // Anonymous sign-ins are off; if they are ever turned on, an anonymous user still is not a Learner.
      if (payload.is_anonymous === true) throw new joseErrors.JWTClaimValidationFailed("anonymous user", payload, "is_anonymous", "check_failed");
      return { sub: payload.sub, ...(typeof payload.email === "string" && payload.email ? { email: payload.email } : {}) };
    } catch (error) {
      // A JOSE error is about the token, except the two that say the keys could not be read; anything else (a failed
      // fetch of the keys) means the check could not run.
      if (error instanceof joseErrors.JOSEError && !UNAVAILABLE_CODES.has(error.code)) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new TokenCheckUnavailableError(`[current-learner.ts: supabaseTokenVerifier] Could not read the signing keys || url=${base} || ${message}`);
    }
  };
}

/**
 * True when the request needs `currentLearner` (Learner-owned API routes). A CORS preflight never carries the session.
 * The sign-in routes are open (ADR 0027), except changing the password.
 * @param request - Incoming request
 */
function needsLearner(request: FastifyRequest) {
  if (request.method === "OPTIONS") return false;
  const path = request.url.split("?")[0] ?? "";
  if (!path.startsWith("/api/")) return false;
  if (path === "/api/health") return false;
  if (path.startsWith("/api/auth/") && path !== "/api/auth/password") return false;
  return true;
}

/** Sent when the sign-in check or the refresh could not reach Supabase; the session may still be good. */
const CHECK_UNAVAILABLE_ERROR = "We couldn't check your sign-in. Try again.";

/**
 * Checks the `kn_at` cookie on every Learner-owned `/api/*` request and loads its Learner onto the request, creating
 * the Learner on the user's first call (ADR 0026). An expired or refused access token is refreshed with `kn_rt`, both
 * cookies are set again, and the request carries on (ADR 0027).
 * @param app - Fastify app
 * @param options - The token checker and the session refresher
 */
async function currentLearnerPlugin(app: FastifyInstance, options: CurrentLearnerOptions) {
  const { verifyToken, refreshSession } = options;

  /**
   * The user an access token names, checked to be a Supabase user id.
   * @param token - The access token
   */
  async function check(token: string) {
    const user = await verifyToken(token);
    if (!USER_ID.test(user.sub)) throw new Error(`The token's subject is not a user id || sub=${user.sub}`);
    return user;
  }

  /**
   * The Learner for a Supabase user. The common case is one read; a first call inserts (doing nothing if a concurrent
   * first call won) and reads again only when it lost, so two first calls at once still make one Learner.
   * @param authUserId - The token's `sub`
   */
  async function learnerFor(authUserId: string) {
    const [found] = await app.db.select().from(learners).where(eq(learners.authUserId, authUserId)).limit(1);
    if (found) return found;
    const [created] = await app.db.insert(learners).values({ authUserId, displayName: randomDisplayName() })
      .onConflictDoNothing({ target: learners.authUserId }).returning();
    if (created) return created;
    const [raced] = await app.db.select().from(learners).where(eq(learners.authUserId, authUserId)).limit(1);
    if (!raced) throw new Error("The Learner was neither created nor found.");
    return raced;
  }

  app.addHook("onRequest", async (request, reply) => {
    if (!needsLearner(request)) return;
    const cookies = readSessionCookies(request);
    if (!cookies.accessToken && !cookies.refreshToken) return reply.code(401).send({ error: SIGN_IN_ERROR });
    let tokens = cookies;
    let user: VerifiedToken;
    try {
      if (!cookies.accessToken) throw new Error("No access token cookie");
      user = await check(cookies.accessToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof TokenCheckUnavailableError) {
        request.log.error(`[current-learner.ts: currentLearnerPlugin] Could not check a sign-in token || url=${request.url} || ${message}`);
        return reply.code(503).send({ error: CHECK_UNAVAILABLE_ERROR });
      }
      if (!cookies.refreshToken) {
        request.log.info(`[current-learner.ts: currentLearnerPlugin] Refused a sign-in token || url=${request.url} || ${message}`);
        clearSessionCookies(request, reply);
        return reply.code(401).send({ error: SIGN_IN_ERROR });
      }
      // Most often the access token simply expired (after an hour): refresh it, out of the Learner's sight.
      try {
        const session = await refreshSession(cookies.refreshToken);
        user = await check(session.accessToken);
        setSessionCookies(request, reply, session);
        tokens = session;
      } catch (refreshError) {
        const refreshMessage = refreshError instanceof Error ? refreshError.message : String(refreshError);
        // Supabase being unreachable says nothing about the session, so the cookies stay and the Learner can retry.
        if (refreshError instanceof TokenCheckUnavailableError || (refreshError instanceof AuthServiceError && refreshError.unavailable)) {
          request.log.error(`[current-learner.ts: currentLearnerPlugin] Could not refresh a session || url=${request.url} || ${refreshMessage}`);
          return reply.code(503).send({ error: CHECK_UNAVAILABLE_ERROR });
        }
        request.log.info(`[current-learner.ts: currentLearnerPlugin] Refused a session refresh || url=${request.url} || ${refreshMessage}`);
        clearSessionCookies(request, reply);
        return reply.code(401).send({ error: SIGN_IN_ERROR });
      }
    }
    try {
      request.authUser = user;
      request.authTokens = { accessToken: tokens.accessToken!, refreshToken: tokens.refreshToken };
      request.currentLearner = await learnerFor(user.sub);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.error(
        `[current-learner.ts: currentLearnerPlugin] Failed to load current Learner || authUserId=${user.sub} || url=${request.url} || ${message}`,
      );
      return reply.code(500).send({ error: "Failed to load current Learner." });
    }
  });
}

export default fp(currentLearnerPlugin, { name: "current-learner", dependencies: ["db", "@fastify/cookie"] });
