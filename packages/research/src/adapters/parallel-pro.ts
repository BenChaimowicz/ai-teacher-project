import type { ResearchAdapter, ResearchAdapterId, VendorSource } from "../types.ts";
import { optionalString, readVendorJson, stringList } from "./vendor-http.ts";

const BASE_URL = "https://api.parallel.ai/v1/tasks/runs";

/**
 * The Task API processors we run, with the list price per run from docs.parallel.ai/pricing (read 2026-11-01) and a
 * time limit above the documented range. `pro`: measured runs took 4.5 min and 41 s of vendor time (2026-10-08); the
 * docs say 2–10 min. `core`: the docs say 60 s to 5 min, p90 3 min (SEN-120 compares the two).
 */
const PROCESSORS = {
  pro: { id: "parallel-pro", estimatedCostUsd: 0.1, timeoutMs: 10 * 60 * 1000 },
  core: { id: "parallel-core", estimatedCostUsd: 0.025, timeoutMs: 6 * 60 * 1000 },
} as const satisfies Record<string, { id: ResearchAdapterId; estimatedCostUsd: number; timeoutMs: number }>;

/** The parts of a Task API result this adapter reads. */
type TaskResult = {
  run?: { run_id?: unknown; status?: unknown };
  output?: {
    content?: unknown;
    basis?: { citations?: { url?: unknown; title?: unknown; excerpts?: unknown }[] }[];
  };
};

/**
 * Research through Parallel's Task API on one processor. Creates a run, then blocks on its result. Sources come from
 * the citations in `output.basis`.
 * @param processor - Which Task API processor runs the topic
 */
function parallelTaskAdapter(processor: keyof typeof PROCESSORS): ResearchAdapter {
  const { id, estimatedCostUsd, timeoutMs } = PROCESSORS[processor];
  return {
    id,
    envKey: "PARALLEL_PRO_API_KEY",
    estimatedCostUsd,
    timeoutMs,
    async research(topic, { apiKey, fetch, signal }) {
      const where = `[parallel-pro.ts: research ${processor}]`;
      const headers = { "x-api-key": apiKey, "content-type": "application/json" };
      const created = (await readVendorJson(
        await fetch(BASE_URL, {
          method: "POST",
          headers,
          signal,
          body: JSON.stringify({
            input: topic,
            processor,
            task_spec: { output_schema: { type: "text" } },
            enable_events: false,
          }),
        }),
        where,
      )) as { run_id?: unknown };
      const runId = optionalString(created.run_id);
      if (!runId) throw new Error(`${where} Run was created without a run_id`);
      const resultUrl = `${BASE_URL}/${encodeURIComponent(runId)}/result?timeout=${timeoutMs / 1000}`;
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
}

/** Primary research on the `pro` processor: "exploratory web research", $0.10 a run. */
export const parallelProAdapter: ResearchAdapter = parallelTaskAdapter("pro");

/** The `core` processor: "cross-referenced, moderately complex outputs", $0.025 a run (SEN-120). */
export const parallelCoreAdapter: ResearchAdapter = parallelTaskAdapter("core");
