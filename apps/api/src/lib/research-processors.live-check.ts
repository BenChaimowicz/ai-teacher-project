import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv } from "@senoy/db";
import { parallelCoreAdapter, parallelProAdapter, redact, runResearch, type SourcePack } from "@senoy/research";
import { withLiveCheckTracking } from "./live-check-tracking.ts";
import { trackResearchRun } from "./usage-tracking.ts";

/** The research queries the 2026-11-01 test Courses sent for one Reading each (SEN-119), verbatim. */
const TOPICS = [
  {
    course: "Gram staining",
    query: "Gram Staining: Theory, Procedure, and Microscopy (Microbiology lab fundamentals). Relate Gram‑stain results to cell‑envelope structure and describe the staining procedure and microscopic observation. Covers: Relate bacterial cell‑envelope structure (peptidoglycan thickness, outer membrane) to retention of the primary stain.; Recall the standard order of the four main Gram‑stain reagents.; Explain the optical purpose of immersion oil when viewing bacteria under high magnification.; Translate a written microscopic observation into standard cell‑shape and arrangement terms.; Recognize the limits of identifying bacteria from a Gram‑stained field..",
  },
  {
    course: "Norse mythology",
    query: "Sources, Yggdrasil, and the Nine Worlds (Norse mythology). Describe how the main surviving written sources present the world tree, Yggdrasil, and the dwellings of gods and humans. Covers: Recognize the historical context of the Poetic Edda, the Prose Edda, and skaldic poetry as primary sources for Norse myth.; Explain the basic cosmic role of Yggdrasil as the world tree that connects and sustains the realms.; Distinguish Midgard as the dwelling of humans from Asgard as a major dwelling of the gods.; Approach diagrams of the Nine Worlds with caution, acknowledging that the sources do not give a single fixed spatial arrangement..",
  },
];

/**
 * What one pack came back with, for the comparison.
 * @param pack - A Source pack
 */
function summarize(pack: SourcePack) {
  const excerpts = pack.sources.flatMap((source) => source.excerpts);
  return {
    adapter: pack.adapter,
    status: pack.status,
    seconds: Math.round(pack.latencyMs / 1000),
    estimatedCostUsd: pack.estimatedCostUsd,
    sources: pack.sources.length,
    preferred: pack.sources.filter((source) => source.preferred).length,
    filteredOut: pack.filteredOut.length,
    excerpts: excerpts.length,
    excerptChars: excerpts.reduce((sum, excerpt) => sum + excerpt.text.length, 0),
    hosts: [...new Set(pack.sources.map((source) => source.host))],
    error: pack.error,
  };
}

/**
 * Researches two real Reading topics on Parallel's `core` and `pro` processors at once, through the same Host policy,
 * and writes both packs per topic to JSON so the two can be compared on Sources, excerpts and time (SEN-120). Costs
 * about $0.25. Not part of `pnpm test`. Optional argument: output path relative to the repo root.
 */
async function checkResearchProcessors() {
  const root = loadRootEnv(import.meta.url, 4);
  const outPath = resolve(root, process.argv[2] ?? "docs/research/sen-120-research-processors-run.json");
  const apiKey = process.env.PARALLEL_PRO_API_KEY;
  assert.ok(apiKey, "PARALLEL_PRO_API_KEY is required for the research processors live check.");
  try {
    const runs = [];
    for (const topic of TOPICS) {
      process.stdout.write(`Researching "${topic.course}" on ${parallelCoreAdapter.id} and ${parallelProAdapter.id}…\n`);
      const packs = await runResearch(topic.query, { primary: parallelCoreAdapter, secondary: parallelProAdapter, env: process.env, ...trackResearchRun() });
      for (const pack of packs) {
        const summary = summarize(pack);
        process.stdout.write(
          `  ${summary.adapter}: ${summary.status} · ${summary.seconds} s · ~$${summary.estimatedCostUsd.toFixed(3)}` +
            ` · ${summary.sources} Sources (${summary.preferred} preferred, ${summary.filteredOut} filtered)` +
            ` · ${summary.excerpts} excerpts, ${summary.excerptChars} chars\n    hosts: ${summary.hosts.join(", ") || "none"}\n`,
        );
        if (summary.error) process.stdout.write(`    error: ${redact(summary.error, apiKey)}\n`);
      }
      runs.push({ ...topic, summaries: packs.map(summarize), packs });
    }
    const json = `${JSON.stringify({ checkedAt: new Date().toISOString(), runs }, null, 2)}\n`;
    assert.ok(!json.includes(apiKey), "The run contains the Parallel key.");
    await writeFile(outPath, json);
    process.stdout.write(`Wrote ${outPath}\nResearch processors live check passed.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redact(`[research-processors.live-check.ts: checkResearchProcessors] Live check failed || outPath=${outPath} || ${message}`, apiKey));
  }
}

await withLiveCheckTracking("check:research-processors:live", checkResearchProcessors);
