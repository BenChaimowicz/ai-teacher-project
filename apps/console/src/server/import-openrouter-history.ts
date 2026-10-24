import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb, loadRootEnv, openrouterActivity, openrouterKeys, type Database } from "@senoy/db";

/** One key as OpenRouter's management API lists it. */
export type OpenRouterKey = {
  hash: string;
  name: string;
  label?: string | null;
  usage: number;
  limit?: number | null;
  disabled?: boolean;
  created_at?: string | null;
};

/** One activity row: a day, model, and endpoint, as `GET /api/v1/activity` returns it. */
export type OpenRouterActivityRow = {
  date: string;
  model: string;
  model_permaslug?: string | null;
  endpoint_id: string;
  provider_name?: string | null;
  requests: number;
  usage: number;
  byok_usage_inference?: number | null;
  byok_requests?: number | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  reasoning_tokens?: number | null;
  cached_tokens?: number | null;
};

/**
 * OpenRouter's SHA-256 of an API key, the form its management API filters by.
 * @param apiKey - The key
 */
export function keyHash(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

/**
 * Turns one activity row into our table's row. OpenRouter dates look like `2026-10-21 00:00:00`; only the day is kept.
 * @param row - OpenRouter's row
 * @param hash - The key it was filtered by
 * @param fetchedAt - When the import ran
 */
export function activityRow(row: OpenRouterActivityRow, hash: string, fetchedAt: Date): typeof openrouterActivity.$inferInsert {
  return {
    day: row.date.slice(0, 10),
    keyHash: hash,
    model: row.model,
    modelPermaslug: row.model_permaslug ?? null,
    endpointId: row.endpoint_id,
    providerName: row.provider_name ?? null,
    requests: row.requests,
    usageUsd: row.usage,
    byokUsageUsd: row.byok_usage_inference ?? null,
    byokRequests: row.byok_requests ?? null,
    promptTokens: row.prompt_tokens ?? null,
    completionTokens: row.completion_tokens ?? null,
    reasoningTokens: row.reasoning_tokens ?? null,
    cachedTokens: row.cached_tokens ?? null,
    fetchedAt,
  };
}

/**
 * GETs one management-API path.
 * @param path - e.g. `/keys`
 * @param managementKey - The management key; never logged
 * @returns The `data` array
 * @throws Error without the key when the call fails
 */
async function getData<T>(path: string, managementKey: string): Promise<T[]> {
  try {
    const response = await fetch(`https://openrouter.ai/api/v1${path}`, {
      headers: { Authorization: `Bearer ${managementKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`status=${response.status}`);
    const body = (await response.json()) as { data?: T[] };
    if (!Array.isArray(body.data)) throw new Error("no data array");
    return body.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[import-openrouter-history: getData] OpenRouter request failed || path=${path.split("?")[0]} || ${message}`);
  }
}

/**
 * Imports every key on the account and each key's daily activity (the last 30 completed UTC days) into
 * `openrouter_keys` and `openrouter_activity`, updating rows already there. Per-key activity adds up to the account's,
 * so nothing is lost by storing it per key; the import checks that and reports any difference.
 * @param db - Database
 * @param managementKey - An OpenRouter management key
 * @param platformKey - `OPENROUTER_API_KEY`, to mark which key is the platform's
 * @param log - Progress lines
 */
export async function importOpenRouterHistory(db: Database, managementKey: string, platformKey: string | undefined, log: (line: string) => void) {
  const fetchedAt = new Date();
  const platformHash = platformKey ? keyHash(platformKey) : null;
  const keys = await getData<OpenRouterKey>("/keys?include_disabled=true", managementKey);
  for (const key of keys) {
    const row = {
      hash: key.hash,
      name: key.name,
      label: key.label ?? null,
      isPlatformKey: key.hash === platformHash,
      usageUsd: key.usage,
      limitUsd: key.limit ?? null,
      disabled: key.disabled ?? false,
      createdAt: key.created_at ? new Date(key.created_at) : null,
      fetchedAt,
    };
    await db.insert(openrouterKeys).values(row).onConflictDoUpdate({ target: openrouterKeys.hash, set: row });
    log(`key ${key.name}${row.isPlatformKey ? " (platform)" : ""} · lifetime $${key.usage.toFixed(4)}`);
  }

  let perKeyTotal = 0;
  let saved = 0;
  for (const key of keys) {
    const rows = await getData<OpenRouterActivityRow>(`/activity?api_key_hash=${key.hash}`, managementKey);
    for (const raw of rows) {
      const row = activityRow(raw, key.hash, fetchedAt);
      await db.insert(openrouterActivity).values(row).onConflictDoUpdate({
        target: [openrouterActivity.day, openrouterActivity.keyHash, openrouterActivity.endpointId],
        set: row,
      });
      perKeyTotal += raw.usage;
      saved += 1;
    }
    log(`activity ${key.name} · ${rows.length} rows · $${rows.reduce((sum, raw) => sum + raw.usage, 0).toFixed(4)}`);
  }

  const accountTotal = (await getData<OpenRouterActivityRow>("/activity", managementKey)).reduce((sum, raw) => sum + raw.usage, 0);
  const [stored] = (await db.execute(sql`select count(*)::int as rows, min(day)::text as first, max(day)::text as last from openrouter_activity`)) as unknown as {
    rows: number; first: string | null; last: string | null;
  }[];
  log(`account activity $${accountTotal.toFixed(4)} · per-key sum $${perKeyTotal.toFixed(4)} · difference $${(accountTotal - perKeyTotal).toFixed(4)}`);
  log(`stored ${stored?.rows ?? 0} activity rows, ${stored?.first ?? "—"} → ${stored?.last ?? "—"}`);
  return { keys: keys.length, saved, accountTotal, perKeyTotal };
}

/** Runs the import against the configured database when this file is executed directly. */
async function main() {
  loadRootEnv(import.meta.url, 4);
  const url = process.env.DATABASE_URL;
  const managementKey = process.env.OPEN_ROUTER_MANAGEMENT_API_KEY?.trim();
  if (!url || !managementKey) {
    throw new Error("[import-openrouter-history: main] DATABASE_URL and OPEN_ROUTER_MANAGEMENT_API_KEY are required");
  }
  const db = createDb(url, { max: 1 });
  await importOpenRouterHistory(db, managementKey, process.env.OPENROUTER_API_KEY?.trim(), (line) => process.stdout.write(`${line}\n`));
  process.exit(0);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("import-openrouter-history.ts")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
