import type { ResearchAdapter, VendorSource } from "../types.ts";
import { optionalString, readVendorJson, stringList } from "./vendor-http.ts";

/** The docs give no latency for a search; one answers in a few seconds. */
const TIMEOUT_MS = 60 * 1000;

/** Results asked for per search; the API allows 1–100. */
const RESULT_COUNT = 10;

/** Highlight budget shared across all results, within the API's 1,024–8,192 range. */
const HIGHLIGHT_TOKENS = 4096;

/** The parts of a Web Search API response this adapter reads. */
type SearchResponse = {
  results?: {
    web?: { url?: unknown; title?: unknown; description?: unknown; snippets?: unknown; contents?: { highlights?: unknown } }[];
  };
  metadata?: { search_uuid?: unknown };
};

/** What a search may add to its results. */
export type YouSearchOptions = {
  /**
   * Ask for highlighted passages pulled from the pages, within the shared token budget. The API refuses
   * `extraction_source` with highlights, so its default applies: cached pages are free and a page crawled live costs
   * $0.001 (you.com/docs/administration/billing, 2026-11-01), at most a cent on top of the $0.005 call.
   */
  highlights?: boolean;
};

/** The call, plus every result crawled live: the upper bound a highlights search can cost. */
const HIGHLIGHTS_COST_USD = 0.005 + RESULT_COUNT * 0.001;

/**
 * One You.com Web Search: the top results with their snippets, or their cached highlights when asked. $0.005 a call,
 * a tenth of a Research call, which is why SEN-120 compares it for the Starting Level fact-check.
 * @param options - Whether to ask for cached highlights
 */
export function createYouSearchAdapter(options: YouSearchOptions = {}): ResearchAdapter {
  return {
    id: "you-search",
    envKey: "YOU_DOT_COM_API_KEY",
    estimatedCostUsd: options.highlights ? HIGHLIGHTS_COST_USD : 0.005,
    timeoutMs: TIMEOUT_MS,
    async research(topic, { apiKey, fetch, signal }) {
      const response = await fetch("https://ydc-index.io/v1/search", {
        method: "POST",
        headers: { "x-api-key": apiKey, "content-type": "application/json" },
        signal,
        body: JSON.stringify({
          query: topic,
          count: RESULT_COUNT,
          ...(options.highlights
            ? { extraction: { extraction_mode: "highlights", highlights: { total_max_tokens: HIGHLIGHT_TOKENS } } }
            : {}),
        }),
      });
      const body = (await readVendorJson(response, "[you-search.ts: research]")) as SearchResponse;
      const sources: VendorSource[] = [];
      for (const result of body.results?.web ?? []) {
        const url = optionalString(result.url);
        if (!url) continue;
        const highlights = stringList(result.contents?.highlights);
        const snippets = stringList(result.snippets);
        const description = optionalString(result.description);
        const excerpts = highlights.length ? highlights : snippets.length ? snippets : description ? [description] : [];
        sources.push({ url, title: optionalString(result.title), excerpts });
      }
      return { sources, summary: null, requestId: optionalString(body.metadata?.search_uuid) };
    },
  };
}

/** The plain search: snippets only. */
export const youSearchAdapter: ResearchAdapter = createYouSearchAdapter();
