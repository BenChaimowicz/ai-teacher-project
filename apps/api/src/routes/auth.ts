import rateLimit, { normalizeIP } from "@fastify/rate-limit";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { clearSessionCookies, readSessionCookies, setSessionCookies } from "../lib/session-cookies.ts";
import { SIGN_IN_ERROR } from "../plugins/current-learner.ts";
import { AuthServiceError, LINK_TYPES, type AuthService, type LinkType, type SignOutScope } from "../lib/supabase-auth.ts";

/** Options for the auth routes. */
export type AuthRoutesOptions = {
  /** Supabase Auth; the server passes `supabaseAuthService`, tests a stand-in. */
  auth: AuthService;
};

/** A limit: at most `max` requests per `timeWindow` milliseconds. */
type Limit = { max: number; timeWindow: number };

/** The limits one route applies, per client IP and per email address. */
type RouteLimits = { perIp: Limit; perEmail: Limit };

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/*
 * Rate limits (ADR 0027), picked on purpose: Supabase now sees every sign-in from the API's one address, so these are
 * the limits that protect a Learner's password and inbox. Each route counts on its own. A request counts against its
 * client IP and, when it names one, the lowercased email; going over either answers 429. Supabase's own project-wide
 * limits are raised in `auth/settings.json` so they never bind first.
 */

/** Routes that check a credential (sign-in, code verify): 10 per 15 min per IP, 5 per 15 min per email. */
const CREDENTIAL_LIMITS: RouteLimits = {
  perIp: { max: 10, timeWindow: 15 * MINUTE_MS },
  perEmail: { max: 5, timeWindow: 15 * MINUTE_MS },
};

/** Routes that send an email (sign-up, resend, code, forgot): 20 per hour per IP, 5 per hour per email. */
const EMAIL_LIMITS: RouteLimits = {
  perIp: { max: 20, timeWindow: HOUR_MS },
  perEmail: { max: 5, timeWindow: HOUR_MS },
};

/** Sent with a 429. */
export const TOO_MANY_TRIES_ERROR = "Too many tries. Wait a few minutes and try again.";

/** Sent when an email is missing or not shaped like one. */
export const EMAIL_ERROR = "Enter a valid email address.";

/** Sent for a wrong email or password. */
export const WRONG_PASSWORD_ERROR = "That email and password don't match.";

/** Sent with `code: "email_not_confirmed"` when the password is right but the email was never confirmed. */
export const NOT_CONFIRMED_ERROR = "Confirm your email first. We can send the link again.";

/** Sent for a wrong or expired 6-digit code. */
export const WRONG_CODE_ERROR = "That code is wrong or has expired.";

/** Sent when Supabase refuses a password as too weak; the rule is the one set in `auth/settings.json`. */
export const WEAK_PASSWORD_ERROR = "Use at least 8 characters, with a letter and a digit.";

/** Sent when the new password is the current one. */
export const SAME_PASSWORD_ERROR = "That's already your password. Pick a new one.";

/** Sent when Supabase could not be reached or failed. */
export const AUTH_UNAVAILABLE_ERROR = "Sign-in isn't answering right now. Try again in a moment.";

/** Where a bad, used, or expired email link lands. */
export const EXPIRED_LINK_PATH = "/sign-in?link=expired";

/** Loose email shape: something, `@`, something, no spaces. Supabase checks it properly. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

/**
 * A string field of a JSON body, or null.
 * @param body - The parsed body
 * @param name - The field
 */
function field(body: unknown, name: string) {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[name];
  return typeof value === "string" ? value : null;
}

/**
 * The body's `email`, trimmed, or null when it is missing or not shaped like an email.
 * @param body - The parsed body
 */
function emailOf(body: unknown) {
  const email = field(body, "email")?.trim();
  return email && email.length <= 320 && EMAIL_SHAPE.test(email) ? email : null;
}

/**
 * `next` from an email link when it is a path on this site, else `/`. It must start with exactly one `/`: `//host`
 * and `/\host` are other sites to a browser, and anything with a scheme is an absolute URL.
 * @param next - The raw query value
 */
export function safeNextPath(next: unknown) {
  if (typeof next !== "string" || !/^\/(?![/\\])/.test(next) || /[\u0000-\u001f\\]/.test(next)) return "/";
  try {
    const base = "http://knibbler.invalid";
    const url = new URL(next, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : "/";
  } catch {
    return "/";
  }
}

/**
 * The request's own origin, which email links point back to, so dev, e2e and production each get links to themselves.
 * @param request - Incoming request
 */
function ownOrigin(request: FastifyRequest) {
  // `URL` drops a default port (`:80`, `:443`) the Host header may carry, as browsers do in `Origin`.
  return new URL(`${request.protocol}://${request.host}`).origin;
}

/**
 * Answers a failed Supabase call whose route must not say whether the email exists: Supabase being down or a rate
 * limit gets an error, anything else the same 204 as success.
 * @param request - The request
 * @param reply - The reply
 * @param error - What the call threw
 */
function neutralReply(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof AuthServiceError && isRateLimited(error)) {
    request.log.warn(`[auth.ts: neutralReply] Supabase rate-limited an auth email || url=${request.url} || ${message}`);
    return reply.code(429).send({ error: TOO_MANY_TRIES_ERROR });
  }
  if (!(error instanceof AuthServiceError) || error.unavailable) {
    request.log.error(`[auth.ts: neutralReply] Supabase Auth failed || url=${request.url} || ${message}`);
    return reply.code(503).send({ error: AUTH_UNAVAILABLE_ERROR });
  }
  request.log.info(`[auth.ts: neutralReply] Supabase Auth refused; answering neutrally || url=${request.url} || ${message}`);
  return reply.code(204).send();
}

/**
 * True when Supabase answered with one of its rate-limit errors.
 * @param error - The failure
 */
function isRateLimited(error: AuthServiceError) {
  return error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit";
}

/**
 * Answers a failed Supabase call with the error copy the web app shows, falling back to `fallback` for a refusal no
 * case covers.
 * @param request - The request
 * @param reply - The reply
 * @param error - What the call threw
 * @param fallback - Status and copy for an unexpected refusal
 */
function failureReply(request: FastifyRequest, reply: FastifyReply, error: unknown, fallback: { status: number; error: string }) {
  const message = error instanceof Error ? error.message : String(error);
  if (!(error instanceof AuthServiceError) || error.unavailable) {
    request.log.error(`[auth.ts: failureReply] Supabase Auth failed || url=${request.url} || ${message}`);
    return reply.code(503).send({ error: AUTH_UNAVAILABLE_ERROR });
  }
  request.log.info(`[auth.ts: failureReply] Supabase Auth refused || url=${request.url} || ${message}`);
  if (isRateLimited(error)) return reply.code(429).send({ error: TOO_MANY_TRIES_ERROR });
  if (error.code === "weak_password") return reply.code(400).send({ error: WEAK_PASSWORD_ERROR });
  if (error.code === "same_password") return reply.code(400).send({ error: SAME_PASSWORD_ERROR });
  if (error.code === "email_address_invalid") return reply.code(400).send({ error: EMAIL_ERROR });
  return reply.code(fallback.status).send({ error: fallback.error });
}

/**
 * The sign-in routes (ADR 0027): the API talks to Supabase Auth and keeps the session in the `kn_at` and `kn_rt`
 * cookies. Every route is open except `POST /api/auth/password`, which the current-Learner hook guards.
 * @param app - Fastify app
 * @param options - The Supabase Auth service
 */
export async function authRoutes(app: FastifyInstance, options: AuthRoutesOptions) {
  const { auth } = options;
  // Registered inside this plugin, so it is scoped to these routes: nothing else in the API is limited.
  await app.register(rateLimit, { global: false });

  /**
   * A preHandler that counts the request against its route's per-IP and per-email limits and answers 429 when either
   * is over. Both counters move on every request, so a refused one still counts.
   * @param name - The route, so each route counts on its own
   * @param limits - The route's limits
   */
  function limited(name: string, limits: RouteLimits) {
    // `request.ip` is the proxy's address unless Fastify's `trustProxy` is on (SEN-106).
    const byIp = app.createRateLimit({ ...limits.perIp, keyGenerator: (request) => `${name}:ip:${normalizeIP(request.ip)}` });
    const byEmail = app.createRateLimit({
      ...limits.perEmail,
      keyGenerator: (request) => `${name}:email:${emailOf(request.body)?.toLowerCase() ?? ""}`,
    });
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const results = [await byIp(request)];
      if (emailOf(request.body)) results.push(await byEmail(request));
      const over = results.filter((result) => !result.isAllowed && result.isExceeded);
      if (over.length === 0) return;
      const wait = Math.max(...over.map((result) => (result.isAllowed ? 0 : result.ttlInSeconds)));
      request.log.warn(`[auth.ts: limited] Rate-limited an auth request || route=${name} || retryAfterS=${wait}`);
      return reply.code(429).header("retry-after", wait).send({ error: TOO_MANY_TRIES_ERROR });
    };
  }

  app.post("/api/auth/sign-up", { preHandler: limited("sign-up", EMAIL_LIMITS) }, async (request, reply) => {
    const email = emailOf(request.body);
    const password = field(request.body, "password");
    if (!email) return reply.code(400).send({ error: EMAIL_ERROR });
    if (!password) return reply.code(400).send({ error: WEAK_PASSWORD_ERROR });
    try {
      await auth.signUp(email, password, `${ownOrigin(request)}/api/auth/confirm?next=/`);
      return reply.code(204).send();
    } catch (error) {
      // A weak password says nothing about the email; everything else stays neutral.
      if (error instanceof AuthServiceError && error.code === "weak_password") {
        return reply.code(400).send({ error: WEAK_PASSWORD_ERROR });
      }
      return neutralReply(request, reply, error);
    }
  });

  app.post("/api/auth/resend", { preHandler: limited("resend", EMAIL_LIMITS) }, async (request, reply) => {
    const email = emailOf(request.body);
    if (!email) return reply.code(400).send({ error: EMAIL_ERROR });
    try {
      await auth.resendConfirmation(email, `${ownOrigin(request)}/api/auth/confirm?next=/`);
      return reply.code(204).send();
    } catch (error) {
      return neutralReply(request, reply, error);
    }
  });

  app.post("/api/auth/sign-in", { preHandler: limited("sign-in", CREDENTIAL_LIMITS) }, async (request, reply) => {
    const email = emailOf(request.body);
    const password = field(request.body, "password");
    if (!email || !password) return reply.code(401).send({ error: WRONG_PASSWORD_ERROR });
    try {
      setSessionCookies(request, reply, await auth.signIn(email, password));
      return reply.code(204).send();
    } catch (error) {
      if (error instanceof AuthServiceError && error.code === "email_not_confirmed") {
        return reply.code(403).send({ error: NOT_CONFIRMED_ERROR, code: "email_not_confirmed" });
      }
      return failureReply(request, reply, error, { status: 401, error: WRONG_PASSWORD_ERROR });
    }
  });

  app.post("/api/auth/code", { preHandler: limited("code", EMAIL_LIMITS) }, async (request, reply) => {
    const email = emailOf(request.body);
    if (!email) return reply.code(400).send({ error: EMAIL_ERROR });
    try {
      await auth.sendCode(email);
      return reply.code(204).send();
    } catch (error) {
      // An email with no account is refused here (no user is ever created), and must look like success.
      return neutralReply(request, reply, error);
    }
  });

  app.post("/api/auth/code/verify", { preHandler: limited("code-verify", CREDENTIAL_LIMITS) }, async (request, reply) => {
    const email = emailOf(request.body);
    const code = field(request.body, "code")?.trim();
    if (!email || !code) return reply.code(401).send({ error: WRONG_CODE_ERROR });
    try {
      setSessionCookies(request, reply, await auth.verifyCode(email, code));
      return reply.code(204).send();
    } catch (error) {
      return failureReply(request, reply, error, { status: 401, error: WRONG_CODE_ERROR });
    }
  });

  app.post("/api/auth/forgot", { preHandler: limited("forgot", EMAIL_LIMITS) }, async (request, reply) => {
    const email = emailOf(request.body);
    if (!email) return reply.code(400).send({ error: EMAIL_ERROR });
    try {
      await auth.sendPasswordReset(email, `${ownOrigin(request)}/api/auth/confirm?next=/reset-password`);
      return reply.code(204).send();
    } catch (error) {
      return neutralReply(request, reply, error);
    }
  });

  app.get("/api/auth/confirm", async (request, reply) => {
    const query = (request.query ?? {}) as Record<string, unknown>;
    const tokenHash = typeof query.token_hash === "string" ? query.token_hash : "";
    const type = LINK_TYPES.find((linkType) => linkType === query.type);
    const next = safeNextPath(query.next);
    if (!tokenHash || !type) return reply.redirect(EXPIRED_LINK_PATH, 303);
    try {
      setSessionCookies(request, reply, await auth.verifyLink(tokenHash, type satisfies LinkType));
      return reply.redirect(next, 303);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      request.log.info(`[auth.ts: authRoutes] Refused an email link || type=${type} || ${message}`);
      return reply.redirect(EXPIRED_LINK_PATH, 303);
    }
  });

  app.post("/api/auth/password", async (request, reply) => {
    const password = field(request.body, "password");
    if (!password) return reply.code(400).send({ error: WEAK_PASSWORD_ERROR });
    const { accessToken, refreshToken } = request.authTokens;
    if (!refreshToken) return reply.code(401).send({ error: SIGN_IN_ERROR });
    try {
      await auth.changePassword({ accessToken, refreshToken }, password);
      return reply.code(204).send();
    } catch (error) {
      return failureReply(request, reply, error, { status: 400, error: "Couldn't change your password. Try again." });
    }
  });

  app.post("/api/auth/sign-out", async (request, reply) => {
    const scopeField = field(request.body, "scope") ?? "local";
    if (scopeField !== "local" && scopeField !== "global") {
      return reply.code(400).send({ error: 'Say "local" or "global".' });
    }
    const scope: SignOutScope = scopeField;
    const { accessToken, refreshToken } = readSessionCookies(request);
    if (accessToken && refreshToken) {
      try {
        await auth.signOut({ accessToken, refreshToken }, scope);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Signing out everywhere must not look done when it wasn't: keep this session so the Learner can try again.
        if (scope === "global") {
          request.log.error(`[auth.ts: authRoutes] Failed to sign out everywhere || ${message}`);
          return reply.code(503).send({ error: "Couldn't sign you out everywhere. Try again." });
        }
        // Here only: the cookies go anyway, and the access token runs out within the hour.
        request.log.warn(`[auth.ts: authRoutes] Failed to revoke a session at Supabase; clearing it here || ${message}`);
      }
    }
    clearSessionCookies(request, reply);
    return reply.code(204).send();
  });
}
