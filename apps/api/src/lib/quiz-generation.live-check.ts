import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv, parseTeachingProfileAnswers, resolveTeachingProfile, type BlueprintSlot, type ReadingLessonDraft } from "@senoy/db";
import { redact } from "@senoy/research";
import { quizPlugin } from "../teaching-methods/quiz.ts";
import { writeTimeProfile } from "./course-generation.ts";
import { createModelPorts } from "./model-ports.ts";
import { createQuizGenerator, QuizFailedError } from "./quiz-generation.ts";

/** The Quiz slot that assesses SEN-43's Norse Reading, with that Reading's objectives. */
function norseQuizSlot(reading: BlueprintSlot): BlueprintSlot {
  return {
    id: "slot2",
    method: "quiz",
    title: "Check: Yggdrasil and the Nine Worlds",
    lessonGoal: "Recall how Norse sources picture Yggdrasil connecting the Nine Worlds.",
    objectives: reading.objectives,
    topicTags: ["yggdrasil", "nine-worlds", "quiz"],
    assessesSlotIds: [reading.id],
  };
}

/**
 * Generates one Quiz from SEN-43's checkpointed Norse Reading with the real Generator and Judge, writes the run to
 * JSON, then checks it. The Reading is not regenerated. Not part of `pnpm test`.
 * Optional arguments: Reading run path, then output path, both relative to the repo root.
 */
async function checkQuizGeneration() {
  const root = loadRootEnv(import.meta.url, 4);
  const readingPath = resolve(root, process.argv[2] ?? "docs/research/sen-43-norse-reading-run.json");
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-44-norse-quiz-run.json");
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  try {
    assert.ok(apiKey, "OPENROUTER_API_KEY is not set.");
    const readingRun = JSON.parse(await readFile(readingPath, "utf8")) as { status: string; slot: BlueprintSlot; lesson: ReadingLessonDraft };
    assert.equal(readingRun.status, "checkpoint", "The Reading run did not reach a checkpoint.");
    const reading = readingRun.lesson;
    const slot = norseQuizSlot(readingRun.slot);
    const { generator, judge } = createModelPorts();
    const profile = writeTimeProfile(quizPlugin, resolveTeachingProfile(parseTeachingProfileAnswers({})));
    process.stdout.write(`Generating "${slot.title}" with ${generator.modelId}, judged by ${judge.modelId}…\n`);

    const startedAt = new Date();
    let outcome;
    try {
      const checked = await createQuizGenerator({ generator, judge }).generate({
        courseTitle: "Norse cosmology",
        learningGoal: "Explain how the Norse sources picture the world",
        scope: null,
        slot,
        slots: [readingRun.slot, slot],
        assessed: [{ slotId: reading.slotId, title: reading.title, lessonGoal: reading.lessonGoal, objectives: reading.objectives, body: reading.body }],
        profile,
      });
      outcome = { status: "checkpoint", ...checked, codeFailures: [] as string[] };
    } catch (error) {
      if (!(error instanceof QuizFailedError)) throw error;
      outcome = { status: "failed", lesson: error.lesson, judge: error.judge, repairs: null, grounding: error.grounding, codeFailures: error.codeFailures };
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
    for (const { objective, verdict, text, reason } of outcome.grounding) {
      if (verdict === "rewritten") process.stdout.write(`  rewritten: “${objective}” -> “${text}” — ${reason}\n`);
      if (verdict === "unsupported") process.stdout.write(`  dropped: “${objective}” — ${reason}\n`);
    }
    for (const failure of outcome.codeFailures) process.stdout.write(`  code: ${failure}\n`);
    for (const reason of outcome.judge?.reasons ?? []) process.stdout.write(`  judge: ${reason}\n`);

    assert.ok(!json.includes(apiKey), "The run record contains the OpenRouter key.");
    assert.equal(outcome.status, "checkpoint", "The Quiz did not pass its checks.");
    assert.ok(quizPlugin.studyBody(outcome.lesson!.body), "The Quiz plugin rejects the body.");
    process.stdout.write("Quiz generation live check passed.\n");
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), apiKey);
    throw new Error(`[quiz-generation.live-check.ts: checkQuizGeneration] Live check failed || outPath=${outPath} || ${message}`);
  }
}

await checkQuizGeneration();
