import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionTokens } from "./supabase-auth.ts";

/** The cookie holding the Supabase access token (ADR 0027). */
export const ACCESS_COOKIE = "kn_at";

/** The cookie holding the Supabase refresh token (ADR 0027). */
export const REFRESH_COOKIE = "kn_rt";

/** 400 days, the longest lifetime browsers keep a cookie, in seconds. Each refresh sets the cookies again. */
const COOKIE_MAX_AGE_S = 400 * 24 * 60 * 60;

/**
 * The attributes both session cookies share: unreadable by page scripts, sent only to `/api`, and kept off cross-site
 * subrequests. `Secure` follows the request: HTTPS gets it, plain-HTTP dev and e2e don't (a `Secure` cookie set over
 * HTTP is dropped). `request.protocol` reads `X-Forwarded-Proto` only when Fastify's `trustProxy` is on, so a deploy
 * behind a TLS-terminating proxy must turn it on (SEN-106), or the cookies go out without `Secure`.
 * @param request - The request being answered
 */
function cookieOptions(request: FastifyRequest): CookieSerializeOptions {
  return { httpOnly: true, sameSite: "lax", path: "/api", secure: request.protocol === "https" };
}

/**
 * The session the request's cookies carry; either token may be missing.
 * @param request - Incoming request
 */
export function readSessionCookies(request: FastifyRequest) {
  return {
    accessToken: request.cookies[ACCESS_COOKIE] || null,
    refreshToken: request.cookies[REFRESH_COOKIE] || null,
  };
}

/**
 * Sets both session cookies on the reply.
 * @param request - The request being answered, for `Secure`
 * @param reply - The reply
 * @param session - The tokens to keep
 */
export function setSessionCookies(request: FastifyRequest, reply: FastifyReply, session: SessionTokens) {
  const options = { ...cookieOptions(request), maxAge: COOKIE_MAX_AGE_S };
  reply.setCookie(ACCESS_COOKIE, session.accessToken, options);
  reply.setCookie(REFRESH_COOKIE, session.refreshToken, options);
}

/**
 * Clears both session cookies, with the same path and attributes they were set with.
 * @param request - The request being answered, for `Secure`
 * @param reply - The reply
 */
export function clearSessionCookies(request: FastifyRequest, reply: FastifyReply) {
  const options = cookieOptions(request);
  reply.clearCookie(ACCESS_COOKIE, options);
  reply.clearCookie(REFRESH_COOKIE, options);
}
