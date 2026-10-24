import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { arch, platform, release, version } from "node:os";
import { resolve } from "node:path";
import { redact } from "./research.ts";

/**
 * Parallel Account API login (OAuth 2.0 device flow, RFC 8628) and the token file it leaves behind.
 * `pnpm parallel:login` runs the flow once and saves `.parallel-account.json` at the repo root. After that the Usage
 * Console API is the single writer: it refreshes the access token ahead of expiry and rewrites the file. The Learner
 * API and the worker only read the current access token and skip Parallel measurement when it is missing or expired.
 */

/** Where the Account API's OAuth endpoints live. */
const PLATFORM_URL = "https://platform.parallel.ai/getServiceKeys";

/** The token file's name, at the repo root (gitignored). */
export const PARALLEL_ACCOUNT_FILE = ".parallel-account.json";

/** A token counts as expired this long before it really does, so a request never carries one about to lapse. */
const EXPIRY_SKEW_MS = 30_000;

/** What `.parallel-account.json` holds. */
export type ParallelAccount = {
  clientId: string;
  refreshToken: string;
  accessToken: string;
  /** ISO instant. */
  accessTokenExpiresAt: string;
};

/** One successful token answer. */
export type ParallelTokenSet = { accessToken: string; refreshToken: string | null; expiresInSeconds: number };

/** What a device-code request returns. */
export type ParallelDeviceCode = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string | null;
  expiresInSeconds: number;
  intervalSeconds: number;
};

/** HTTP and clock seams; tests pass fakes. */
export type ParallelAuthOptions = {
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  /** Time limit per request. */
  timeoutMs?: number;
};

/** An OAuth error answer (`authorization_pending`, `invalid_grant`, …). */
export class ParallelOAuthError extends Error {
  /**
   * @param code - The OAuth `error` code
   * @param message - Full message
   */
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ParallelOAuthError";
  }
}

/**
 * The token file path under a repo root.
 * @param repoRoot - Absolute repo root
 */
export function parallelAccountPath(repoRoot: string) {
  return resolve(repoRoot, PARALLEL_ACCOUNT_FILE);
}

/**
 * Reads the token file.
 * @param path - Token file path
 * @returns The account, or null when there is no file
 * @throws Error when the file exists but is not a valid account (contents never quoted)
 */
export async function readParallelAccount(path: string): Promise<ParallelAccount | null> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[parallel-account.ts: readParallelAccount] Could not read the token file || path=${path} || ${message}`);
  }
  let row: Partial<ParallelAccount>;
  try {
    row = JSON.parse(text) as Partial<ParallelAccount>;
  } catch {
    throw new Error(`[parallel-account.ts: readParallelAccount] Token file is not JSON || path=${path}`);
  }
  const fields = [row.clientId, row.refreshToken, row.accessToken, row.accessTokenExpiresAt];
  if (fields.some((field) => typeof field !== "string" || !field) || Number.isNaN(Date.parse(row.accessTokenExpiresAt!))) {
    throw new Error(`[parallel-account.ts: readParallelAccount] Token file is missing fields; run pnpm parallel:login || path=${path}`);
  }
  return row as ParallelAccount;
}

/**
 * Writes the token file atomically (temp file, then rename), so a reader never sees half a file.
 * @param path - Token file path
 * @param account - What to save
 */
export async function writeParallelAccount(path: string, account: ParallelAccount): Promise<void> {
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(account, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    try {
      await rename(temp, path);
    } catch {
      // Windows refuses the rename while a reader holds the file open for a moment; try once more.
      await new Promise((done) => setTimeout(done, 100));
      await rename(temp, path);
    }
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[parallel-account.ts: writeParallelAccount] Could not save the token file || path=${path} || ${message}`);
  }
}

/**
 * The current access token for a reader that must not refresh (Learner API, worker).
 * @param path - Token file path
 * @param now - Clock
 * @returns The token, or null when there is no file, it is unreadable, or the token has expired
 */
export async function currentParallelAccessToken(path: string, now: () => Date = () => new Date()): Promise<string | null> {
  try {
    const account = await readParallelAccount(path);
    if (!account) return null;
    return Date.parse(account.accessTokenExpiresAt) - EXPIRY_SKEW_MS > now().getTime() ? account.accessToken : null;
  } catch {
    return null;
  }
}

/**
 * POSTs to an OAuth endpoint and returns its JSON. An OAuth `error` body becomes a `ParallelOAuthError`.
 * @param where - `[file: fn]` prefix
 * @param path - Path under the platform URL
 * @param body - Form fields or a JSON object
 * @param options - fetch and time limit
 * @param secrets - Values scrubbed from any message
 */
async function postOAuth(
  where: string,
  path: string,
  body: { form: Record<string, string> } | { json: unknown },
  options: ParallelAuthOptions,
  secrets: string[],
): Promise<Record<string, unknown>> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const scrub = (text: string) => secrets.reduce((out, secret) => redact(out, secret), text);
  let status: number;
  let text: string;
  try {
    const response = await fetchImpl(`${PLATFORM_URL}${path}`, {
      method: "POST",
      headers: "form" in body
        ? { "content-type": "application/x-www-form-urlencoded", accept: "application/json" }
        : { "content-type": "application/json", accept: "application/json" },
      body: "form" in body ? new URLSearchParams(body.form).toString() : JSON.stringify(body.json),
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
    status = response.status;
    text = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(scrub(`${where} Request failed || path=${path} || ${message}`));
  }
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (JSON.parse(text) ?? {}) as Record<string, unknown>;
  } catch {
    // Handled below.
  }
  if (typeof parsed.error === "string") {
    const detail = typeof parsed.error_description === "string" ? ` || ${parsed.error_description}` : "";
    throw new ParallelOAuthError(parsed.error, scrub(`${where} ${parsed.error} || path=${path} || status=${status}${detail}`));
  }
  if (status < 200 || status >= 300) throw new Error(scrub(`${where} Refused || path=${path} || status=${status} || ${text.slice(0, 200)}`));
  return parsed;
}

/**
 * Reads a token answer.
 * @param where - `[file: fn]` prefix
 * @param body - The answer
 */
function tokenSet(where: string, body: Record<string, unknown>): ParallelTokenSet {
  if (typeof body.access_token !== "string" || !body.access_token) throw new Error(`${where} Token answer has no access_token`);
  const expires = Number(body.expires_in);
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === "string" && body.refresh_token ? body.refresh_token : null,
    // Without a lifetime, assume a short one so the keeper refreshes soon.
    expiresInSeconds: Number.isFinite(expires) && expires > 0 ? expires : 600,
  };
}

/**
 * Registers this installation as an OAuth client.
 * @param options - fetch
 * @returns The `client_id`
 */
export async function registerParallelClient(options: ParallelAuthOptions = {}): Promise<string> {
  const where = "[parallel-account.ts: registerParallelClient]";
  const body = await postOAuth(where, "/register", {
    json: {
      client_name: "senoy-usage-console",
      platform: { machine: arch(), os_name: platform() === "win32" ? "nt" : "posix", processor: arch(), release: release(), system: platform(), version: version() },
    },
  }, options, []);
  if (typeof body.client_id !== "string" || !body.client_id) throw new Error(`${where} Register answer has no client_id`);
  return body.client_id;
}

/**
 * Starts a device authorization session.
 * @param clientId - From `registerParallelClient`
 * @param options - fetch; `scope` only when Parallel requires one
 */
export async function requestParallelDeviceCode(clientId: string, options: ParallelAuthOptions & { scope?: string } = {}): Promise<ParallelDeviceCode> {
  const where = "[parallel-account.ts: requestParallelDeviceCode]";
  const form: Record<string, string> = { client_id: clientId };
  if (options.scope) form.scope = options.scope;
  const body = await postOAuth(where, "/device/code", { form }, options, []);
  if (typeof body.device_code !== "string" || typeof body.user_code !== "string" || typeof body.verification_uri !== "string") {
    throw new Error(`${where} Device code answer is missing device_code, user_code, or verification_uri`);
  }
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUri: body.verification_uri,
    verificationUriComplete: typeof body.verification_uri_complete === "string" ? body.verification_uri_complete : null,
    expiresInSeconds: Number(body.expires_in) > 0 ? Number(body.expires_in) : 600,
    intervalSeconds: Number(body.interval) > 0 ? Number(body.interval) : 5,
  };
}

/**
 * Polls the token endpoint until the user approves: waits `interval` between polls, adds 5 s on `slow_down`
 * (RFC 8628 §3.5), and gives up when the code expires or the user denies.
 * @param clientId - OAuth client
 * @param code - The device code session
 * @param options - fetch, clock, sleep
 * @returns The tokens
 * @throws ParallelOAuthError `expired_token` / `access_denied`, or Error on other failures
 */
export async function pollParallelToken(clientId: string, code: ParallelDeviceCode, options: ParallelAuthOptions = {}): Promise<ParallelTokenSet> {
  const where = "[parallel-account.ts: pollParallelToken]";
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((done) => setTimeout(done, ms)));
  const deadline = now().getTime() + code.expiresInSeconds * 1000;
  let intervalMs = code.intervalSeconds * 1000;
  for (;;) {
    if (now().getTime() >= deadline) throw new ParallelOAuthError("expired_token", `${where} The code expired before it was approved; run pnpm parallel:login again`);
    await sleep(intervalMs);
    try {
      const body = await postOAuth(where, "/token", {
        form: { grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: clientId, device_code: code.deviceCode },
      }, options, [code.deviceCode]);
      return tokenSet(where, body);
    } catch (error) {
      if (!(error instanceof ParallelOAuthError)) throw error;
      if (error.code === "authorization_pending") continue;
      if (error.code === "slow_down") {
        intervalMs += 5_000;
        continue;
      }
      throw error;
    }
  }
}

/**
 * Exchanges a refresh token for a new access token (and usually a new refresh token).
 * @param clientId - OAuth client
 * @param refreshToken - Current refresh token
 * @param options - fetch
 * @throws ParallelOAuthError (e.g. `invalid_grant` when the login is gone), tokens scrubbed
 */
export async function refreshParallelToken(clientId: string, refreshToken: string, options: ParallelAuthOptions = {}): Promise<ParallelTokenSet> {
  const where = "[parallel-account.ts: refreshParallelToken]";
  const body = await postOAuth(where, "/token", {
    form: { grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId },
  }, options, [refreshToken]);
  return tokenSet(where, body);
}

/**
 * The account to save from a token answer.
 * @param clientId - OAuth client
 * @param tokens - The answer
 * @param previousRefreshToken - Kept when the answer carries no new refresh token
 * @param now - Clock
 */
export function accountFromTokens(clientId: string, tokens: ParallelTokenSet, previousRefreshToken: string | null, now: Date): ParallelAccount {
  const refreshToken = tokens.refreshToken ?? previousRefreshToken;
  if (!refreshToken) throw new Error("[parallel-account.ts: accountFromTokens] Token answer has no refresh_token");
  return {
    clientId,
    refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: new Date(now.getTime() + tokens.expiresInSeconds * 1000).toISOString(),
  };
}

/** What the keeper knows about the Parallel login right now. */
export type ParallelTokenState =
  | { status: "ok"; accessToken: string }
  | { status: "not_configured" }
  | { status: "error"; error: string };

/** The single writer of the token file (the Usage Console API). */
export type ParallelTokenKeeper = {
  /** Refreshes when the token is within the margin of expiry, then returns the current state. Never throws. */
  ensureFresh(): Promise<ParallelTokenState>;
};

/**
 * Builds the keeper. Concurrent `ensureFresh` calls share one refresh, so the file is rewritten once per refresh.
 * @param options.path - Token file path
 * @param options.marginMs - Refresh when less than this remains (default 5 min)
 * @param options.auth - fetch and clock
 */
export function createParallelTokenKeeper(options: { path: string; marginMs?: number; auth?: ParallelAuthOptions }): ParallelTokenKeeper {
  const now = options.auth?.now ?? (() => new Date());
  const marginMs = options.marginMs ?? 5 * 60_000;
  let inFlight: Promise<ParallelTokenState> | null = null;

  /** Reads the file and refreshes when needed. */
  const run = async (): Promise<ParallelTokenState> => {
    let account: ParallelAccount | null;
    try {
      account = await readParallelAccount(options.path);
    } catch (error) {
      return { status: "error", error: error instanceof Error ? error.message : String(error) };
    }
    if (!account) return { status: "not_configured" };
    if (Date.parse(account.accessTokenExpiresAt) - now().getTime() > marginMs) return { status: "ok", accessToken: account.accessToken };
    try {
      const tokens = await refreshParallelToken(account.clientId, account.refreshToken, options.auth);
      const next = accountFromTokens(account.clientId, tokens, account.refreshToken, now());
      await writeParallelAccount(options.path, next);
      return { status: "ok", accessToken: next.accessToken };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const hint = error instanceof ParallelOAuthError && error.code === "invalid_grant" ? " Run pnpm parallel:login again." : "";
      return { status: "error", error: redact(redact(`[parallel-account.ts: ensureFresh] Could not refresh the Parallel login.${hint} || ${message}`, account.refreshToken), account.accessToken) };
    }
  };

  return {
    ensureFresh() {
      inFlight ??= run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}
