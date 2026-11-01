import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import fp from "fastify-plugin";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { learners } from "@senoy/db";
import { NAME_THINGS, NAME_TRAITS } from "@senoy/db/learner-name";
import currentLearnerPlugin, {
  SIGN_IN_ERROR,
  supabaseTokenVerifier,
  TokenCheckUnavailableError,
  type TokenVerifier,
} from "../plugins/current-learner.ts";
import { fakeDb } from "./fake-db.ts";
import { healthRoutes } from "./health.ts";
import { DISPLAY_NAME_ERROR, meRoutes } from "./me.ts";

/** Stand-in tokens: `token-<user id>[-<email>]` names a user; anything else is refused, `unavailable` can't be checked. */
const standInVerifier: TokenVerifier = async (token) => {
  if (token === "unavailable") throw new TokenCheckUnavailableError("Keys are down.");
  const match = token.match(/^token-([\da-f-]{36})(?:-(.+))?$/);
  if (!match) throw new Error("Not a token.");
  return { sub: match[1]!, ...(match[2] ? { email: match[2] } : {}) };
};

/** The real plugin and /api/me over an in-memory `learners` table, with the stand-in token check. */
async function testApp() {
  const store = fakeDb([learners]);
  const app = Fastify();
  await app.register(fp(async (instance) => { instance.decorate("db", store.db); }, { name: "db" }));
  await app.register(currentLearnerPlugin, { verifyToken: standInVerifier });
  await app.register(healthRoutes);
  await app.register(meRoutes);
  /** Calls the API with a bearer token, or none. */
  const call = (method: "GET" | "PATCH", url: string, token?: string, payload?: object) =>
    app.inject({ method, url, payload, headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { app, call, learnerRows: () => store.rows.get(learners)! as (typeof learners.$inferSelect)[] };
}

test("A request without a token, or with a refused one, is 401 and makes no Learner; /api/health stays open", async () => {
  const { app, call, learnerRows } = await testApp();
  try {
    for (const token of [undefined, "forged", `token-${"-".repeat(36)}`]) {
      const response = await call("GET", "/api/me", token);
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.json(), { error: SIGN_IN_ERROR });
    }
    const basic = await app.inject({ method: "GET", url: "/api/me", headers: { authorization: "Basic abc" } });
    assert.equal(basic.statusCode, 401);
    assert.equal(learnerRows().length, 0);
    const health = await call("GET", "/api/health");
    assert.equal(health.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("A token check that cannot run is 503, not a sign-out", async () => {
  const { app, call } = await testApp();
  try {
    const response = await call("GET", "/api/me", "unavailable");
    assert.equal(response.statusCode, 503);
  } finally {
    await app.close();
  }
});

test("A new user's first call creates their Learner with a Trait_Thing name; later calls reuse it", async () => {
  const { app, call, learnerRows } = await testApp();
  try {
    const userId = randomUUID();
    const first = await call("GET", "/api/me", `token-${userId}-ada@example.com`);
    assert.equal(first.statusCode, 200);
    const me = first.json() as { id: string; displayName: string; email: string };
    assert.equal(me.email, "ada@example.com");
    const [trait, thing] = me.displayName.split("_");
    assert.ok(NAME_TRAITS.some((name) => name === trait) && NAME_THINGS.some((name) => name === thing), me.displayName);
    assert.equal(learnerRows().length, 1);
    assert.equal(learnerRows()[0]!.authUserId, userId);

    const again = await call("GET", "/api/me", `token-${userId}`);
    assert.equal(again.json().id, me.id);
    assert.equal(again.json().displayName, me.displayName);
    assert.equal(again.json().email, null, "The email comes from the token, not the database.");
    assert.equal(learnerRows().length, 1);
  } finally {
    await app.close();
  }
});

test("Two first calls at once make one Learner", async () => {
  const { app, call, learnerRows } = await testApp();
  try {
    const token = `token-${randomUUID()}`;
    const [a, b] = await Promise.all([call("GET", "/api/me", token), call("GET", "/api/me", token)]);
    assert.equal(a.json().id, b.json().id);
    assert.equal(learnerRows().length, 1);
  } finally {
    await app.close();
  }
});

test("PATCH /api/me cleans and saves a display name; an empty or too-long name is 400 and changes nothing", async () => {
  const { app, call, learnerRows } = await testApp();
  try {
    const token = `token-${randomUUID()}-ada@example.com`;
    const { id, displayName } = (await call("GET", "/api/me", token)).json() as { id: string; displayName: string };

    const saved = await call("PATCH", "/api/me", token, { displayName: "  Ada   Lovelace " });
    assert.equal(saved.statusCode, 200);
    assert.deepEqual(saved.json(), { id, displayName: "Ada Lovelace", email: "ada@example.com" });
    assert.equal((await call("GET", "/api/me", token)).json().displayName, "Ada Lovelace");

    for (const payload of [{ displayName: "   " }, { displayName: "x".repeat(41) }, { displayName: 7 }, {}]) {
      const refused = await call("PATCH", "/api/me", token, payload);
      assert.equal(refused.statusCode, 400);
      assert.deepEqual(refused.json(), { error: DISPLAY_NAME_ERROR });
    }
    assert.equal(learnerRows()[0]!.displayName, "Ada Lovelace");
    assert.notEqual(displayName, "Ada Lovelace");
  } finally {
    await app.close();
  }
});

test("A Learner's name change never touches another Learner", async () => {
  const { app, call } = await testApp();
  try {
    const a = `token-${randomUUID()}`;
    const b = `token-${randomUUID()}`;
    const before = (await call("GET", "/api/me", b)).json();
    await call("PATCH", "/api/me", a, { displayName: "Ada" });
    assert.deepEqual((await call("GET", "/api/me", b)).json(), before);
  } finally {
    await app.close();
  }
});

test("The Supabase token check accepts its project's ES256 tokens and refuses other issuers, audiences, keys, and expired ones", async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const stranger = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256", use: "sig" };
  const keys = Fastify();
  keys.get("/auth/v1/.well-known/jwks.json", async () => ({ keys: [jwk] }));
  const base = await keys.listen({ port: 0, host: "127.0.0.1" });
  try {
    const verify = supabaseTokenVerifier(`${base}/`);
    const sub = randomUUID();
    /** Signs a token with the given claims over the valid defaults. */
    const sign = (claims: { iss?: string; aud?: string; exp?: number } = {}, key = privateKey) =>
      new SignJWT({ email: "ada@example.com" })
        .setProtectedHeader({ alg: "ES256", kid: "k1" })
        .setSubject(sub)
        .setIssuer(claims.iss ?? `${base}/auth/v1`)
        .setAudience(claims.aud ?? "authenticated")
        .setExpirationTime(claims.exp ?? Math.floor(Date.now() / 1000) + 3600)
        .sign(key);

    assert.deepEqual(await verify(await sign()), { sub, email: "ada@example.com" });
    for (const token of [
      await sign({ iss: "https://elsewhere.supabase.co/auth/v1" }),
      await sign({ aud: "anon" }),
      await sign({ exp: Math.floor(Date.now() / 1000) - 60 }),
      await sign({}, stranger.privateKey),
      "not.a.jwt",
    ]) {
      await assert.rejects(verify(token), (error: unknown) => !(error instanceof TokenCheckUnavailableError));
    }
    assert.throws(() => supabaseTokenVerifier(undefined), /SUPABASE_URL is not set/);
    assert.throws(() => supabaseTokenVerifier("  "), /SUPABASE_URL is not set/);
  } finally {
    await keys.close();
  }
});
