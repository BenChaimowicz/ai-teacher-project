import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadRootEnv, parseTeachingProfileAnswers, resolveTeachingProfile, type StartingLevel, type VisualKind } from "@senoy/db";
import { blueprintSlots } from "@senoy/db/blueprint";
import { BlueprintFailedError, createBlueprintBuilder } from "./blueprint.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";

/**
 * The three test Courses (spec §7), as a Learner would ask for them. The drum goal is the skills §7.2 says the Course
 * teaches toward "Iris": asked as "play Iris end-to-end", a brand-new Learner's Blueprint fails its Judge on reaching
 * the goal and on sizing, since reading and quiz Lessons cannot teach playing.
 */
const COURSES = [
  {
    name: "norse",
    subject: "Norse mythology",
    learningGoal: "Know the Norse mythic corpus: the cosmology, the main gods, and the major myths from the creation to Ragnarök, as the Eddas tell them",
  },
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
 * The SEN-121 acceptance run for the Blueprint: designs a live Blueprint for each test Course, for a brand-new
 * Learner, and records which Readings plan which visuals, by kind and intent. The Norse Course once published with no
 * images because no Reading was told to show one; a gap now shows up as a Reading that plans no visual, so read the
 * output against spec §7. Billable (Blueprint author and Judge, about $0.03 a Course); writes only the run record.
 * Optional arguments: a Course name to run alone, then the output path relative to the repo root.
 */
async function checkTestCourseBlueprints() {
  const root = loadRootEnv(import.meta.url, 4);
  const only = process.argv[2];
  const outPath = resolve(root, process.argv[3] ?? "docs/research/sen-121-test-course-blueprints.json");
  try {
    assert.ok(process.env.OPENROUTER_API_KEY, "OPENROUTER_API_KEY is not set.");
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
          profile: { instructionLanguage: resolved.instructionLanguage.value, quizCadence: resolved.quizCadence.value, explanationOrder: resolved.explanationOrder.value, contentScope: "standard" },
        });
      } catch (error) {
        // A Blueprint that fails its checks is recorded, so the other Courses still run.
        if (!(error instanceof BlueprintFailedError)) throw error;
        process.stdout.write(`Blueprint failed its checks: ${error.message}\n`);
        runs.push({ ...course, latencyMs: Date.now() - started, failed: error.message });
        continue;
      }
      const latencyMs = Date.now() - started;
      const slots = blueprintSlots(checked.blueprint);
      const readings = slots.filter((slot) => slot.method === "reading");
      const planned = readings.flatMap((slot) => slot.visuals ?? []);
      const byKind = Object.fromEntries((["depiction", "diagram", "technique"] as VisualKind[]).map((kind) => [kind, planned.filter((visual) => visual.kind === kind).length]));
      const withoutVisual = readings.filter((slot) => !slot.visuals?.length).map((slot) => slot.title);
      process.stdout.write(`Blueprint "${checked.blueprint.courseTitle}" (${Math.round(latencyMs / 1000)} s, Judge ${checked.judge.pass ? "pass" : "fail"}): ${planned.length} visual(s) over ${readings.length} Readings (${Object.entries(byKind).map(([kind, count]) => `${count} ${kind}`).join(", ")})\n`);
      for (const [index, slot] of slots.entries()) {
        process.stdout.write(`  ${index + 1}. [${slot.method}] ${slot.title}: ${slot.lessonGoal}\n     ${slot.objectives.join(" | ")}\n`);
        for (const visual of slot.visuals ?? []) process.stdout.write(`     shows a ${visual.kind}: ${visual.intent}\n`);
      }
      if (withoutVisual.length) process.stdout.write(`  Readings planning no visual: ${withoutVisual.join("; ")}\n`);
      runs.push({ ...course, latencyMs, blueprint: checked.blueprint, judge: checked.judge, visuals: planned.length, byKind, withoutVisual });
    }
    await writeFile(outPath, `${JSON.stringify({ startedAt: new Date().toISOString(), runs }, null, 2)}\n`);
    process.stdout.write(`\nWrote ${outPath}\n`);

    for (const run of runs) {
      assert.ok("judge" in run && run.judge.pass, `${run.subject}: the Blueprint failed its checks.`);
      assert.ok(run.visuals > 0, `${run.subject}: no Reading plans a visual.`);
      const readings = blueprintSlots(run.blueprint).filter((slot) => slot.method === "reading").length;
      assert.ok(run.visuals * 2 >= readings, `${run.subject}: fewer than half the Readings plan a visual (${run.visuals} over ${readings}); a picture should be the norm.`);
    }
    process.stdout.write("Test-course Blueprint live check passed.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[test-course-blueprints.live-check.ts: checkTestCourseBlueprints] Live check failed || outPath=${outPath} || ${message}`);
  }
}

await withLiveCheckTracking("check:test-course-blueprints:live", checkTestCourseBlueprints);
