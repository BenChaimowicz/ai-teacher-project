import type { ResearchAdapter, ResearchAdapterId, VendorSource } from "../types.ts";
import { optionalString, readVendorJson, stringList } from "./vendor-http.ts";

/**
 * The Research API efforts we call, with the list price per call from you.com/docs/administration/billing (read
 * 2026-11-01) and a time limit above the documented latency. `standard`: a measured call took 14 s (2026-10-08); the
 * docs say 10–30 s. `lite`: the docs say under 10 s (SEN-120 compares the two for the fact-check).
 */
const EFFORTS = {
  standard: { id: "you-research", estimatedCostUsd: 0.05, timeoutMs: 2 * 60 * 1000 },
  lite: { id: "you-research-lite", estimatedCostUsd: 0.012, timeoutMs: 60 * 1000 },
} as const satisfies Record<string, { id: ResearchAdapterId; estimatedCostUsd: number; timeoutMs: number }>;

/** The parts of a Research API response this adapter reads. */
type ResearchResponse = {
  output?: {
    content?: unknown;
    sources?: { url?: unknown; title?: unknown; snippets?: unknown }[];
  };
};

/**
 * Research through You.com's Research API at one effort. One synchronous call.
 * @param effort - The `research_effort` sent
 */
function youResearch(effort: keyof typeof EFFORTS): ResearchAdapter {
  const { id, estimatedCostUsd, timeoutMs } = EFFORTS[effort];
  return {
    id,
    envKey: "YOU_DOT_COM_API_KEY",
    estimatedCostUsd,
    timeoutMs,
    async research(topic, { apiKey, fetch, signal }) {
      const response = await fetch("https://api.you.com/v1/research", {
        method: "POST",
        headers: { "x-api-key": apiKey, "content-type": "application/json" },
        signal,
        body: JSON.stringify({ input: topic, research_effort: effort }),
      });
      const requestId = response.headers.get("x-request-id");
      const body = (await readVendorJson(response, `[you-research.ts: research ${effort}]`)) as ResearchResponse;
      const sources: VendorSource[] = [];
      for (const source of body.output?.sources ?? []) {
        const url = optionalString(source.url);
        if (url) sources.push({ url, title: optionalString(source.title), excerpts: stringList(source.snippets) });
      }
      return { sources, summary: optionalString(body.output?.content), requestId };
    },
  };
}

/** Secondary research at `standard` effort, $0.05 a call; also the fact-check's search until SEN-120 decides. */
export const youResearchAdapter: ResearchAdapter = youResearch("standard");

/** The `lite` effort, $0.012 a call (SEN-120). */
export const youResearchLiteAdapter: ResearchAdapter = youResearch("lite");
