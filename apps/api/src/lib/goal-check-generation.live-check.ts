import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv, parseGoalCheckBody, parseTeachingProfileAnswers, resolveTeachingProfile, type BlueprintSlot, type ReadingLessonDraft } from "@senoy/db";
import { redact } from "@senoy/research";
import { quizPlugin } from "../teaching-methods/quiz.ts";
import { writeTimeProfile } from "./course-generation.ts";
import { createGoalCheckGenerator, GoalCheckFailedError } from "./goal-check-generation.ts";
import { createModelPorts } from "./model-ports.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";

/** The Learning Goal SEN-43's Norse Reading was written toward. */
const LEARNING_GOAL = "Explain how the Norse sources picture the world";

/**
 * The Goal Check slot for a one-Reading Course on SEN-43's Norse Reading: two goal objectives, parts of the Learning
 * Goal, both taught by that Reading.
 * @param reading - The Reading slot
 */
function norseGoalCheckSlot(reading: BlueprintSlot): BlueprintSlot {
  const objectives = [
    "Explain how Yggdrasil holds the Nine Worlds together",
    "Judge what the Norse sources do and do not agree on about the world tree",
  ];
  return {
    id: "slot2",
    method: "goal_check",
    title: "Goal Check: the Norse picture of the world",
    lessonGoal: "Show you can explain how the Norse sources picture the world.",
    objectives,
    topicTags: ["yggdrasil", "nine-worlds", "goal-check"],
    assessesSlotIds: [reading.id],
    objectiveSlotIds: Object.fromEntries(objectives.map((objective) => [objective, [reading.id]])),
  };
}

/**
 * Generates one Goal Check (SEN-81) from SEN-43's checkpointed Norse Reading with the real Generator and Judge, writes
 * the run to JSON, then checks it. The Reading is not regenerated. Not part of `pnpm test`.
 * Optional arguments: Reading run path, then output path, both relative to the repo root.
 */
async function checkGoalCheckGeneration() {
  const root = loadRootEnv(import.meta.url, 4);
  const readingPath = resolve(root, process.argv[2] ?? "docs/research/sen-43-norse-reading-run.json");
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-81-norse-goal-check-run.json");
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  try {
    assert.ok(apiKey, "OPENROUTER_API_KEY is not set.");
    const readingRun = JSON.parse(await readFile(readingPath, "utf8")) as { status: string; slot: BlueprintSlot; lesson: ReadingLessonDraft };
    assert.equal(readingRun.status, "checkpoint", "The Reading run did not reach a checkpoint.");
    const reading = readingRun.lesson;
    const slot = norseGoalCheckSlot(readingRun.slot);
    const { generator, judge } = createModelPorts({ authors: "lesson" });
    const profile = writeTimeProfile(quizPlugin, resolveTeachingProfile(parseTeachingProfileAnswers({})));
    process.stdout.write(`Generating "${slot.title}" with ${generator.modelId}, judged by ${judge.modelId}…\n`);

    const startedAt = new Date();
    let outcome;
    try {
      const checked = await createGoalCheckGenerator({ generator, judge }).generate({
        courseTitle: "Norse cosmology",
        learningGoal: LEARNING_GOAL,
        scope: null,
        startingLevel: null,
        slot,
        slots: [readingRun.slot, slot],
        assessed: [{ slotId: reading.slotId, title: reading.title, lessonGoal: reading.lessonGoal, objectives: reading.objectives, body: reading.body }],
        profile,
      });
      outcome = { status: "checkpoint", ...checked, codeFailures: [] as string[] };
    } catch (error) {
      if (!(error instanceof GoalCheckFailedError)) throw error;
      outcome = { status: "failed", lesson: error.lesson, judge: error.judge, repairs: null, rounds: error.rounds, codeFailures: error.codeFailures };
    }
    const latencyMs = Date.now() - startedAt.getTime();
    const run = {
      startedAt: startedAt.toISOString(),
      latencyMs,
      generatorModel: generator.modelId,
      judgeModel: judge.modelId,
      reading: readingPath.slice(root.length + 1),
      slot,
      profile,
      ...outcome,
    };
    const json = `${JSON.stringify(run, null, 2)}\n`;
    await writeFile(outPath, json);

    process.stdout.write(`${outcome.status} · ${(latencyMs / 1000).toFixed(1)} s · repairs ${outcome.repairs ?? "exhausted"} · wrote ${outPath}\n`);
    if (outcome.lesson) {
      const keys = outcome.lesson.body.items.map((item) => item.correctOptionId).join("");
      process.stdout.write(`${outcome.lesson.body.items.length} items · keys ${keys}\n`);
    }
    for (const failure of outcome.codeFailures) process.stdout.write(`  code: ${failure}\n`);
    for (const reason of outcome.judge?.reasons ?? []) process.stdout.write(`  judge: ${reason}\n`);

    assert.ok(!json.includes(apiKey), "The run record contains the OpenRouter key.");
    assert.equal(outcome.status, "checkpoint", "The Goal Check did not pass its checks.");
    assert.ok(parseGoalCheckBody(outcome.lesson!.body), "The Goal Check body does not parse.");
    process.stdout.write("Goal Check generation live check passed.\n");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), apiKey);
    throw new Error(`[goal-check-generation.live-check.ts: checkGoalCheckGeneration] Live check failed || outPath=${outPath} || ${message}`);
  }
}

await withLiveCheckTracking("check:goal-check:live", checkGoalCheckGeneration);
