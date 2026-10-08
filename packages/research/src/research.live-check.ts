import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv } from "@senoy/db";
import { researchAdaptersFromEnv } from "./adapters/index.ts";
import { runResearch } from "./research.ts";

/** The one fixed Norse-mythology Lesson topic SEN-36 researches. */
const NORSE_LESSON_TOPIC = "Yggdrasil and the Nine Worlds in Norse cosmology";

/**
 * Makes the real Primary and Secondary research calls, writes both Source packs to JSON,
 * then checks them. Costs about $0.15 and takes several minutes. Not part of `pnpm test`.
 * Optional first argument: output path relative to the repo root.
 */
async function checkResearch() {
  const root = loadRootEnv(import.meta.url, 3);
  const outPath = resolve(root, process.argv[2] ?? "docs/research/sen-36-norse-source-packs.json");
  try {
    const adapters = researchAdaptersFromEnv(process.env);
    process.stdout.write(`Researching "${NORSE_LESSON_TOPIC}" with ${adapters.primary.id} + ${adapters.secondary.id}…\n`);
    const packs = await runResearch(NORSE_LESSON_TOPIC, { ...adapters, env: process.env });
    const json = `${JSON.stringify(packs, null, 2)}\n`;
    await writeFile(outPath, json);
    for (const pack of packs) {
      process.stdout.write(
        `${pack.slot} ${pack.adapter}: ${pack.status} · ${(pack.latencyMs / 1000).toFixed(1)} s · ~$${pack.estimatedCostUsd.toFixed(2)}` +
          ` · ${pack.sources.length} Sources (${pack.sources.filter((s) => s.preferred).length} preferred)` +
          ` · ${pack.filteredOut.length} filtered · request ${pack.vendorRequestId ?? "none"}\n`,
      );
      for (const warning of pack.warnings) process.stdout.write(`  warning: ${warning}\n`);
      if (pack.error) process.stdout.write(`  error: ${pack.error}\n`);
    }
    const [primary, secondary] = packs;
    const shared = primary.sources.filter((a) => secondary.sources.some((b) => b.sourceId === a.sourceId));
    process.stdout.write(`Shared Source IDs: ${shared.map((s) => `${s.sourceId} (${s.host})`).join(", ") || "none"}\n`);
    process.stdout.write(`Wrote ${outPath}\n`);

    assert.notEqual(primary.adapter, secondary.adapter, "The two packs must come from different engines.");
    for (const pack of packs) {
      assert.equal(pack.status, "ok", `${pack.adapter} pack is ${pack.status}: ${pack.error ?? ""}`);
      for (const source of pack.sources) {
        assert.match(source.sourceId, /^src_[0-9a-f]{10}$/);
        assert.ok(source.title && source.url && Date.parse(source.retrievedAt), `Incomplete Source ${source.url}`);
      }
      assert.ok(pack.sources.some((source) => source.excerpts.length > 0), `${pack.adapter} returned no excerpts.`);
    }
    for (const envKey of [adapters.primary.envKey, adapters.secondary.envKey]) {
      assert.ok(!json.includes(process.env[envKey]!), `Source packs contain the ${envKey} value.`);
    }
    process.stdout.write("Research live check passed.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[research.live-check.ts: checkResearch] Live check failed || outPath=${outPath} || ${message}`);
  }
}

await checkResearch();
