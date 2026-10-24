import { sql } from "drizzle-orm";
import type { OpsOpenRouterActivityRow, OpsOpenRouterHistory, OpsOpenRouterSlice } from "@senoy/db/usage";
import type { SqlRunner } from "./ops-store.ts";

/** Reads everything imported for the platform's own OpenRouter key. */
export type OpenRouterHistoryReader = () => Promise<OpsOpenRouterHistory>;

/** One row as the SQL runner returns it. */
type Row = Record<string, unknown>;

/**
 * A number from a SQL value (Postgres sums arrive as strings).
 * @param value - Raw value
 */
function num(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

/**
 * An ISO string from a SQL timestamp, or null.
 * @param value - Raw value (`Date` or Postgres text such as `2026-10-24 15:42:12.5+00`)
 */
export function isoOrNull(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value).replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00"));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Maps a grouped row (`key`, `requests`, `usage`, token sums) to a slice.
 * @param row - Grouped row
 */
export function toSlice(row: Row): OpsOpenRouterSlice {
  return {
    key: String(row.key ?? "unknown"),
    requests: num(row.requests),
    usageUsd: num(row.usage),
    promptTokens: num(row.prompt),
    completionTokens: num(row.completion),
    reasoningTokens: num(row.reasoning),
  };
}

/** Sums every slice shares. */
const SLICE_SUMS = sql`sum(a.requests) as requests, sum(a.usage_usd) as usage, sum(coalesce(a.prompt_tokens, 0)) as prompt,
  sum(coalesce(a.completion_tokens, 0)) as completion, sum(coalesce(a.reasoning_tokens, 0)) as reasoning`;

/** Only the platform's key; other keys on the shared account belong to other projects. */
const PLATFORM = sql`a.key_hash in (select hash from openrouter_keys where is_platform_key)`;

/**
 * Creates the reader behind `GET /api/ops/openrouter-history`. Queries run one after another, because the Supabase
 * pooler stalls on concurrent queries over one connection (see billing).
 * @param run - SQL runner
 */
export function createOpenRouterHistoryReader(run: SqlRunner): OpenRouterHistoryReader {
  return async () => {
    try {
      const [key] = await run(sql`select name, label, usage_usd as "usageUsd", limit_usd as "limitUsd", created_at as "createdAt",
        fetched_at as "fetchedAt" from openrouter_keys where is_platform_key limit 1`);
      const [totals] = await run(sql`select ${SLICE_SUMS}, sum(coalesce(a.cached_tokens, 0)) as cached, min(a.day)::text as first,
        max(a.day)::text as last from openrouter_activity a where ${PLATFORM}`);
      const byDay = await run(sql`with reported as (
          select a.day, sum(a.usage_usd) as usage, sum(a.requests) as requests from openrouter_activity a where ${PLATFORM} group by a.day
        ), recorded as (
          select (u.created_at at time zone 'UTC')::date as day, sum(u.cost_usd) as usd, count(*) as calls
          from usage_records u where u.vendor = 'openrouter' and u.origin = 'captured' group by 1
        )
        select coalesce(r.day, c.day)::text as day, coalesce(r.usage, 0) as usage, coalesce(r.requests, 0) as requests,
          coalesce(c.usd, 0) as "recordedUsd", coalesce(c.calls, 0) as "recordedCalls"
        from reported r full join recorded c on c.day = r.day order by 1`);
      const byModel = await run(sql`select a.model as key, ${SLICE_SUMS} from openrouter_activity a where ${PLATFORM} group by 1 order by usage desc`);
      const byProvider = await run(sql`select coalesce(a.provider_name, 'unknown') as key, ${SLICE_SUMS} from openrouter_activity a
        where ${PLATFORM} group by 1 order by usage desc`);
      const rows = await run(sql`select a.day::text as day, a.model, a.provider_name as "providerName", a.requests, a.usage_usd as usage,
        a.prompt_tokens as prompt, a.completion_tokens as completion, a.reasoning_tokens as reasoning, a.cached_tokens as cached
        from openrouter_activity a where ${PLATFORM} order by a.day desc, a.usage_usd desc`);
      return {
        key: key
          ? {
              name: String(key.name),
              label: key.label == null ? null : String(key.label),
              usageUsd: num(key.usageUsd),
              limitUsd: key.limitUsd == null ? null : num(key.limitUsd),
              createdAt: isoOrNull(key.createdAt),
              fetchedAt: isoOrNull(key.fetchedAt) ?? "",
            }
          : null,
        totals: {
          usageUsd: num(totals?.usage),
          requests: num(totals?.requests),
          promptTokens: num(totals?.prompt),
          completionTokens: num(totals?.completion),
          reasoningTokens: num(totals?.reasoning),
          cachedTokens: num(totals?.cached),
          firstDay: totals?.first == null ? null : String(totals.first),
          lastDay: totals?.last == null ? null : String(totals.last),
        },
        byDay: byDay.map((row) => ({
          day: String(row.day),
          usageUsd: num(row.usage),
          requests: num(row.requests),
          recordedUsd: num(row.recordedUsd),
          recordedCalls: num(row.recordedCalls),
        })),
        byModel: byModel.map(toSlice),
        byProvider: byProvider.map(toSlice),
        rows: rows.map((row): OpsOpenRouterActivityRow => ({
          day: String(row.day),
          model: String(row.model),
          providerName: row.providerName == null ? null : String(row.providerName),
          requests: num(row.requests),
          usageUsd: num(row.usage),
          promptTokens: num(row.prompt),
          completionTokens: num(row.completion),
          reasoningTokens: num(row.reasoning),
          cachedTokens: num(row.cached),
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[openrouter-history.ts: createOpenRouterHistoryReader] Reading OpenRouter history failed || ${message}`);
    }
  };
}
