import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv, parseTeachingProfileAnswers, resolveTeachingProfile, type BlueprintSlot } from "@senoy/db";
import { redact, type SourcePack } from "@senoy/research";
import { readingPlugin } from "../teaching-methods/reading.ts";
import { writeTimeProfile } from "./course-generation.ts";
import { createModelPorts } from "./model-ports.ts";
import { createReadingGenerator, ReadingFailedError } from "./reading-generation.ts";

/** The approved Reading slot SEN-36's Norse Source packs were researched for. */
const NORSE_READING_SLOT: BlueprintSlot = {
  id: "slot1",
  method: "reading",
  title: "Yggdrasil and the Nine Worlds",
  lessonGoal: "Describe how Norse sources picture Yggdrasil connecting the Nine Worlds.",
  objectives: [
    "Describe Yggdrasil as the world tree at the centre of Norse cosmology",
    "Name the realms of gods, humans, and the dead among the Nine Worlds",
    "Explain why accounts of Yggdrasil's roots differ between Norse sources",
  ],
  topicTags: ["yggdrasil", "nine-worlds", "norse-cosmology"],
  assessesSlotIds: [],
};

/**
 * Generates one reading Lesson from the saved SEN-36 Source packs with the real Generator and Judge, writes the run
 * to JSON, then checks it. Research is not re-run; the packs on disk are real vendor output. Not part of `pnpm test`.
 * Optional arguments: Source pack path, then output path, both relative to the repo root.
 */
async function checkReadingGeneration() {
  const root = loadRootEnv(import.meta.url, 4);
  const packPath = resolve(root, process.argv[2] ?? "docs/research/sen-36-norse-source-packs.json");
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-43-norse-reading-run.json");
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  try {
    assert.ok(apiKey, "OPENROUTER_API_KEY is not set.");
    const packs = JSON.parse(await readFile(packPath, "utf8")) as SourcePack[];
    const { generator, judge } = createModelPorts();
    const profile = writeTimeProfile(readingPlugin, resolveTeachingProfile(parseTeachingProfileAnswers({})));
    process.stdout.write(`Generating "${NORSE_READING_SLOT.title}" with ${generator.modelId}, judged by ${judge.modelId}…\n`);

    const startedAt = new Date();
    let outcome;
    try {
      const checked = await createReadingGenerator({ generator, judge }).generate({
        courseTitle: "Norse cosmology",
        learningGoal: "Explain how the Norse sources picture the world",
        scope: null,
        slot: NORSE_READING_SLOT,
        priorLessons: [],
        profile,
        packs,
      });
      outcome = { status: "checkpoint", ...checked, codeFailures: [] as string[] };
    } catch (error) {
      if (!(error instanceof ReadingFailedError)) throw error;
      outcome = {
        status: "failed", lesson: error.lesson, judge: error.judge, repairs: null, grounding: error.grounding,
        rejectedSources: error.rejectedSources, codeFailures: error.codeFailures,
      };
    }
    const latencyMs = Date.now() - startedAt.getTime();
    const run = {
      startedAt: startedAt.toISOString(),
      latencyMs,
      generatorModel: generator.modelId,
      judgeModel: judge.modelId,
      sourcePacks: packPath.slice(root.length + 1),
      slot: NORSE_READING_SLOT,
      profile,
      ...outcome,
    };
    const json = `${JSON.stringify(run, null, 2)}\n`;
    await writeFile(outPath, json);

    process.stdout.write(`${outcome.status} · ${(latencyMs / 1000).toFixed(1)} s · repairs ${outcome.repairs ?? "exhausted"} · wrote ${outPath}\n`);
    if (outcome.lesson) {
      // A rejected Lesson is recorded for inspection; only a passing one would be checkpointed.
      const words = outcome.lesson.body.sections.flatMap((section) => section.blocks.map((block) => block.text)).join(" ").split(/\s+/).length;
      process.stdout.write(`${outcome.lesson.body.sections.length} sections · ~${words} words · ${outcome.lesson.citations.length} Sources cited\n`);
    }
    for (const { objective, verdict, text, reason } of outcome.grounding) {
      if (verdict === "rewritten") process.stdout.write(`  rewritten: “${objective}” -> “${text}” — ${reason}\n`);
      if (verdict === "unsupported") process.stdout.write(`  dropped: “${objective}” — ${reason}\n`);
    }
    for (const rejected of outcome.rejectedSources) process.stdout.write(`  vetted out: ${rejected.url} — ${rejected.reason}\n`);
    for (const failure of outcome.codeFailures) process.stdout.write(`  code: ${failure}\n`);
    for (const reason of outcome.judge?.reasons ?? []) process.stdout.write(`  judge: ${reason}\n`);

    assert.ok(!json.includes(apiKey), "The run record contains the OpenRouter key.");
    assert.equal(outcome.status, "checkpoint", "The Lesson did not pass its checks.");
    process.stdout.write("Reading generation live check passed.\n");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), apiKey);
    throw new Error(`[reading-generation.live-check.ts: checkReadingGeneration] Live check failed || outPath=${outPath} || ${message}`);
  }
}

await checkReadingGeneration();
