import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb, loadRootEnv, parseTeachingProfileAnswers, resolveTeachingProfile, type BlueprintSlot } from "@senoy/db";
import type { MediaBlock } from "@senoy/db/reading-lesson";
import { redact, type SourcePack } from "@senoy/research";
import { readingPlugin } from "../teaching-methods/reading.ts";
import { writeTimeProfile } from "./course-generation.ts";
import { createMediaLibrary } from "./media-library.ts";
import { createModelPorts } from "./model-ports.ts";
import { createReadingGenerator, ReadingFailedError } from "./reading-generation.ts";

/**
 * The Norse Reading slot of the SEN-43 live check, with an objective a picture serves: the seed catalog (SEN-47) holds a
 * public-domain Frølich plate of Yggdrasil.
 */
const YGGDRASIL_SLOT: BlueprintSlot = {
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
 * Generates one Reading from the saved SEN-36 Source packs with the real Lesson authors, Judge, Media catalog, private
 * bucket, and vision Judge, writes the run to JSON, then checks that one image was attached. Not part of `pnpm test`.
 * Optional arguments: Source pack path, then output path, both relative to the repo root.
 */
async function checkReadingMedia() {
  const root = loadRootEnv(import.meta.url, 4);
  const packPath = resolve(root, process.argv[2] ?? "docs/research/sen-36-norse-source-packs.json");
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-55-norse-reading-media-run.json");
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const db = createDb(process.env.DATABASE_URL ?? "", { max: 1 });
  try {
    assert.ok(apiKey, "OPENROUTER_API_KEY is not set.");
    const packs = JSON.parse(await readFile(packPath, "utf8")) as SourcePack[];
    const { generator, fallbackGenerator, judge } = createModelPorts({ authors: "lesson" });
    const profile = writeTimeProfile(readingPlugin, resolveTeachingProfile(parseTeachingProfileAnswers({})));
    process.stdout.write(`Generating "${YGGDRASIL_SLOT.title}" with ${generator.modelId}, judged by ${judge.modelId}, with the Media catalog…\n`);

    const startedAt = new Date();
    let outcome;
    try {
      const checked = await createReadingGenerator({ generator, fallbackGenerator, judge, media: createMediaLibrary(db) }).generate({
        courseTitle: "Norse cosmology",
        learningGoal: "Explain how the Norse sources picture the world",
        scope: null,
        slot: YGGDRASIL_SLOT,
        priorLessons: [],
        profile,
        packs,
      });
      outcome = { status: "checkpoint", ...checked };
    } catch (error) {
      if (!(error instanceof ReadingFailedError)) throw error;
      outcome = { status: "failed", lesson: error.lesson, judge: error.judge, codeFailures: error.codeFailures, media: null };
    }
    const latencyMs = Date.now() - startedAt.getTime();
    const json = `${JSON.stringify({ startedAt: startedAt.toISOString(), latencyMs, sourcePacks: packPath.slice(root.length + 1), slot: YGGDRASIL_SLOT, profile, ...outcome }, null, 2)}\n`;
    await writeFile(outPath, json);

    process.stdout.write(`${outcome.status} · ${(latencyMs / 1000).toFixed(1)} s · media ${outcome.media?.status ?? "not tried"} · wrote ${outPath}\n`);
    const { media } = outcome;
    if (media && media.status !== "none") process.stdout.write(`  asked for: ${media.proposal.mediaCategory} ${JSON.stringify(media.proposal.topicTags)} after "${media.proposal.section}"\n`);
    if (media && "rejected" in media) for (const { storageKey, failures } of media.rejected) process.stdout.write(`  rejected ${storageKey}: ${failures.join("; ")}\n`);
    if (media && "judge" in media) for (const reason of media.judge.reasons) process.stdout.write(`  vision: ${reason}\n`);
    const block = outcome.lesson?.body.sections.flatMap((section) => section.blocks).find((candidate): candidate is MediaBlock => candidate.kind === "media");
    if (block) process.stdout.write(`  attached ${block.descriptor.storageKey}: “${block.caption}”\n`);

    assert.ok(!json.includes(apiKey), "The run record contains the OpenRouter key.");
    assert.equal(outcome.status, "checkpoint", "The Lesson did not pass its checks.");
    assert.equal(media?.status, "attached", "No image was attached.");
    assert.ok(block, "The attached image is not in the Lesson body.");
    process.stdout.write("Reading media live check passed.\n");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), apiKey);
    throw new Error(`[reading-media.live-check.ts: checkReadingMedia] Live check failed || outPath=${outPath} || ${message}`);
  } finally {
    await db.$client.end();
  }
}

await checkReadingMedia();
