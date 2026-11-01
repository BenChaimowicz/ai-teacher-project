import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import cookie from "@fastify/cookie";
import Fastify, { type InjectOptions } from "fastify";
import fp from "fastify-plugin";
import { courseCompletions, learners, lessonCompletions } from "@senoy/db";
import { AuthServiceError, type AuthService, type SessionTokens } from "../lib/supabase-auth.ts";
import currentLearnerPlugin, { SIGN_IN_ERROR, type TokenVerifier } from "../plugins/current-learner.ts";
import sameOriginPlugin, { CROSS_SITE_ERROR } from "../plugins/same-origin.ts";
import {
  authRoutes,
  EXPIRED_LINK_PATH,
  NOT_CONFIRMED_ERROR,
  safeNextPath,
  TOO_MANY_TRIES_ERROR,
  WEAK_PASSWORD_ERROR,
  WRONG_CODE_ERROR,
  WRONG_PASSWORD_ERROR,
} from "./auth.ts";
import { fakeDb } from "./fake-db.ts";
import { healthRoutes } from "./health.ts";
import { meRoutes } from "./me.ts";

/** Stand-in tokens: `token-<user id>` names a user; anything else is refused. */
const standInVerifier: TokenVerifier = async (token) => {
  const match = token.match(/^token-([\da-f-]{36})$/);
  if (!match) throw new Error("Not a token.");
  return { sub: match[1]! };
};

/** One account the stand-in Supabase knows. */
type Account = { password: string; confirmed: boolean; userId: string };

/**
 * A stand-in Supabase Auth over a map of accounts, recording every call. A session for a user is
 * `token-<id>` / `rt-<id>`; the 6-digit code is always `123456`; the one good link hash is `good-hash`.
 */
function standInAuth() {
  const accounts = new Map<string, Account>([
    ["ada@example.com", { password: "secret123", confirmed: true, userId: randomUUID() }],
    ["new@example.com", { password: "secret123", confirmed: false, userId: randomUUID() }],
  ]);
  const calls: { method: string; args: unknown[] }[] = [];
  /** The session the stand-in hands out for an account. */
  const sessionFor = (account: Account): SessionTokens => ({ accessToken: `token-${account.userId}`, refreshToken: `rt-${account.userId}` });
  /** Supabase's answer for a wrong credential. */
  const refused = (code: string) => new AuthServiceError(`Refused: ${code}`, code, 400);
  const auth: AuthService = {
    async signUp(email, password, redirectTo) {
      calls.push({ method: "signUp", args: [email, password, redirectTo] });
      if (password.length < 8) throw new AuthServiceError("Weak.", "weak_password", 422);
      if (accounts.has(email)) throw new AuthServiceError("Exists.", "user_already_exists", 422);
    },
    async resendConfirmation(email, redirectTo) {
      calls.push({ method: "resendConfirmation", args: [email, redirectTo] });
    },
    async signIn(email, password) {
      calls.push({ method: "signIn", args: [email] });
      const account = accounts.get(email);
      if (!account || account.password !== password) throw refused("invalid_credentials");
      if (!account.confirmed) throw refused("email_not_confirmed");
      return sessionFor(account);
    },
    async sendCode(email) {
      calls.push({ method: "sendCode", args: [email] });
      if (!accounts.has(email)) throw new AuthServiceError("Signups not allowed for otp.", "otp_disabled", 422);
    },
    async verifyCode(email, code) {
      calls.push({ method: "verifyCode", args: [email, code] });
      const account = accounts.get(email);
      if (!account || code !== "123456") throw new AuthServiceError("Expired.", "otp_expired", 403);
      return sessionFor(account);
    },
    async sendPasswordReset(email, redirectTo) {
      calls.push({ method: "sendPasswordReset", args: [email, redirectTo] });
      if (email === "down@example.com") throw new AuthServiceError("Down.", undefined, 0);
    },
    async verifyLink(tokenHash, type) {
      calls.push({ method: "verifyLink", args: [tokenHash, type] });
      if (tokenHash !== "good-hash") throw new AuthServiceError("Expired.", "otp_expired", 403);
      return sessionFor(accounts.get("ada@example.com")!);
    },
    async refresh(refreshToken) {
      calls.push({ method: "refresh", args: [refreshToken] });
      throw refused("refresh_token_not_found");
    },
    async changePassword(session, password) {
      calls.push({ method: "changePassword", args: [session, password] });
      if (password === "secret123") throw new AuthServiceError("Same.", "same_password", 422);
    },
    async signOut(session, scope) {
      calls.push({ method: "signOut", args: [session, scope] });
    },
  };
  return { auth, accounts, calls };
}

/** The API's sign-in pieces as the server wires them, over a stand-in Supabase and in-memory Learners. */
async function testApp(options: { appUrl?: string; trustProxy?: boolean } = {}) {
  const supabase = standInAuth();
  const store = fakeDb([learners, courseCompletions, lessonCompletions]);
  const app = Fastify({ trustProxy: options.trustProxy ?? false });
  await app.register(fp(async (instance) => { instance.decorate("db", store.db); }, { name: "db" }));
  await app.register(cookie);
  await app.register(sameOriginPlugin, { appUrl: options.appUrl });
  await app.register(currentLearnerPlugin, { verifyToken: standInVerifier, refreshSession: (rt) => supabase.auth.refresh(rt) });
  await app.register(healthRoutes);
  await app.register(authRoutes, { auth: supabase.auth });
  await app.register(meRoutes);
  /** POSTs JSON the way the web app does: same origin, no Sec-Fetch-Site surprises. */
  const post = (url: string, payload: object, extra: Partial<InjectOptions> = {}) =>
    app.inject({ method: "POST", url, payload, ...extra });
  return { app, post, ...supabase };
}

/**
 * The cookies a reply set, by name.
 * @param response - An inject response
 */
function setCookies(response: { cookies: { name: string; value: string; secure?: boolean; expires?: Date }[] }) {
  return Object.fromEntries(response.cookies.map((c) => [c.name, c]));
}

test("A cross-site POST is 403 by Origin or Sec-Fetch-Site; same-origin, APP_URL and header-less POSTs pass, and GETs are never checked", async () => {
  const { app, post } = await testApp({ appUrl: "https://knibbler.app" });
  try {
    const body = { email: "ada@example.com", password: "secret123" };
    for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, { "sec-fetch-site": "cross-site" }]) {
      const refused = await post("/api/auth/sign-in", body, { headers });
      assert.equal(refused.statusCode, 403, JSON.stringify(headers));
      assert.deepEqual(refused.json(), { error: CROSS_SITE_ERROR });
      assert.equal(refused.cookies.length, 0);
    }
    for (const headers of [
      {},
      { origin: "http://localhost" },
      { origin: "http://localhost:80", "sec-fetch-site": "same-origin" },
      { origin: "https://knibbler.app" },
      // Behind a proxy (Vite in dev): the page's origin differs from the API's host, and the browser says same-origin.
      { origin: "http://127.0.0.1:4190", "sec-fetch-site": "same-origin" },
    ]) {
      const passed = await post("/api/auth/sign-in", body, { headers });
      assert.equal(passed.statusCode, 204, JSON.stringify(headers));
    }
    const read = await app.inject({ method: "GET", url: "/api/health", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } });
    assert.equal(read.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("Sign-in sets both session cookies, which then sign in /api/me; a wrong password is 401 and an unconfirmed email 403", async () => {
  const { app, post } = await testApp();
  try {
    const signedIn = await post("/api/auth/sign-in", { email: "ada@example.com", password: "secret123" });
    assert.equal(signedIn.statusCode, 204);
    const cookies = setCookies(signedIn);
    assert.match(cookies.kn_at!.value, /^token-/);
    assert.match(cookies.kn_rt!.value, /^rt-/);

    const me = await app.inject({ method: "GET", url: "/api/me", cookies: { kn_at: cookies.kn_at!.value, kn_rt: cookies.kn_rt!.value } });
    assert.equal(me.statusCode, 200);

    for (const payload of [{ email: "ada@example.com", password: "wrong" }, { email: "nobody@example.com", password: "secret123" }, {}]) {
      const wrong = await post("/api/auth/sign-in", payload);
      assert.equal(wrong.statusCode, 401);
      assert.deepEqual(wrong.json(), { error: WRONG_PASSWORD_ERROR });
    }
    const unconfirmed = await post("/api/auth/sign-in", { email: "new@example.com", password: "secret123" });
    assert.equal(unconfirmed.statusCode, 403);
    assert.deepEqual(unconfirmed.json(), { error: NOT_CONFIRMED_ERROR, code: "email_not_confirmed" });
  } finally {
    await app.close();
  }
});

test("Over HTTPS (behind a trusted proxy) the session cookies are Secure", async () => {
  const { app, post } = await testApp({ trustProxy: true });
  try {
    const signedIn = await post("/api/auth/sign-in", { email: "ada@example.com", password: "secret123" }, {
      headers: { "x-forwarded-proto": "https" },
    });
    assert.equal(signedIn.statusCode, 204);
    assert.equal(setCookies(signedIn).kn_at!.secure, true);
    assert.equal(setCookies(signedIn).kn_rt!.secure, true);
  } finally {
    await app.close();
  }
});

test("Sign-up, resend, code and forgot answer 204 whether or not the email has an account, and link back to the request's own origin", async () => {
  const { app, post, calls } = await testApp();
  try {
    for (const email of ["ada@example.com", "fresh@example.com"]) {
      assert.equal((await post("/api/auth/sign-up", { email, password: "secret123" })).statusCode, 204, email);
      assert.equal((await post("/api/auth/resend", { email })).statusCode, 204, email);
      assert.equal((await post("/api/auth/code", { email })).statusCode, 204, email);
      assert.equal((await post("/api/auth/forgot", { email })).statusCode, 204, email);
    }
    const signUp = calls.find((call) => call.method === "signUp")!;
    assert.equal(signUp.args[2], "http://localhost/api/auth/confirm?next=/");
    const forgot = calls.find((call) => call.method === "sendPasswordReset")!;
    assert.equal(forgot.args[1], "http://localhost/api/auth/confirm?next=/reset-password");

    const weak = await post("/api/auth/sign-up", { email: "fresh@example.com", password: "short" });
    assert.equal(weak.statusCode, 400);
    assert.deepEqual(weak.json(), { error: WEAK_PASSWORD_ERROR });
    assert.equal((await post("/api/auth/forgot", { email: "not-an-email" })).statusCode, 400);
    assert.equal((await post("/api/auth/forgot", { email: "down@example.com" })).statusCode, 503, "Supabase down is not a neutral success.");
  } finally {
    await app.close();
  }
});

test("A 6-digit code signs in when right, and is 401 when wrong", async () => {
  const { app, post } = await testApp();
  try {
    const right = await post("/api/auth/code/verify", { email: "ada@example.com", code: "123456" });
    assert.equal(right.statusCode, 204);
    assert.match(setCookies(right).kn_at!.value, /^token-/);
    const wrong = await post("/api/auth/code/verify", { email: "ada@example.com", code: "000000" });
    assert.equal(wrong.statusCode, 401);
    assert.deepEqual(wrong.json(), { error: WRONG_CODE_ERROR });
    assert.equal(wrong.cookies.length, 0);
  } finally {
    await app.close();
  }
});

test("An email link sets the cookies and redirects 303 to a path on this site only; a bad link lands on sign-in", async () => {
  const { app, calls } = await testApp();
  try {
    const cases: [string, string][] = [
      ["/reset-password", "/reset-password"],
      ["/", "/"],
      ["/courses?tab=mine#top", "/courses?tab=mine#top"],
      ["//evil.example/path", "/"],
      ["/\\evil.example", "/"],
      ["https://evil.example", "/"],
      ["javascript:alert(1)", "/"],
      ["", "/"],
    ];
    for (const [next, expected] of cases) {
      const response = await app.inject({
        method: "GET", url: "/api/auth/confirm", query: { token_hash: "good-hash", type: "recovery", next },
      });
      assert.equal(response.statusCode, 303, next);
      assert.equal(response.headers.location, expected, next);
      assert.match(setCookies(response).kn_at!.value, /^token-/);
    }
    assert.deepEqual(calls.find((call) => call.method === "verifyLink")!.args, ["good-hash", "recovery"]);

    const badLinks: Record<string, string>[] = [{ token_hash: "used-hash", type: "email", next: "/" }, { token_hash: "good-hash", type: "bogus" }, {}];
    for (const query of badLinks) {
      const response = await app.inject({ method: "GET", url: "/api/auth/confirm", query });
      assert.equal(response.statusCode, 303);
      assert.equal(response.headers.location, EXPIRED_LINK_PATH);
      assert.equal(response.cookies.length, 0);
    }
    assert.equal(safeNextPath(undefined), "/");
    assert.equal(safeNextPath("/a/../b"), "/b");
  } finally {
    await app.close();
  }
});

test("Changing the password needs a session and passes it to Supabase", async () => {
  const { app, post, accounts, calls } = await testApp();
  try {
    const anonymous = await post("/api/auth/password", { password: "newpass123" });
    assert.equal(anonymous.statusCode, 401);
    assert.deepEqual(anonymous.json(), { error: SIGN_IN_ERROR });

    const userId = accounts.get("ada@example.com")!.userId;
    const cookies = { kn_at: `token-${userId}`, kn_rt: `rt-${userId}` };
    const changed = await post("/api/auth/password", { password: "newpass123" }, { cookies });
    assert.equal(changed.statusCode, 204);
    assert.deepEqual(calls.find((call) => call.method === "changePassword")!.args, [
      { accessToken: cookies.kn_at, refreshToken: cookies.kn_rt },
      "newpass123",
    ]);
    const same = await post("/api/auth/password", { password: "secret123" }, { cookies });
    assert.equal(same.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("Sign-out revokes the session at Supabase with its scope and clears both cookies", async () => {
  const { app, post, calls } = await testApp();
  try {
    const userId = randomUUID();
    const response = await post("/api/auth/sign-out", { scope: "global" }, { cookies: { kn_at: `token-${userId}`, kn_rt: `rt-${userId}` } });
    assert.equal(response.statusCode, 204);
    assert.deepEqual(calls.find((call) => call.method === "signOut")!.args[1], "global");
    const cleared = setCookies(response);
    assert.equal(cleared.kn_at!.value, "");
    assert.equal(cleared.kn_rt!.value, "");

    assert.equal((await post("/api/auth/sign-out", {})).statusCode, 204, "Signing out with no session still clears.");
    assert.equal((await post("/api/auth/sign-out", { scope: "everyone" })).statusCode, 400);
  } finally {
    await app.close();
  }
});

test("Sign-in is rate-limited per email (any case) and per IP, answering 429", async () => {
  const { app, post } = await testApp();
  try {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const email = attempt % 2 ? "ada@example.com" : "ADA@example.com";
      assert.equal((await post("/api/auth/sign-in", { email, password: "wrong" })).statusCode, 401, `attempt ${attempt}`);
    }
    const sixth = await post("/api/auth/sign-in", { email: "ada@example.com", password: "secret123" });
    assert.equal(sixth.statusCode, 429);
    assert.deepEqual(sixth.json(), { error: TOO_MANY_TRIES_ERROR });
    assert.ok(Number(sixth.headers["retry-after"]) > 0);

    // Five more from the same IP with other emails reach the per-IP limit of 10; the eleventh is refused.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      assert.equal((await post("/api/auth/sign-in", { email: `other${attempt}@example.com`, password: "x" })).statusCode, 401);
    }
    assert.equal((await post("/api/auth/sign-in", { email: "fresh@example.com", password: "x" })).statusCode, 429);
    // Each route counts on its own.
    assert.equal((await post("/api/auth/code", { email: "fresh@example.com" })).statusCode, 204);
  } finally {
    await app.close();
  }
});
