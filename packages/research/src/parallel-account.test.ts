import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  createParallelTokenKeeper,
  currentParallelAccessToken,
  pollParallelToken,
  readParallelAccount,
  writeParallelAccount,
  type ParallelAccount,
  type ParallelDeviceCode,
} from "./parallel-account.ts";

const T0 = new Date("2026-10-24T12:00:00.000Z");
const CODE: ParallelDeviceCode = {
  deviceCode: "dev-123", userCode: "ABCD-EFGH", verificationUri: "https://platform.parallel.ai/getServiceKeys/device",
  verificationUriComplete: null, expiresInSeconds: 60, intervalSeconds: 2,
};

/**
 * A token endpoint answering from a script, with a clock that sleeping advances.
 * @param answers - One [status, body] per POST, in order
 */
function fakeAuth(answers: [number, unknown][]) {
  let clock = T0.getTime();
  const sleeps: number[] = [];
  const bodies: string[] = [];
  const fetch = (async (_url: string, init?: RequestInit) => {
    bodies.push(String(init?.body));
    const [status, body] = answers.shift() ?? [500, { error: "server_error" }];
    return new Response(JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
  return {
    bodies,
    sleeps,
    options: {
      fetch,
      now: () => new Date(clock),
      sleep: async (ms: number) => {
        sleeps.push(ms);
        clock += ms;
      },
    },
  };
}

describe("Device flow polling", () => {
  it("waits through authorization_pending, slows down on slow_down, then returns the tokens", async () => {
    const auth = fakeAuth([
      [400, { error: "authorization_pending" }],
      [400, { error: "slow_down" }],
      [200, { access_token: "at-1", refresh_token: "rt-1", token_type: "Bearer", expires_in: 3600 }],
    ]);
    const tokens = await pollParallelToken("client-1", CODE, auth.options);
    assert.deepEqual(tokens, { accessToken: "at-1", refreshToken: "rt-1", expiresInSeconds: 3600 });
    assert.deepEqual(auth.sleeps, [2000, 2000, 7000]);
    assert.match(auth.bodies[0]!, /grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&client_id=client-1&device_code=dev-123/);
  });

  it("stops with expired_token when the code runs out", async () => {
    const auth = fakeAuth(Array.from({ length: 100 }, () => [400, { error: "authorization_pending" }] as [number, unknown]));
    await assert.rejects(pollParallelToken("client-1", CODE, auth.options), (error: Error & { code?: string }) => error.code === "expired_token");
  });

  it("stops when the user denies, without leaking the device code", async () => {
    const auth = fakeAuth([[400, { error: "access_denied", error_description: "denied dev-123" }]]);
    await assert.rejects(pollParallelToken("client-1", CODE, auth.options), (error: Error & { code?: string }) =>
      error.code === "access_denied" && !error.message.includes("dev-123"));
  });
});

describe("Token file and keeper", () => {
  let dir: string;
  let path: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "parallel-account-"));
    path = join(dir, ".parallel-account.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const account = (expiresAt: Date): ParallelAccount => ({
    clientId: "client-1", refreshToken: "rt-1", accessToken: "at-1", accessTokenExpiresAt: expiresAt.toISOString(),
  });

  it("readers get the token only while it is valid, and null with no file", async () => {
    assert.equal(await currentParallelAccessToken(path, () => T0), null);
    await writeParallelAccount(path, account(new Date(T0.getTime() + 10 * 60_000)));
    assert.equal(await currentParallelAccessToken(path, () => T0), "at-1");
    assert.equal(await currentParallelAccessToken(path, () => new Date(T0.getTime() + 11 * 60_000)), null);
  });

  it("is not_configured with no file", async () => {
    const keeper = createParallelTokenKeeper({ path, auth: fakeAuth([]).options });
    assert.deepEqual(await keeper.ensureFresh(), { status: "not_configured" });
  });

  it("does not refresh a token far from expiry", async () => {
    await writeParallelAccount(path, account(new Date(T0.getTime() + 60 * 60_000)));
    const auth = fakeAuth([]);
    const keeper = createParallelTokenKeeper({ path, auth: auth.options });
    assert.deepEqual(await keeper.ensureFresh(), { status: "ok", accessToken: "at-1" });
    assert.equal(auth.bodies.length, 0);
  });

  it("refreshes once for concurrent callers near expiry and rewrites the file with the rotated refresh token", async () => {
    await writeParallelAccount(path, account(new Date(T0.getTime() + 60_000)));
    const auth = fakeAuth([[200, { access_token: "at-2", refresh_token: "rt-2", expires_in: 3600 }]]);
    const keeper = createParallelTokenKeeper({ path, auth: auth.options });
    const [a, b] = await Promise.all([keeper.ensureFresh(), keeper.ensureFresh()]);
    assert.deepEqual(a, { status: "ok", accessToken: "at-2" });
    assert.deepEqual(b, a);
    assert.equal(auth.bodies.length, 1);
    assert.match(auth.bodies[0]!, /grant_type=refresh_token&refresh_token=rt-1&client_id=client-1/);
    const saved = await readParallelAccount(path);
    assert.deepEqual(saved, {
      clientId: "client-1", refreshToken: "rt-2", accessToken: "at-2",
      accessTokenExpiresAt: new Date(T0.getTime() + 3600_000).toISOString(),
    });
    assert.doesNotMatch(await readFile(path, "utf8"), /rt-1/);
  });

  it("keeps the old refresh token when the answer has none, and reports a dead login without leaking it", async () => {
    await writeParallelAccount(path, account(new Date(T0.getTime() + 60_000)));
    const keeper = createParallelTokenKeeper({ path, auth: fakeAuth([[200, { access_token: "at-2", expires_in: 3600 }]]).options });
    await keeper.ensureFresh();
    assert.equal((await readParallelAccount(path))!.refreshToken, "rt-1");

    await writeParallelAccount(path, account(new Date(T0.getTime() + 60_000)));
    const dead = createParallelTokenKeeper({ path, auth: fakeAuth([[400, { error: "invalid_grant", error_description: "rt-1 revoked" }]]).options });
    const state = await dead.ensureFresh();
    assert.equal(state.status, "error");
    assert.match((state as { error: string }).error, /Run pnpm parallel:login again/);
    assert.doesNotMatch((state as { error: string }).error, /rt-1/);
  });
});
