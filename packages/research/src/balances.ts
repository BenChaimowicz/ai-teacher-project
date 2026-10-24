import { redact } from "./research.ts";

/**
 * Read-only account balance readers for the paid vendors (Usage Console billing check, SEN-70). Each returns USD
 * numbers plus the vendor's raw body, or throws an error that never contains the key or token it was given. Used by the
 * Usage Console API (scheduled snapshots) and by the research usage tracking (balance before/after one call).
 */

/** Default limit for one balance request: short, since a reading must never hold anything up. */
export const BALANCE_TIMEOUT_MS = 5_000;

/** How to make one balance request. */
export type BalanceRequestOptions = {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

/** OpenRouter's usage windows for one key, in USD. */
export type OpenRouterKeyWindows = {
  dailyUsd: number;
  weeklyUsd: number;
  monthlyUsd: number;
  limitUsd: number | null;
  remainingUsd: number | null;
};

/** One reading of a vendor account. Fields a vendor does not report are null. */
export type BalanceReading = {
  /** Prepaid money left, in USD. */
  balanceUsd: number;
  /** Parallel: money held for runs in flight and charges not yet synced, in USD. */
  pendingUsd: number | null;
  /** OpenRouter: all credits ever bought, in USD. */
  creditsTotalUsd: number | null;
  /** OpenRouter: everything the account ever spent, in USD. */
  accountUsageUsd: number | null;
  /** OpenRouter: everything this key ever spent, in USD. */
  keyUsageUsd: number | null;
  /** OpenRouter: this key's usage windows. */
  keyWindows: OpenRouterKeyWindows | null;
  /** The vendor's bodies as received (these endpoints return no secrets). */
  raw: unknown;
};

/**
 * Money Parallel counts against us: what is left plus what is held. A run first holds funds (pending) and the charge
 * later syncs into the credit balance, so the sum only drops once a charge is final. One place, so the console's
 * billing math and per-call measurement agree. The vendor docs do not say whether `credit_balance_cents` already
 * excludes held funds; if it does not, this sum overstates during a hold and the per-call note says "settling".
 * @param reading - A Parallel reading
 * @returns USD
 */
export function parallelFundsUsd(reading: Pick<BalanceReading, "balanceUsd" | "pendingUsd">): number {
  return reading.balanceUsd + (reading.pendingUsd ?? 0);
}

/**
 * A finite number from an unknown JSON value, or null.
 * @param raw - Unknown JSON value
 */
function finite(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

/**
 * GETs one JSON body with a time limit. Any failure becomes an error naming the URL and status, with the secret
 * scrubbed from everything, including the start of an error body.
 * @param where - `[file: fn]` prefix
 * @param url - Endpoint
 * @param headers - Request headers (carry the secret)
 * @param secret - Key or token, scrubbed from messages
 * @param options - fetch and time limit
 * @returns Parsed body
 */
async function getJson(where: string, url: string, headers: Record<string, string>, secret: string, options: BalanceRequestOptions) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? BALANCE_TIMEOUT_MS;
  let response: Response;
  let text: string;
  try {
    response = await fetchImpl(url, { headers: { accept: "application/json", ...headers }, signal: AbortSignal.timeout(timeoutMs) });
    text = await response.text();
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    const message = timedOut ? `No answer within ${timeoutMs} ms` : error instanceof Error ? error.message : String(error);
    throw new Error(redact(`${where} Balance request failed || url=${url} || ${message}`, secret));
  }
  if (!response.ok) {
    throw new Error(redact(`${where} Balance request was refused || url=${url} || status=${response.status} || ${text.slice(0, 200)}`, secret));
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redact(`${where} Balance body is not JSON || url=${url} || ${message}`, secret));
  }
}

/**
 * Throws unless `key` is a non-blank string.
 * @param where - `[file: fn]` prefix
 * @param name - What is missing, for the message
 * @param key - The secret
 */
function requireSecret(where: string, name: string, key: string | undefined): string {
  const trimmed = key?.trim();
  if (!trimmed) throw new Error(`${where} Missing ${name}`);
  return trimmed;
}

/**
 * Reads OpenRouter's account credits (`/credits`) and this key's usage (`/key`) at the same time.
 * @param apiKey - `OPENROUTER_API_KEY`
 * @param options - fetch and time limit
 * @returns Balance = credits bought − account usage; key usage and windows from `/key`
 * @throws Error (key scrubbed) when either request fails or a field is missing
 */
export async function readOpenRouterBalance(apiKey: string | undefined, options: BalanceRequestOptions = {}): Promise<BalanceReading> {
  const where = "[balances.ts: readOpenRouterBalance]";
  const key = requireSecret(where, "OPENROUTER_API_KEY", apiKey);
  const headers = { authorization: `Bearer ${key}` };
  const [credits, keyBody] = await Promise.all([
    getJson(where, "https://openrouter.ai/api/v1/credits", headers, key, options),
    getJson(where, "https://openrouter.ai/api/v1/key", headers, key, options),
  ]);
  const c = (credits as { data?: Record<string, unknown> } | null)?.data ?? {};
  const k = (keyBody as { data?: Record<string, unknown> } | null)?.data ?? {};
  const creditsTotal = finite(c.total_credits);
  const accountUsage = finite(c.total_usage);
  const keyUsage = finite(k.usage);
  if (creditsTotal === null || accountUsage === null || keyUsage === null) {
    throw new Error(`${where} Balance body is missing fields || total_credits=${String(c.total_credits)} || total_usage=${String(c.total_usage)} || usage=${String(k.usage)}`);
  }
  // `/key` also carries the key's label, which is a prefix of the key; keep only the numbers.
  const keyNumbers = {
    usage: k.usage, usage_daily: k.usage_daily, usage_weekly: k.usage_weekly, usage_monthly: k.usage_monthly,
    limit: k.limit, limit_remaining: k.limit_remaining, limit_reset: k.limit_reset, is_free_tier: k.is_free_tier,
  };
  return {
    // The account is shared with other projects, so the balance is our key's own: what is left of its limit. A key with
    // no limit falls back to the account's money left.
    balanceUsd: finite(k.limit_remaining) ?? creditsTotal - accountUsage,
    pendingUsd: null,
    creditsTotalUsd: creditsTotal,
    accountUsageUsd: accountUsage,
    keyUsageUsd: keyUsage,
    keyWindows: {
      dailyUsd: finite(k.usage_daily) ?? 0,
      weeklyUsd: finite(k.usage_weekly) ?? 0,
      monthlyUsd: finite(k.usage_monthly) ?? 0,
      limitUsd: finite(k.limit),
      remainingUsd: finite(k.limit_remaining),
    },
    raw: { credits, key: { data: keyNumbers } },
  };
}

/**
 * Reads the You.com account balance. You.com reports it in cents.
 * @param apiKey - `YOU_DOT_COM_API_KEY`
 * @param options - fetch and time limit
 * @returns The balance in USD
 * @throws Error (key scrubbed) when the request fails or the balance is missing
 */
export async function readYouBalance(apiKey: string | undefined, options: BalanceRequestOptions = {}): Promise<BalanceReading> {
  const where = "[balances.ts: readYouBalance]";
  const key = requireSecret(where, "YOU_DOT_COM_API_KEY", apiKey);
  const body = await getJson(where, "https://api.you.com/v1/billing/account_balance", { "x-api-key": key }, key, options);
  const cents = finite((body as { data?: { attributes?: { balance?: unknown } } } | null)?.data?.attributes?.balance);
  if (cents === null) throw new Error(`${where} Balance body has no data.attributes.balance`);
  return { balanceUsd: cents / 100, pendingUsd: null, creditsTotalUsd: null, accountUsageUsd: null, keyUsageUsd: null, keyWindows: null, raw: body };
}

/**
 * Reads the Parallel organization balance through the Account API. Needs an Account API access token (from
 * `pnpm parallel:login`), not the Task API key.
 * @param accessToken - Account API access token
 * @param options - fetch and time limit
 * @returns Credit balance and held (pending) funds in USD; both are 0 for an invoiced org
 * @throws Error (token scrubbed) when the request fails or the fields are missing
 */
export async function readParallelBalance(accessToken: string | undefined, options: BalanceRequestOptions = {}): Promise<BalanceReading> {
  const where = "[balances.ts: readParallelBalance]";
  const token = requireSecret(where, "Parallel Account API access token", accessToken);
  const body = await getJson(where, "https://api.parallel.ai/account/service/v1/balance", { authorization: `Bearer ${token}` }, token, options);
  const row = (body ?? {}) as Record<string, unknown>;
  const credit = finite(row.credit_balance_cents);
  const pending = finite(row.pending_debit_balance_cents);
  if (credit === null || pending === null) throw new Error(`${where} Balance body is missing credit_balance_cents or pending_debit_balance_cents`);
  return { balanceUsd: credit / 100, pendingUsd: pending / 100, creditsTotalUsd: null, accountUsageUsd: null, keyUsageUsd: null, keyWindows: null, raw: body };
}
