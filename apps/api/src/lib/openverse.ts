import type { CommonsRejection } from "./commons.ts";
import { recordUsage, type UsageRecordRow } from "./usage-tracking.ts";

/**
 * Openverse as a second search index for a visual the library lacks (SEN-132). It indexes Commons, Flickr's CC photos,
 * and museum collections, and matches words Commons' own search does not ("Drumstick mached grip"). It is only used to
 * *find* a file: a hit on Commons comes back as its page id, and the licence is read off the file's own Commons page,
 * like any Commons search hit. A hit anywhere else is turned down, since no other source's page can be checked yet
 * (decision 2026-11-04). Every search is a Usage Record (vendor `openverse`, role `media_search`, cost 0).
 */

/** The Openverse image search endpoint. */
export const OPENVERSE_API_URL = "https://api.openverse.org/v1/images/";

/** Results one search returns. Twenty, as for Commons, leaves room for the non-Commons hits that are turned down. */
export const OPENVERSE_PAGE_SIZE = 20;

/**
 * Openverse asks for no contact, so the product names itself without one. Anonymous use allows 20 searches a minute
 * and 200 a day, which a remembered search route (SEN-132) keeps well clear of.
 */
export const OPENVERSE_USER_AGENT = "Knibbler/1.0 (media search)";

/** How long one Openverse search may take. */
const OPENVERSE_TIMEOUT_MS = 20_000;

/**
 * The search URL: images under a licence that allows commercial use and modification, which leaves out NC and ND
 * before any page is read. The licence is still checked on each file's own page.
 * @param query - The keywords
 */
export function openverseSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query, license_type: "commercial,modification", page_size: String(OPENVERSE_PAGE_SIZE) });
  return `${OPENVERSE_API_URL}?${params}`;
}

/** A Commons file an Openverse search found, to be read from Commons by its page id. */
export type OpenverseHit = {
  pageId: number;
  title: string;
  /** Position in Openverse's relevance order, from 1. */
  rank: number;
};

/** What one Openverse search found on Commons and turned down, and the error when the call failed. */
export type OpenverseSearchResult = { query: string; hits: OpenverseHit[]; rejected: CommonsRejection[]; error: string | null };

/** One result in an Openverse reply, as far as this module reads it. */
type OpenverseResult = { title?: unknown; source?: unknown; foreign_landing_url?: unknown };

/**
 * The Commons page id in a landing URL such as `https://commons.wikimedia.org/w/index.php?curid=513833`, or null.
 * @param landingUrl - The result's `foreign_landing_url`
 */
export function commonsPageIdOf(landingUrl: unknown): number | null {
  if (typeof landingUrl !== "string") return null;
  let url: URL;
  try {
    url = new URL(landingUrl);
  } catch {
    return null;
  }
  if (url.hostname !== "commons.wikimedia.org") return null;
  const curid = url.searchParams.get("curid");
  return curid && /^\d+$/.test(curid) ? Number(curid) : null;
}

/**
 * The Commons files in one Openverse reply, in relevance order; every other result is turned down with why.
 * @param query - The keywords, for the result
 * @param body - The parsed reply
 */
export function parseOpenverseSearch(query: string, body: unknown): Omit<OpenverseSearchResult, "error"> {
  const results = (body as { results?: OpenverseResult[] } | null)?.results ?? [];
  const hits: OpenverseHit[] = [];
  const rejected: CommonsRejection[] = [];
  for (const [position, result] of results.entries()) {
    const title = typeof result.title === "string" && result.title.trim() ? result.title.trim() : `Openverse result ${position + 1}`;
    const source = typeof result.source === "string" ? result.source : "an unknown source";
    if (source !== "wikimedia") {
      rejected.push({ title, reason: `Openverse found it on ${source}, where its licence cannot be checked on its own page yet.` });
      continue;
    }
    const pageId = commonsPageIdOf(result.foreign_landing_url);
    if (pageId === null) { rejected.push({ title, reason: "Openverse gave no Commons page id to read its licence from." }); continue; }
    hits.push({ pageId, title, rank: position + 1 });
  }
  return { query, hits, rejected };
}

/** Fields every Openverse Usage Record shares. */
const OPENVERSE_USAGE: Pick<UsageRecordRow, "vendor" | "role" | "provider" | "attempt" | "invalidCause" | "promptTokens" | "completionTokens" | "reasoningTokens" | "cachedTokens" | "costUsd" | "costBasis" | "modelId" | "responseId"> = {
  vendor: "openverse", role: "media_search", provider: null, attempt: 1, invalidCause: null, modelId: "openverse-search", responseId: null,
  promptTokens: null, completionTokens: null, reasoningTokens: null, cachedTokens: null, costUsd: 0, costBasis: "actual",
};

/**
 * Runs one Openverse search and records it. A failed call, such as a throttled one, finds nothing rather than throwing,
 * as for Commons: the failure is on the Usage Record and in the result.
 * @param fetch - The fetch to use
 * @param query - The keywords
 */
export async function searchOpenverse(fetch: typeof globalThis.fetch, query: string): Promise<OpenverseSearchResult> {
  const url = openverseSearchUrl(query);
  const startedAt = performance.now();
  const record = (row: Pick<UsageRecordRow, "outcome" | "httpStatus" | "error" | "response">) => recordUsage({
    ...OPENVERSE_USAGE, ...row, request: { query, url }, durationMs: Math.round(performance.now() - startedAt),
  });

  let response: Response;
  try {
    response = await fetch(url, { headers: { "User-Agent": OPENVERSE_USER_AGENT, accept: "application/json" }, signal: AbortSignal.timeout(OPENVERSE_TIMEOUT_MS) });
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    const message = `[openverse.ts: searchOpenverse] Openverse search failed || query=${query} || ${error instanceof Error ? error.message : String(error)}`;
    await record({ outcome: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network", httpStatus: null, error: message, response: null });
    return { query, hits: [], rejected: [], error: message };
  }

  const text = await response.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // A plain-text reply is reported below.
  }
  if (!response.ok || body === null || !Array.isArray((body as { results?: unknown }).results)) {
    const message = `[openverse.ts: searchOpenverse] Openverse refused the search || query=${query} || status ${response.status}: ${text.slice(0, 200)}`;
    await record({ outcome: response.ok ? "error" : "http", httpStatus: response.status, error: message, response: body ?? text.slice(0, 2000) });
    return { query, hits: [], rejected: [], error: message };
  }

  const result = parseOpenverseSearch(query, body);
  await record({ outcome: result.hits.length || result.rejected.length ? "ok" : "empty_vendor", httpStatus: response.status, error: null, response: body });
  return { ...result, error: null };
}
