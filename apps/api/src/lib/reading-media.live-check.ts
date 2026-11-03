import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createDb, loadRootEnv, parseTeachingProfileAnswers, resolveTeachingProfile, type BlueprintSlot } from "@senoy/db";
import { mediaBlocksOf } from "@senoy/db/reading-lesson";
import { createMediaStorage, mediaStorageConfigFromEnv } from "@senoy/media";
import { redact, researchAdaptersForTier, researchTierModeFromEnv, runResearch, type SourcePack } from "@senoy/research";
import { readingPlugin } from "../teaching-methods/reading.ts";
import { findVisualOnCommons } from "./commons-ingest.ts";
import { WIKIMEDIA_CONTACT_ENV } from "./commons.ts";
import { lessonResearchTopic, writeTimeProfile } from "./course-generation.ts";
import { createIllustrator } from "./illustrator.ts";
import { createMediaLibrary } from "./media-library.ts";
import { createModelPorts } from "./model-ports.ts";
import { createReadingGenerator, ReadingFailedError, type CommonsFinder } from "./reading-generation.ts";
import { tierFor } from "./research-tier.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";
import { createVisualJudge } from "./visual-judge.ts";

/**
 * The Norse Reading slot of the SEN-43 live check, planning the depiction the 2026-11-01 Norse Course never got
 * (SEN-121): the illustrator draws it first, and the seed catalog's Frølich plate of Yggdrasil is the library fallback.
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
  visuals: [{ kind: "depiction", intent: "Yggdrasil, the world ash, with its roots and the beings the sources place around it, so the Learner sees how one tree holds the worlds together." }],
};

/**
 * A drum Reading planning a technique and a diagram (SEN-121): the matched grip is never drawn, so it comes from the
 * seed catalog's photographs judged harshly, or from Commons; the full stroke is drawn first, with the product-owned
 * rebound-stroke strip as the library fallback.
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
  visuals: [
    { kind: "technique", intent: "A hand holding a drumstick in matched grip, seen so the fulcrum between the thumb and the index finger is plain, for the Learner to copy." },
    { kind: "diagram", intent: "The four moments of a full stroke in order, raised, striking, rebounding, and back at the starting height, so the Learner sees the stick come back up on its own." },
  ],
};

/** Each run this check knows: the slot, its Course, where its Source packs are, and where the run is written. */
const CASES = {
  norse: {
    slot: YGGDRASIL_SLOT, subject: "Norse mythology", courseTitle: "Norse cosmology", learningGoal: "Explain how the Norse sources picture the world",
    packs: "docs/research/sen-36-norse-source-packs.json", out: "docs/research/sen-121-norse-reading-media-run.json",
  },
  "drum-stroke": {
    slot: STROKE_SLOT, subject: "Drum kit", courseTitle: "Drum kit fundamentals", learningGoal: "Play “Iris” by the Goo Goo Dolls end-to-end on a drum kit",
    packs: "docs/research/sen-115-drum-stroke-source-packs.json", out: "docs/research/sen-121-drum-stroke-reading-media-run.json",
  },
} as const;

/** The statuses that put a picture in the Lesson. */
const SHOWN = new Set(["illustrated", "library", "commons"]);

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
  // No Request to rate here, so `auto` takes the unrated default (deluxe).
  const tier = tierFor(researchTierModeFromEnv(process.env), null);
  const packs = await runResearch(topic, { ...researchAdaptersForTier(tier), env: process.env });
  await writeFile(path, `${JSON.stringify(packs, null, 2)}\n`);
  return packs;
}

/**
 * Generates one Reading with the real Lesson authors, Judge, illustrator, Vision Judge, Media catalog, private bucket,
 * and Commons (when `WIKIMEDIA_CONTACT` is set), writes the run to JSON, then checks that every visual the slot plans
 * was shown: drawn, from the library, or from Commons. A drawn picture lands in the bucket under `generated/`. Not
 * part of `pnpm test`. Optional arguments: the case (`norse`, the default, or `drum-stroke`), then the Source pack
 * path and output path, both relative to the repo root.
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
    const illustratorPorts = createModelPorts({ authors: "illustrator" });
    const profile = writeTimeProfile(readingPlugin, resolveTeachingProfile(parseTeachingProfileAnswers({})));
    const planned = run.slot.visuals ?? [];
    const storage = createMediaStorage(mediaStorageConfigFromEnv());
    const judgeVisual = createVisualJudge({});
    const commons: CommonsFinder = (brief, visualJudge) => findVisualOnCommons({ brief, judge: visualJudge, db, storage });
    const withCommons = Boolean(process.env[WIKIMEDIA_CONTACT_ENV]?.trim());
    process.stdout.write(`Generating "${run.slot.title}" with ${generator.modelId}, judged by ${judge.modelId}, illustrated by ${illustratorPorts.generator.modelId}, planning ${planned.length} visual(s)${withCommons ? ", Commons on" : ", Commons off (WIKIMEDIA_CONTACT unset)"}…\n`);

    const startedAt = new Date();
    let outcome;
    try {
      const checked = await createReadingGenerator({
        generator, fallbackGenerator, judge, judgeVisual,
        media: createMediaLibrary(db, storage),
        illustrator: createIllustrator({ storage, judgeVisual, generator: illustratorPorts.generator }),
        ...(withCommons ? { commons } : {}),
      }).generate({
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
      outcome = { status: "failed", lesson: error.lesson, judge: error.judge, codeFailures: error.codeFailures, rounds: error.rounds, visuals: [] };
    }
    const latencyMs = Date.now() - startedAt.getTime();
    const json = `${JSON.stringify({ startedAt: startedAt.toISOString(), latencyMs, sourcePacks: packPath.slice(root.length + 1), slot: run.slot, profile, ...outcome }, null, 2)}\n`;
    await writeFile(outPath, json);

    process.stdout.write(`${outcome.status} · ${(latencyMs / 1000).toFixed(1)} s · ${outcome.visuals.length} visual(s) briefed · wrote ${outPath}\n`);
    for (const visual of outcome.visuals) {
      const { placement } = visual;
      process.stdout.write(`  ${placement.brief.kind} "${placement.brief.subject}" after "${placement.section}": ${visual.status}\n`);
      process.stdout.write(`    must show: ${placement.brief.mustShow.join(" | ")}\n`);
      for (const attempt of visual.illustration?.attempts ?? []) {
        process.stdout.write(`    drawn by ${attempt.modelId}: ${attempt.error ? `error: ${attempt.error}` : attempt.judge?.pass ? "pass" : `fail: ${attempt.judge?.reasons.join(" ")}`}\n`);
      }
      for (const file of visual.library) {
        process.stdout.write(`    library ${file.storageKey}: ${file.failures ? `skipped: ${file.failures.join("; ")}` : file.error ? `error: ${file.error}` : file.judge?.pass ? "pass" : `fail: ${file.judge?.reasons.join(" ")}`}\n`);
      }
      if (visual.commons) process.stdout.write(`    commons: ${visual.commons.outcome}; tried ${visual.commons.tried.map(({ title, status }) => `${title} (${status})`).join(", ") || "nothing"}\n`);
      if (visual.commonsError) process.stdout.write(`    commons error: ${visual.commonsError}\n`);
    }
    const blocks = outcome.lesson ? mediaBlocksOf(outcome.lesson.body) : [];
    for (const block of blocks) process.stdout.write(`  attached ${block.descriptor.storageKey} (${block.descriptor.origin}): “${block.caption}”\n`);

    assert.ok(!json.includes(apiKey), "The run record contains the OpenRouter key.");
    assert.equal(outcome.status, "checkpoint", "The Lesson did not pass its checks.");
    assert.equal(outcome.visuals.length, planned.length, "The writer did not brief every planned visual.");
    for (const visual of outcome.visuals) assert.ok(SHOWN.has(visual.status), `The ${visual.placement.brief.kind} "${visual.placement.brief.subject}" was not shown: ${visual.status}.`);
    process.stdout.write("Reading media live check passed.\n");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), apiKey);
    throw new Error(`[reading-media.live-check.ts: checkReadingMedia] Live check failed || outPath=${outPath} || ${message}`);
  } finally {
    await db.$client.end();
  }
}

await withLiveCheckTracking("check:reading-media:live", checkReadingMedia);
