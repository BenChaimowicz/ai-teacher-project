import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb, loadRootEnv, parseTeachingProfileAnswers, resolveTeachingProfile, type BlueprintSlot } from "@senoy/db";
import { mediaBlocksOf, unfilledRequiredMedia } from "@senoy/db/reading-lesson";
import { redact, researchAdaptersFromEnv, runResearch, type SourcePack } from "@senoy/research";
import { readingPlugin } from "../teaching-methods/reading.ts";
import { lessonResearchTopic, writeTimeProfile } from "./course-generation.ts";
import { createMediaLibrary } from "./media-library.ts";
import { createModelPorts } from "./model-ports.ts";
import { createReadingGenerator, ReadingFailedError } from "./reading-generation.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";

/**
 * The Norse Reading slot of the SEN-43 live check, with an objective a picture serves: the seed catalog (SEN-47) holds a
 * public-domain Frølich plate of Yggdrasil. Nothing is required, so this runs SEN-55's optional image.
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
 * A drum Reading that cannot teach without two images (SEN-115): a matched-grip photo from Commons and the
 * product-owned rebound-stroke strip, an SVG the vision Judge sees drawn as a PNG.
 */
const STROKE_SLOT: BlueprintSlot = {
  id: "slot2",
  method: "reading",
  title: "Matched grip and the full stroke",
  lessonGoal: "Hold the sticks in matched grip and play a relaxed full stroke that rebounds to its starting height.",
  objectives: [
    "Hold a drumstick in matched grip, with the fulcrum between the thumb and the index finger",
    "Describe a full stroke: the stick starts high, strikes the head, and rebounds to its starting height",
    "Explain why letting the stick rebound keeps the hands relaxed",
  ],
  topicTags: ["matched-grip", "full-stroke", "rebound"],
  assessesSlotIds: [],
  requiredMedia: [
    { mediaCategory: "drum-grip", topicTags: ["matched-grip", "fulcrum"] },
    { mediaCategory: "drum-stroke", topicTags: ["full-stroke", "rebound-stroke"] },
  ],
};

/** Each run this check knows: the slot, its Course, where its Source packs are, and where the run is written. */
const CASES = {
  norse: {
    slot: YGGDRASIL_SLOT, subject: "Norse mythology", courseTitle: "Norse cosmology", learningGoal: "Explain how the Norse sources picture the world",
    packs: "docs/research/sen-36-norse-source-packs.json", out: "docs/research/sen-55-norse-reading-media-run.json",
  },
  "drum-stroke": {
    slot: STROKE_SLOT, subject: "Drum kit", courseTitle: "Drum kit fundamentals", learningGoal: "Play “Iris” by the Goo Goo Dolls end-to-end on a drum kit",
    packs: "docs/research/sen-115-drum-stroke-source-packs.json", out: "docs/research/sen-115-drum-stroke-reading-media-run.json",
  },
} as const;

/**
 * Reads a case's saved Source packs, or researches its slot with the real vendors and saves them when there are none,
 * so later runs write from the same evidence.
 * @param path - Where the packs are kept
 * @param topic - The slot's research topic
 */
async function sourcePacks(path: string, topic: string): Promise<SourcePack[]> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as SourcePack[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  process.stdout.write(`No saved Source packs; researching "${topic}"…\n`);
  const packs = await runResearch(topic, { ...researchAdaptersFromEnv(process.env), env: process.env });
  await writeFile(path, `${JSON.stringify(packs, null, 2)}\n`);
  return packs;
}

/**
 * Generates one Reading with the real Lesson authors, Judge, Media catalog, private bucket, and vision Judge, writes the
 * run to JSON, then checks that every image the slot requires, or at least one optional image when it requires none,
 * was attached. Not part of `pnpm test`. Optional arguments: the case (`norse`, the default, or `drum-stroke`), then the
 * Source pack path and output path, both relative to the repo root.
 */
async function checkReadingMedia() {
  const root = loadRootEnv(import.meta.url, 4);
  const name = (process.argv[2] ?? "norse") as keyof typeof CASES;
  const run = CASES[name];
  if (!run) throw new Error(`[reading-media.live-check.ts: checkReadingMedia] Unknown case || case=${name} || Use one of ${Object.keys(CASES).join(", ")}.`);
  const packPath = resolve(root, process.argv[3] ?? run.packs);
  const outPath = resolve(root, process.argv[4] ?? run.out);
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  const db = createDb(process.env.DATABASE_URL ?? "", { max: 1 });
  try {
    assert.ok(apiKey, "OPENROUTER_API_KEY is not set.");
    const packs = await sourcePacks(packPath, lessonResearchTopic(run.subject, run.slot, null));
    const { generator, fallbackGenerator, judge } = createModelPorts({ authors: "lesson" });
    const profile = writeTimeProfile(readingPlugin, resolveTeachingProfile(parseTeachingProfileAnswers({})));
    const required = run.slot.requiredMedia ?? [];
    process.stdout.write(`Generating "${run.slot.title}" with ${generator.modelId}, judged by ${judge.modelId}, requiring ${required.length} image(s)…\n`);

    const startedAt = new Date();
    let outcome;
    try {
      const checked = await createReadingGenerator({ generator, fallbackGenerator, judge, media: createMediaLibrary(db) }).generate({
        courseTitle: run.courseTitle,
        learningGoal: run.learningGoal,
        scope: null,
        slot: run.slot,
        priorLessons: [],
        profile,
        packs,
      });
      outcome = { status: "checkpoint", ...checked };
    } catch (error) {
      if (!(error instanceof ReadingFailedError)) throw error;
      outcome = { status: "failed", lesson: error.lesson, judge: error.judge, codeFailures: error.codeFailures, rounds: error.rounds, media: error.media };
    }
    const latencyMs = Date.now() - startedAt.getTime();
    const json = `${JSON.stringify({ startedAt: startedAt.toISOString(), latencyMs, sourcePacks: packPath.slice(root.length + 1), slot: run.slot, profile, ...outcome }, null, 2)}\n`;
    await writeFile(outPath, json);

    process.stdout.write(`${outcome.status} · ${(latencyMs / 1000).toFixed(1)} s · ${outcome.media.length} image(s) asked for · wrote ${outPath}\n`);
    for (const media of outcome.media) {
      const { proposal } = media;
      process.stdout.write(`  ${proposal.required ? "required" : "optional"} ${proposal.mediaCategory} ${JSON.stringify(proposal.topicTags)} after "${proposal.section}": ${media.status}\n`);
      for (const { storageKey, failures } of media.rejected) process.stdout.write(`    rejected ${storageKey}: ${failures.join("; ")}\n`);
      for (const check of media.checks) process.stdout.write(`    vision ${check.judge.pass ? "pass" : "fail"} on “${check.caption}”${check.judge.reasons.length ? `: ${check.judge.reasons.join(" ")}` : ""}\n`);
      if (media.repair) process.stdout.write(`    caption repair (${media.repair.fits ? "kept" : "unfit"}): ${media.repair.reason}\n`);
    }
    const blocks = outcome.lesson ? mediaBlocksOf(outcome.lesson.body) : [];
    for (const block of blocks) process.stdout.write(`  attached ${block.descriptor.storageKey}: “${block.caption}”\n`);

    assert.ok(!json.includes(apiKey), "The run record contains the OpenRouter key.");
    assert.equal(outcome.status, "checkpoint", "The Lesson did not pass its checks.");
    if (required.length) assert.deepEqual(unfilledRequiredMedia(outcome.lesson!.body, required), [], "A required image is not in the Lesson body.");
    else assert.ok(blocks.length > 0, "No image was attached.");
    process.stdout.write("Reading media live check passed.\n");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), apiKey);
    throw new Error(`[reading-media.live-check.ts: checkReadingMedia] Live check failed || outPath=${outPath} || ${message}`);
  } finally {
    await db.$client.end();
  }
}

await withLiveCheckTracking("check:reading-media:live", checkReadingMedia);
