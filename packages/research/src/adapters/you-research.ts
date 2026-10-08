import type { ResearchAdapter, VendorSource } from "../types.ts";
import { optionalString, readVendorJson, stringList } from "./vendor-http.ts";

/** A measured `standard` call took 14 s (2026-10-08); the docs say 10–30 s. */
const TIMEOUT_MS = 2 * 60 * 1000;

/** The parts of a Research API response this adapter reads. */
type ResearchResponse = {
  output?: {
    content?: unknown;
    sources?: { url?: unknown; title?: unknown; snippets?: unknown }[];
  };
};

/** Secondary research through You.com's Research API at `standard` effort. One synchronous call. */
export const youResearchAdapter: ResearchAdapter = {
  id: "you-research",
  envKey: "YOU_DOT_COM_API_KEY",
  estimatedCostUsd: 0.05,
  timeoutMs: TIMEOUT_MS,
  async research(topic, { apiKey, fetch, signal }) {
    const response = await fetch("https://api.you.com/v1/research", {
      method: "POST",
      headers: { "x-api-key": apiKey, "content-type": "application/json" },
      signal,
      body: JSON.stringify({ input: topic, research_effort: "standard" }),
    });
    const requestId = response.headers.get("x-request-id");
    const body = (await readVendorJson(response, "[you-research.ts: research]")) as ResearchResponse;
    const sources: VendorSource[] = [];
    for (const source of body.output?.sources ?? []) {
      const url = optionalString(source.url);
      if (url) sources.push({ url, title: optionalString(source.title), excerpts: stringList(source.snippets) });
    }
    return { sources, summary: optionalString(body.output?.content), requestId };
  },
};
