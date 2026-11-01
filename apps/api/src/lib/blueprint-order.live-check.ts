import assert from "node:assert/strict";
import { loadRootEnv, type ProbedCapability, type StartingLevel } from "@senoy/db";
import { blueprintSlots } from "@senoy/db/blueprint";
import { BlueprintFailedError, createBlueprintBuilder } from "./blueprint.ts";
import { createModelPorts, type Judge } from "./model-ports.ts";
import { withLiveCheckTracking } from "./live-check-tracking.ts";

/**
 * One probed capability of the SEN-49 Starting Level, as stored.
 * @param span - Its rank from basic to near-goal
 * @param statement - What it asks the Learner to do
 * @param status - How the Learner answered its item
 */
function capability(span: number, statement: string, status: ProbedCapability["status"]): ProbedCapability {
  return { id: `cap${span}`, itemId: `item${span}`, span, statement, status, expandedByLearner: false };
}

const LEARNING_GOAL = "the main stories and figures in the Norse mythic corpus";

/** The confirmed Starting Level of Request `5c33202c` (SEN-49), whose Blueprint opened with Loki and Baldr's death. */
const STARTING_LEVEL: StartingLevel = {
  learningGoal: LEARNING_GOAL,
  extremity: "mixed",
  coverageNote: "This written check samples knowledge of key figures, stories, and sources; it cannot show how well you can analyze a full myth in context. It is a small sample of your starting point, not a certificate of expertise.",
  remainingGapStatement: "Your course will start with Loki’s shifting role in the myths and the story of Baldr’s death, then explore how different source traditions shape our view of Norse mythology—so you can grasp the main stories and figures in the Norse mythic corpus.",
  probedCapabilities: [
    capability(1, "Identify a major Norse god among figures from northern European tradition.", "correct"),
    capability(2, "Recognize a major god from characteristic actions and attributes.", "correct"),
    capability(3, "Recognize Loki's shifting role in stories about the gods.", "incorrect"),
    capability(4, "Identify the central world tree in Norse cosmology.", "correct"),
    capability(5, "Identify the principal medieval collections used to study Norse myths.", "correct"),
    capability(6, "Recognize a central event in the story of Baldr's death.", "dont_know"),
    capability(7, "Describe the broad narrative pattern of Ragnarök.", "correct"),
    capability(8, "Recognize how differing sources contribute to understanding a mythic tradition.", "dont_know"),
  ],
};

/** Cosmology and the main gods: what the stories of the corpus happen in, and who is in them. */
const FOUNDATIONS = /creation|cosmolog|cosmos|nine worlds|yggdrasil|pantheon|gods and giants|æsir|aesir|vanir/i;

/** The Judge checks that fail a Blueprint for its order (SEN-94). */
const ORDER_CHECKS = ["prerequisite_order", "natural_order"];

/** Stories that rely on the foundations: Baldr's death and Ragnarök. */
const LATE_STORIES = /baldr|ragnar/i;

/**
 * The SEN-94 acceptance run: the SEN-49 Norse inputs (quiz every reading, principle first), replayed, must put the
 * cosmology and gods before the stories that use them, and pass the Blueprint Judge. Billable (author and Judge); writes
 * nothing. `-- 3` runs three designs; every run is reported before the check fails. A run that fails only on other checks
 * is reported, not counted, but at least one run must pass.
 */
async function checkNaturalOrder() {
  loadRootEnv(import.meta.url, 4);
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for the Blueprint order live check.");
  const ports = createModelPorts();
  // Every verdict is printed, so a revision the order checks caused shows up even when a later design passes.
  const judge: Judge = {
    modelId: ports.judge.modelId,
    async judge(request) {
      const reply = await ports.judge.judge(request);
      const verdict = reply.value as { pass: boolean; failedChecks: string[]; reasons: string[] };
      process.stdout.write(`  Judge: ${verdict.pass ? "pass" : `fail ${verdict.failedChecks.join(", ")}: ${verdict.reasons.join(" / ")}`}\n`);
      return reply;
    },
  };
  const builder = createBlueprintBuilder({ generator: ports.generator, judge });
  const failures: string[] = [];
  let passed = 0;
  const runs = Number(process.argv.slice(2).find((arg) => arg !== "--") ?? 1);
  assert.ok(Number.isInteger(runs) && runs > 0, `Run count must be a positive whole number || runs=${process.argv.slice(2).join(" ")}`);
  for (let run = 1; run <= runs; run++) {
    const started = Date.now();
    process.stdout.write(`\nRun ${run}:\n`);
    const checked = await builder.build({
      subject: "Norse mythology", learningGoal: LEARNING_GOAL, scope: null, startingLevel: STARTING_LEVEL, confirmation: "looks_right",
      profile: { instructionLanguage: "en", quizCadence: "every_reading", explanationOrder: "principle_first" },
    }).catch((error: unknown) => {
      if (!(error instanceof BlueprintFailedError)) throw error;
      const last = error.judge?.failedChecks ?? [];
      // Fails on other checks (quiz chunks, facts) are reported above but are not this check's question.
      if (last.some((check) => ORDER_CHECKS.includes(check))) failures.push(`Run ${run}: still failed on order after its revisions (${last.join(", ")})`);
      else process.stdout.write(`  Failed after its revisions on ${last.join(", ") || "Code checks"}, not on order\n`);
      return null;
    });
    if (!checked) continue;
    passed++;
    const slots = blueprintSlots(checked.blueprint);
    process.stdout.write(`  "${checked.blueprint.courseTitle}" (${Math.round((Date.now() - started) / 1000)} s, Judge ${checked.judge.pass ? "pass" : "fail"}):\n`);
    for (const [index, slot] of slots.entries()) {
      process.stdout.write(`   ${index + 1}. [${slot.method}] ${slot.title}: ${slot.lessonGoal}\n      ${slot.objectives.join(" | ")}\n`);
    }
    const readings = slots.filter((slot) => slot.method === "reading").map((slot) => [slot.title, slot.lessonGoal, ...slot.objectives].join(" "));
    const foundations = readings.findIndex((text) => FOUNDATIONS.test(text));
    const late = readings.findIndex((text) => LATE_STORIES.test(text));
    if (foundations === -1) failures.push(`Run ${run}: no reading teaches the cosmology or the gods`);
    else if (late !== -1 && late < foundations) failures.push(`Run ${run}: reading ${late + 1} tells Baldr or Ragnarök before reading ${foundations + 1} sets up the world and gods`);
  }
  if (!passed) failures.push("No run passed the Blueprint Judge, so no order was shown");
  assert.deepEqual(failures, [], failures.join("\n"));
  process.stdout.write("\nBlueprint order live check passed.\n");
}

await withLiveCheckTracking("check:blueprint-order:live", checkNaturalOrder);
