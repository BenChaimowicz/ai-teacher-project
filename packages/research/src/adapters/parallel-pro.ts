import type { ResearchAdapter, VendorSource } from "../types.ts";
import { optionalString, readVendorJson, stringList } from "./vendor-http.ts";

const BASE_URL = "https://api.parallel.ai/v1/tasks/runs";

/** Measured `pro` runs took 4.5 min and 41 s of vendor time (2026-10-08); the docs say 2–10 min. */
const TIMEOUT_MS = 10 * 60 * 1000;

/** The parts of a Task API result this adapter reads. */
type TaskResult = {
  run?: { run_id?: unknown; status?: unknown };
  output?: {
    content?: unknown;
    basis?: { citations?: { url?: unknown; title?: unknown; excerpts?: unknown }[] }[];
  };
};

/**
 * Primary research through Parallel's Task API, `pro` processor.
 * Creates a run, then blocks on its result. Sources come from the citations in `output.basis`.
 */
export const parallelProAdapter: ResearchAdapter = {
  id: "parallel-pro",
  envKey: "PARALLEL_PRO_API_KEY",
  estimatedCostUsd: 0.1,
  timeoutMs: TIMEOUT_MS,
  async research(topic, { apiKey, fetch, signal }) {
    const where = "[parallel-pro.ts: research]";
    const headers = { "x-api-key": apiKey, "content-type": "application/json" };
    const created = (await readVendorJson(
      await fetch(BASE_URL, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          input: topic,
          processor: "pro",
          task_spec: { output_schema: { type: "text" } },
          enable_events: false,
        }),
      }),
      where,
    )) as { run_id?: unknown };
    const runId = optionalString(created.run_id);
    if (!runId) throw new Error(`${where} Run was created without a run_id`);
    const resultUrl = `${BASE_URL}/${encodeURIComponent(runId)}/result?timeout=${TIMEOUT_MS / 1000}`;
    const result = (await readVendorJson(await fetch(resultUrl, { headers, signal }), where)) as TaskResult;
    if (result.run?.status !== "completed") {
      throw new Error(`${where} Run did not complete || runId=${runId} || status=${String(result.run?.status)}`);
    }
    const sources: VendorSource[] = [];
    for (const field of result.output?.basis ?? []) {
      for (const citation of field.citations ?? []) {
        const url = optionalString(citation.url);
        if (url) sources.push({ url, title: optionalString(citation.title), excerpts: stringList(citation.excerpts) });
      }
    }
    return { sources, summary: optionalString(result.output?.content), requestId: runId };
  },
};
