import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv, type VisualBrief } from "@senoy/db";
import { CATALOG_DIR, isUnsafeSvg, rasterizeSvg } from "@senoy/media";
import { commonsUserAgent, downloadCommonsFile, searchCommons, type CommonsClient } from "./commons.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";
import { loadModelConfig } from "./model-config.ts";
import { createModelPorts } from "./model-ports.ts";
import type { ModelImage } from "./openrouter.ts";
import { createVisualJudge } from "./visual-judge.ts";

/**
 * Picks the technique Judge (SEN-121): the OpenAI model on OpenRouter that rejects wrong drum grips and passes right
 * ones when judged harshly against a Visual brief. Candidates are never Sol or Terra, which write Lessons (ADR 0015),
 * and never Claude by default (spec §6.1). The set is `docs/research/sen-121-technique-judge-set.json`: correct
 * image-brief pairs that must pass, and deliberately wrong ones that must fail.
 */

/** The OpenAI models the repo already names that write nothing: the Judge and its fallback (ADR 0028). */
const DEFAULT_CANDIDATES = ["openai/gpt-6-luna", "openai/gpt-5.6-luna"];

/** An author family, never a Judge (ADR 0015, ADR 0028). */
const NEVER_A_JUDGE = /sol|terra/i;

/** One image-brief pair of the set. */
type Case = {
  name: string;
  expected: "pass" | "fail";
  note?: string;
  image: { catalog: string } | { commons: { query: string; title: string } };
  brief: VisualBrief;
};

/** MIME type by catalog file extension. */
const MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", svg: "image/svg+xml" };

/**
 * The image of one case, as the Vision Judge takes it: a catalog file as it is, an SVG drawn as a PNG, a Commons file
 * downloaded through the Commons client (a free Usage Record each).
 * @param item - The case's image
 * @param client - Reaches Commons
 * @param cache - Downloads already made, by title
 */
async function imageOf(item: Case["image"], client: CommonsClient, cache: Map<string, ModelImage>): Promise<ModelImage> {
  if ("catalog" in item) {
    const bytes = new Uint8Array(await readFile(resolve(CATALOG_DIR, item.catalog)));
    const mimeType = MIME[item.catalog.split(".").pop() ?? ""];
    if (!mimeType) throw new Error(`[technique-judge.live-check.ts: imageOf] Unknown catalog file type || file=${item.catalog}`);
    if (mimeType !== "image/svg+xml") return { mimeType, bytes };
    if (isUnsafeSvg(bytes)) throw new Error(`[technique-judge.live-check.ts: imageOf] Unsafe SVG || file=${item.catalog}`);
    return { mimeType: "image/png", bytes: rasterizeSvg(bytes) };
  }
  const { query, title } = item.commons;
  const cached = cache.get(title);
  if (cached) return cached;
  const search = await searchCommons(client, query);
  if (search.error) throw new Error(`[technique-judge.live-check.ts: imageOf] Commons search failed || query=${query} || ${search.error}`);
  const candidate = search.candidates.find((found) => found.title === title);
  if (!candidate) throw new Error(`[technique-judge.live-check.ts: imageOf] Commons did not return the file || query=${query} title=${title} || got ${search.candidates.map((found) => found.title).join(", ")}`);
  const image = await downloadCommonsFile(client, candidate);
  cache.set(title, image);
  return image;
}

/**
 * Judges every case of the set on each candidate model, tallies right and wrong verdicts, writes the run, and names
 * the model to pin as `TECHNIQUE_JUDGE_MODEL`: the one with no false passes (a wrong grip let through teaches a wrong
 * habit), then the fewest false fails. Billable: one high-detail vision call per case per model, a few cents in all on
 * a Luna. Optional arguments: a comma-separated list of candidate model IDs, then the output path relative to the repo root.
 */
async function checkTechniqueJudge() {
  const root = loadRootEnv(import.meta.url, 4);
  const candidates = (process.argv[2]?.split(",").map((model) => model.trim()).filter(Boolean) ?? DEFAULT_CANDIDATES);
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-121-technique-judge-eval.json");
  const setPath = resolve(root, "docs/research/sen-121-technique-judge-set.json");
  try {
    assert.ok(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is not set.");
    for (const model of candidates) assert.ok(!NEVER_A_JUDGE.test(model), `${model} is an author family and may not judge (ADR 0015).`);
    const { cases } = JSON.parse(await readFile(setPath, "utf8")) as { cases: Case[] };
    const config = loadModelConfig();
    // The brief's writer is the Lesson author, ruled out of judging as in a real run.
    const authorModelIds = [config.lessonGeneratorModel];
    const client: CommonsClient = { fetch: globalThis.fetch, userAgent: commonsUserAgent() };
    const cache = new Map<string, ModelImage>();
    const images = await Promise.all(cases.map((item) => imageOf(item.image, client, cache)));

    const runs = [];
    for (const model of candidates) {
      process.stdout.write(`\n=== ${model} ===\n`);
      const port = createModelPorts({ config: { ...config, judgeModel: model, judgeFallbackModel: model, techniqueJudgeModel: model } }).judge;
      const judgeVisual = createVisualJudge({ judge: port, techniqueJudge: port });
      const verdicts = [];
      for (const [index, item] of cases.entries()) {
        const started = Date.now();
        let verdict;
        try {
          const { judge, judgeModelId } = await judgeVisual(images[index]!, item.brief, authorModelIds);
          verdict = { name: item.name, expected: item.expected, got: judge.pass ? "pass" : "fail", right: (judge.pass ? "pass" : "fail") === item.expected, reasons: judge.reasons, failedChecks: judge.failedChecks, judgeModelId, latencyMs: Date.now() - started };
        } catch (error) {
          verdict = { name: item.name, expected: item.expected, got: "error", right: false, reasons: [error instanceof Error ? error.message : String(error)], failedChecks: [], judgeModelId: model, latencyMs: Date.now() - started };
        }
        verdicts.push(verdict);
        process.stdout.write(`  ${verdict.right ? "right" : "WRONG"}  expected ${verdict.expected}, got ${verdict.got}: ${item.name}${verdict.reasons.length ? ` — ${verdict.reasons.join(" ")}` : ""}\n`);
      }
      const falsePasses = verdicts.filter(({ expected, got }) => expected === "fail" && got === "pass").length;
      const falseFails = verdicts.filter(({ expected, got }) => expected === "pass" && got === "fail").length;
      const errors = verdicts.filter(({ got }) => got === "error").length;
      process.stdout.write(`  ${verdicts.filter(({ right }) => right).length}/${cases.length} right · ${falsePasses} wrong image(s) let through · ${falseFails} right image(s) refused · ${errors} error(s)\n`);
      runs.push({ model, right: verdicts.filter(({ right }) => right).length, falsePasses, falseFails, errors, verdicts });
    }
    await writeFile(outPath, `${JSON.stringify({ startedAt: new Date().toISOString(), setPath: setPath.slice(root.length + 1), authorModelIds, runs }, null, 2)}\n`);
    process.stdout.write(`\nWrote ${outPath}\n`);

    const [best] = [...runs].sort((a, b) => a.falsePasses - b.falsePasses || a.falseFails - b.falseFails || a.errors - b.errors);
    assert.ok(best, "No candidate was run.");
    process.stdout.write(`Best: ${best.model} (${best.falsePasses} let through, ${best.falseFails} refused). Pin it with TECHNIQUE_JUDGE_MODEL=${best.model}.\n`);
    assert.equal(best.falsePasses, 0, `${best.model} let ${best.falsePasses} wrong image(s) through; no candidate rejects every wrong grip.`);
    process.stdout.write("Technique Judge live check passed.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[technique-judge.live-check.ts: checkTechniqueJudge] Live check failed || outPath=${outPath} || ${message}`);
  }
}

await withLiveCheckTracking("check:technique-judge:live", checkTechniqueJudge);
