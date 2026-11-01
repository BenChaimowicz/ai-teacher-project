import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv } from "@senoy/db";
import { createYouSearchAdapter, redact, youResearchAdapter, youResearchLiteAdapter, type ResearchAdapter } from "@senoy/research";
import type { FactCheckResult } from "./diagnostic.ts";
import { createFactChecker } from "./fact-check.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";
import { createModelPorts } from "./model-ports.ts";

/**
 * The searches compared for the Starting Level fact-check (SEN-120). The label names the variant in the output; the
 * adapter id is what the Usage Records carry.
 */
const VARIANTS: { name: string; label: string; adapter: ResearchAdapter }[] = [
  { name: "snippets", label: "you-search, snippets", adapter: createYouSearchAdapter() },
  { name: "highlights", label: "you-search, highlights", adapter: createYouSearchAdapter({ highlights: true }) },
  { name: "lite", label: "you-research-lite", adapter: youResearchLiteAdapter },
  { name: "standard", label: "you-research standard (today's)", adapter: youResearchAdapter },
];

/** The models that wrote the claims, which the Judge may not be (ADR 0015). */
const CLAIM_AUTHORS = ["openai/gpt-6.1-sol"];

/** Claims checked at once per variant, and the pause between batches: four at once drew OpenRouter 429s on the Judge. */
const BATCH = 2;
const PAUSE_MS = 1500;

/** The verdict recorded when the Judge call itself failed, so one 429 does not end the comparison. */
const JUDGE_FAILED = "The Judge call failed: ";

/** One claim as the claims file stores it. */
type StoredClaim = {
  itemId: string;
  course: string;
  question: string;
  answer: string;
  storedFactCheck: { confirmed: boolean; reason: string; sources: number } | null;
};

/** One variant's run over every claim. */
type VariantRun = {
  label: string;
  adapterId: string;
  estimatedCostUsd: number;
  durationMs: number;
  confirmed: number;
  unconfirmed: number;
  searchFailed: number;
  noPages: number;
  judgeFailed: number;
  agreesWithStored: number;
  results: (FactCheckResult & { sources: number })[];
};

/**
 * Runs the real fact-check over the keyed answers of the 2026-11-01 test Courses with each candidate search, the same
 * Judge reading each one's excerpts, and writes every verdict to JSON so the searches can be compared on what the
 * Judge concluded and why. Costs about $1 across the four variants. Not part of `pnpm test`.
 * Optional arguments: claims path, then output path, both relative to the repo root, then the variants to run as a
 * comma-separated list of `snippets`, `highlights`, `lite`, `standard` (default: all).
 */
async function checkFactCheckVendors() {
  const root = loadRootEnv(import.meta.url, 4);
  const claimsPath = resolve(root, process.argv[2] ?? "docs/research/sen-120-fact-check-claims.json");
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-120-fact-check-vendors-run.json");
  const wanted = process.argv[4]?.split(",").map((name) => name.trim()).filter(Boolean);
  const variants = wanted ? VARIANTS.filter((variant) => wanted.includes(variant.name)) : VARIANTS;
  assert.ok(variants.length > 0, `No such variant; choose from ${VARIANTS.map((variant) => variant.name).join(", ")}.`);
  const { OPENROUTER_API_KEY, YOU_DOT_COM_API_KEY } = process.env;
  assert.ok(OPENROUTER_API_KEY && YOU_DOT_COM_API_KEY, "OPENROUTER_API_KEY and YOU_DOT_COM_API_KEY are required for the fact-check vendors live check.");
  /** Removes both keys from anything printed. */
  const safe = (text: string) => redact(redact(text, OPENROUTER_API_KEY), YOU_DOT_COM_API_KEY);
  try {
    const { claims } = JSON.parse(await readFile(claimsPath, "utf8")) as { claims: StoredClaim[] };
    assert.ok(claims.length > 0, "The claims file holds no claims.");
    const { judge } = createModelPorts();
    process.stdout.write(`Checking ${claims.length} keyed answers with ${variants.length} search(es), judged by ${judge.modelId}…\n`);

    const runs: VariantRun[] = [];
    for (const variant of variants) {
      const checker = createFactChecker({ judge, authorModelIds: CLAIM_AUTHORS, adapter: variant.adapter });
      const startedAt = Date.now();
      const results: FactCheckResult[] = [];
      for (let from = 0; from < claims.length; from += BATCH) {
        if (from > 0) await new Promise((done) => setTimeout(done, PAUSE_MS));
        const batch = claims.slice(from, from + BATCH).map(({ itemId, question, answer }) => ({ itemId, question, answer }));
        try {
          results.push(...await checker.check(batch));
        } catch (error) {
          const message = safe(error instanceof Error ? error.message : String(error));
          results.push(...batch.map((claim) => ({ itemId: claim.itemId, confirmed: false, reason: `${JUDGE_FAILED}${message}`, sourceUrls: [] })));
        }
      }
      const durationMs = Date.now() - startedAt;
      const rows = results.map((result) => ({ ...result, sources: result.sourceUrls.length }));
      const run: VariantRun = {
        label: variant.label,
        adapterId: variant.adapter.id,
        estimatedCostUsd: Math.round(variant.adapter.estimatedCostUsd * claims.length * 1000) / 1000,
        durationMs,
        confirmed: rows.filter((row) => row.confirmed).length,
        unconfirmed: rows.filter((row) => !row.confirmed).length,
        searchFailed: rows.filter((row) => row.reason === "The fact-check search did not complete.").length,
        noPages: rows.filter((row) => row.reason === "The search returned no pages.").length,
        judgeFailed: rows.filter((row) => row.reason.startsWith(JUDGE_FAILED)).length,
        agreesWithStored: rows.filter((row) => {
          const stored = claims.find((claim) => claim.itemId === row.itemId)?.storedFactCheck;
          return stored ? stored.confirmed === row.confirmed : false;
        }).length,
        results: rows,
      };
      runs.push(run);
      process.stdout.write(
        `${run.label}: ${run.confirmed} confirmed, ${run.unconfirmed} unconfirmed` +
          ` (${run.searchFailed} search failed, ${run.noPages} no pages, ${run.judgeFailed} Judge failed), ${run.agreesWithStored} agree with the stored verdict` +
          ` · ${(durationMs / 1000).toFixed(0)} s · ~$${run.estimatedCostUsd.toFixed(3)}\n`,
      );
    }

    process.stdout.write(`\n${"claim".padEnd(18)} ${"stored".padEnd(8)} ${runs.map((run) => run.adapterId.padEnd(18)).join(" ")}\n`);
    for (const claim of claims) {
      const cells = runs.map((run) => {
        const row = run.results.find((result) => result.itemId === claim.itemId);
        return (row ? (row.confirmed ? "yes" : "NO") + ` (${row.sources})` : "?").padEnd(18);
      });
      const stored = claim.storedFactCheck ? (claim.storedFactCheck.confirmed ? "yes" : "NO") : "-";
      process.stdout.write(`${claim.itemId.padEnd(18)} ${stored.padEnd(8)} ${cells.join(" ")}\n`);
    }
    process.stdout.write("\nReasons for every unconfirmed verdict:\n");
    for (const run of runs) {
      for (const row of run.results.filter((result) => !result.confirmed)) {
        process.stdout.write(`  ${run.adapterId} · ${row.itemId}: ${row.reason}\n`);
      }
    }

    const json = `${JSON.stringify({ checkedAt: new Date().toISOString(), judgeModelId: judge.modelId, claims, runs }, null, 2)}\n`;
    assert.ok(!json.includes(YOU_DOT_COM_API_KEY) && !json.includes(OPENROUTER_API_KEY), "The run contains a key.");
    await writeFile(outPath, json);
    process.stdout.write(`Wrote ${outPath}\nFact-check vendors live check passed.\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(safe(`[fact-check-vendors.live-check.ts: checkFactCheckVendors] Live check failed || claimsPath=${claimsPath} || ${message}`));
  }
}

await withLiveCheckTracking("check:fact-check-vendors:live", checkFactCheckVendors);
