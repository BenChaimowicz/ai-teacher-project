import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parallelFundsUsd, readOpenRouterBalance, readParallelBalance, readYouBalance } from "./balances.ts";

const KEY = "sk-secret-key-123";

/**
 * A fetch that answers by URL and keeps each request's URL and headers.
 * @param answers - URL → [status, body]
 */
function fakeFetch(answers: Record<string, [number, unknown]>) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    seen.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    const answer = answers[url];
    if (!answer) throw new Error(`connect failed for ${url} with key ${KEY}`);
    const [status, body] = answer;
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

describe("readOpenRouterBalance", () => {
  it("uses what is left of our key's limit as the balance, since the account is shared with other projects", async () => {
    const { fetch } = fakeFetch({
      "https://openrouter.ai/api/v1/credits": [200, { data: { total_credits: 50, total_usage: 35.4 } }],
      "https://openrouter.ai/api/v1/key": [200, { data: { usage: 6.8, limit: 25, limit_remaining: 18.2 } }],
    });
    const reading = await readOpenRouterBalance(KEY, { fetch });
    assert.deepEqual([reading.balanceUsd, reading.keyUsageUsd, reading.accountUsageUsd], [18.2, 6.8, 35.4]);
  });

  it("reads account credits and key usage in USD, keeping only the key's numbers", async () => {
    const { fetch, seen } = fakeFetch({
      "https://openrouter.ai/api/v1/credits": [200, { data: { total_credits: 50, total_usage: 34.9475 } }],
      "https://openrouter.ai/api/v1/key": [200, {
        data: { label: "sk-or-v1-abc...xyz", usage: 30.5, usage_daily: 1.25, usage_weekly: 4, usage_monthly: 20, limit: null, limit_remaining: null },
      }],
    });
    const reading = await readOpenRouterBalance(KEY, { fetch });
    assert.equal(Math.round(reading.balanceUsd * 1e4) / 1e4, 15.0525);
    assert.equal(reading.creditsTotalUsd, 50);
    assert.equal(reading.accountUsageUsd, 34.9475);
    assert.equal(reading.keyUsageUsd, 30.5);
    assert.deepEqual(reading.keyWindows, { dailyUsd: 1.25, weeklyUsd: 4, monthlyUsd: 20, limitUsd: null, remainingUsd: null });
    assert.doesNotMatch(JSON.stringify(reading.raw), /sk-or-v1/);
    assert.equal(seen[0]!.headers.authorization, `Bearer ${KEY}`);
  });
});

describe("readYouBalance", () => {
  it("converts cents to dollars", async () => {
    const { fetch, seen } = fakeFetch({
      "https://api.you.com/v1/billing/account_balance": [200, { data: { type: "account", id: "a1", attributes: { balance: 8835.0 } } }],
    });
    const reading = await readYouBalance(KEY, { fetch });
    assert.equal(reading.balanceUsd, 88.35);
    assert.equal(seen[0]!.headers["x-api-key"], KEY);
  });

  it("never puts the key in an error, even when the vendor echoes it", async () => {
    const { fetch } = fakeFetch({ "https://api.you.com/v1/billing/account_balance": [401, `bad key ${KEY}`] });
    await assert.rejects(readYouBalance(KEY, { fetch }), (error: Error) => {
      assert.match(error.message, /\[balances\.ts: readYouBalance\].*status=401/);
      assert.doesNotMatch(error.message, new RegExp(KEY));
      return true;
    });
  });

  it("never puts the key in a network error", async () => {
    const { fetch } = fakeFetch({});
    await assert.rejects(readYouBalance(KEY, { fetch }), (error: Error) => !error.message.includes(KEY));
  });

  it("fails clearly when the balance is missing or the key is blank", async () => {
    const { fetch } = fakeFetch({ "https://api.you.com/v1/billing/account_balance": [200, { data: {} }] });
    await assert.rejects(readYouBalance(KEY, { fetch }), /no data\.attributes\.balance/);
    await assert.rejects(readYouBalance("  ", { fetch }), /Missing YOU_DOT_COM_API_KEY/);
  });

  it("gives up after its time limit", async () => {
    const fetch = ((_url: string, init?: RequestInit) => new Promise((_resolve, reject) => {
      // AbortSignal.timeout does not keep the process alive; this stands in for the open socket that would.
      const socket = setInterval(() => undefined, 1_000);
      init?.signal?.addEventListener("abort", () => {
        clearInterval(socket);
        reject(init.signal!.reason);
      });
    })) as typeof globalThis.fetch;
    await assert.rejects(readYouBalance(KEY, { fetch, timeoutMs: 20 }), /No answer within 20 ms/);
  });
});

describe("readParallelBalance", () => {
  it("converts credit and pending cents to dollars; funds are their sum", async () => {
    const { fetch, seen } = fakeFetch({
      "https://api.parallel.ai/account/service/v1/balance": [200, { org_id: "o", credit_balance_cents: 1234, pending_debit_balance_cents: 10, will_invoice: false }],
    });
    const reading = await readParallelBalance("token-xyz", { fetch });
    assert.equal(reading.balanceUsd, 12.34);
    assert.equal(reading.pendingUsd, 0.1);
    assert.equal(parallelFundsUsd(reading), 12.44);
    assert.equal(seen[0]!.headers.authorization, "Bearer token-xyz");
  });

  it("never puts the token in an error", async () => {
    const { fetch } = fakeFetch({ "https://api.parallel.ai/account/service/v1/balance": [401, "invalid token token-xyz"] });
    await assert.rejects(readParallelBalance("token-xyz", { fetch }), (error: Error) => !error.message.includes("token-xyz"));
  });
});
