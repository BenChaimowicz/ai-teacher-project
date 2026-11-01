import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv, parseTeachingProfileAnswers, resolveTeachingProfile, type StartingLevel } from "@senoy/db";
import { blueprintSlots } from "@senoy/db/blueprint";
import { CATALOG, resolveCatalog } from "@senoy/media";
import { BlueprintFailedError, createBlueprintBuilder } from "./blueprint.ts";
import { isAttachable, rankCandidates, vocabularyOf } from "./media-library.ts";

/**
 * The two test Courses that need required media (spec §7.1, §7.2), as a Learner would ask for them. The drum goal is
 * the skills §7.2 says the Course teaches toward "Iris": asked as "play Iris end-to-end", a brand-new Learner's
 * Blueprint fails its Judge on reaching the goal and on sizing, since reading and quiz Lessons cannot teach playing.
 */
const COURSES = [
  {
    name: "drums",
    subject: "Drum kit",
    learningGoal: "Learn the drum-kit skills to work toward playing “Iris” by the Goo Goo Dolls: grip and strokes, reading drum notation, 4/4 and 6/8 grooves, and how to practise them",
  },
  {
    name: "microbiology",
    subject: "Microbiology lab fundamentals",
    learningGoal: "Understand Gram staining and the lab basics around it: aseptic technique, microscopy, and culture methods",
  },
];

/**
 * The SEN-115 acceptance run: designs a live Blueprint for each test Course, for a brand-new Learner, offered the
 * committed seed catalog (the one `pnpm media:seed` uploads), and records which Readings require which images and which
 * catalog files would fill them. Gaps are found by reading the output against spec §7: a Reading that should require an
 * image but does not, because the catalog has nothing for it. Billable (Blueprint author and Judge); writes only the
 * run record. Optional arguments: a Course name to run alone, then the output path relative to the repo root.
 */
async function checkTestCourseBlueprints() {
  const root = loadRootEnv(import.meta.url, 4);
  const only = process.argv[2];
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-115-test-course-blueprints.json");
  try {
    assert.ok(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is not set.");
    const files = (await resolveCatalog(CATALOG)).map(({ descriptor }) => descriptor).filter(isAttachable);
    const mediaCatalog = vocabularyOf(files);
    const resolved = resolveTeachingProfile(parseTeachingProfileAnswers({}));
    const builder = createBlueprintBuilder();
    const runs = [];
    for (const course of COURSES.filter((candidate) => !only || candidate.name === only)) {
      process.stdout.write(`\n=== ${course.subject}: ${course.learningGoal} ===\n`);
      const startingLevel: StartingLevel = {
        learningGoal: course.learningGoal, probedCapabilities: [], coverageNote: "", extremity: "floor", selfReportedNew: true,
        remainingGapStatement: "You're new to this, so the course starts from the very beginning.",
      };
      const started = Date.now();
      let checked;
      try {
        checked = await builder.build({
          subject: course.subject, learningGoal: course.learningGoal, scope: null, startingLevel, confirmation: "looks_right",
          profile: { instructionLanguage: resolved.instructionLanguage.value, quizCadence: resolved.quizCadence.value, explanationOrder: resolved.explanationOrder.value },
          mediaCatalog,
        });
      } catch (error) {
        // A Blueprint that fails its checks is recorded, so the other Course still runs.
        if (!(error instanceof BlueprintFailedError)) throw error;
        process.stdout.write(`Blueprint failed its checks: ${error.message}\n`);
        runs.push({ ...course, latencyMs: Date.now() - started, failed: error.message });
        continue;
      }
      const latencyMs = Date.now() - started;
      const slots = blueprintSlots(checked.blueprint);
      const required = slots.flatMap((slot, index) => (slot.requiredMedia ?? []).map((request) => ({
        lesson: index + 1, title: slot.title, request,
        fills: rankCandidates(files.filter((file) => file.mediaCategory === request.mediaCategory), request.topicTags).map(({ storageKey }) => storageKey),
      })));
      process.stdout.write(`Blueprint "${checked.blueprint.courseTitle}" (${Math.round(latencyMs / 1000)} s, Judge ${checked.judge.pass ? "pass" : "fail"}):\n`);
      for (const [index, slot] of slots.entries()) {
        process.stdout.write(`  ${index + 1}. [${slot.method}] ${slot.title}: ${slot.lessonGoal}\n     ${slot.objectives.join(" | ")}\n`);
        for (const request of slot.requiredMedia ?? []) {
          const fill = required.find((entry) => entry.request === request)!.fills;
          process.stdout.write(`     requires ${request.mediaCategory} [${request.topicTags.join(", ")}] → ${fill.slice(0, 3).join(", ")}${fill.length > 3 ? ", …" : ""}\n`);
        }
      }
      runs.push({ ...course, latencyMs, blueprint: checked.blueprint, judge: checked.judge, required });
    }
    await writeFile(outPath, `${JSON.stringify({ startedAt: new Date().toISOString(), mediaCatalog, runs }, null, 2)}\n`);
    process.stdout.write(`\nWrote ${outPath}\n`);

    for (const run of runs) {
      assert.ok("judge" in run && run.judge.pass, `${run.subject}: the Blueprint failed its checks.`);
      assert.ok(run.required.length > 0, `${run.subject}: no Reading requires an image.`);
      for (const entry of run.required) assert.ok(entry.fills.length > 0, `${run.subject}: Lesson ${entry.lesson} requires an image no catalog file fills.`);
    }
    process.stdout.write("Test-course Blueprint live check passed.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[test-course-blueprints.live-check.ts: checkTestCourseBlueprints] Live check failed || outPath=${outPath} || ${message}`);
  }
}

await checkTestCourseBlueprints();
