import assert from "node:assert/strict";
import {
  loadRootEnv,
  MAX_FOCUS_ROUNDS,
  parseTeachingProfileAnswers,
  resolveTeachingProfile,
  type FocusAnswer,
  type FocusProposal,
  type FocusQuestion,
  type FocusRound,
  type StartingLevel,
} from "@senoy/db";
import { blueprintSlots } from "@senoy/db/blueprint";
import { createBlueprintBuilder } from "./blueprint.ts";
import { createGoalFocuser } from "./goal-focus.ts";

const SUBJECT = "Norse mythology";
const BROAD_GOAL = "explain the main stories and figures in the Norse mythic corpus";

/** The two ways the SEN-90 acceptance run focuses the same broad goal. */
const READINGS = [
  { name: "pantheon structure", leaning: /pantheon|gods|Æsir|Vanir|famil|relat|structure|who/i, ownWords: "How the gods are organised into families and groups, and who rules" },
  { name: "sources and scholarship", leaning: /source|Edda|manuscript|scholar|text|where|written|origin/i, ownWords: "Where the myths come from: the medieval sources and how scholars read them" },
];

/** Picks, per question, the option whose words best match `leaning`; an own-words answer when none do. */
function answerToward(questions: FocusQuestion[], leaning: RegExp, ownWords: string): FocusAnswer[] {
  return questions.map((question) => {
    const option = question.options.find((candidate) => leaning.test(candidate));
    return option ? { questionId: question.id, answer: option, ownWords: false } : { questionId: question.id, answer: ownWords, ownWords: true };
  });
}

/**
 * Focuses the broad goal toward one reading with the real focuser, answering every round until it proposes.
 * @param reading - Which way to lean
 */
async function focusToward(reading: (typeof READINGS)[number]): Promise<FocusProposal> {
  const focuser = createGoalFocuser();
  const rounds: FocusRound[] = [];
  for (;;) {
    const turn = await focuser.next({ subject: SUBJECT, learningGoal: BROAD_GOAL, rounds, clarification: null });
    if (turn.kind === "precise") throw new Error("The broad goal must not be precise.");
    if (turn.kind === "propose") return turn.proposal;
    assert.ok(rounds.length < MAX_FOCUS_ROUNDS);
    process.stdout.write(`  Round ${rounds.length + 1}:\n${turn.questions.map((question) => `    ${question.question} [${question.options.join(" | ")}]`).join("\n")}\n`);
    rounds.push({ questions: turn.questions, answers: answerToward(turn.questions, reading.leaning, reading.ownWords) });
  }
}

/**
 * The SEN-90 acceptance run: the same Norse goal focused two ways must give two clearly different Blueprints, each passing
 * the Blueprint Judge (which asks `sequence_reaches_goal` and `out_of_scope`). The Starting Level is a brand-new floor so
 * no diagnostic is paid for. Billable (focuser, Blueprint author and Judge); writes nothing.
 */
async function checkFocusedBlueprints() {
  loadRootEnv(import.meta.url, 4);
  if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is required for the focused Blueprint live check.");
  const resolved = resolveTeachingProfile(parseTeachingProfileAnswers({}));
  const builder = createBlueprintBuilder();
  const titles: string[][] = [];
  // `-- sources` (or any reading name fragment) runs just that reading.
  const only = process.argv[2];
  for (const reading of READINGS.filter((candidate) => !only || candidate.name.includes(only))) {
    process.stdout.write(`\n=== Focused toward ${reading.name} ===\n`);
    const proposal = await focusToward(reading);
    process.stdout.write(`  Goal: ${proposal.learningGoal}\n  Covers: ${proposal.scope.inScope.join("; ")}\n  Leaves out: ${proposal.scope.outOfScope.join("; ")}\n`);
    const startingLevel: StartingLevel = {
      learningGoal: proposal.learningGoal, probedCapabilities: [], coverageNote: "", extremity: "floor", selfReportedNew: true,
      remainingGapStatement: "You're new to this, so the course starts from the very beginning.",
    };
    const started = Date.now();
    const checked = await builder.build({
      subject: SUBJECT, learningGoal: proposal.learningGoal, scope: proposal.scope, startingLevel, confirmation: "looks_right",
      profile: { instructionLanguage: resolved.instructionLanguage.value, quizCadence: resolved.quizCadence.value, explanationOrder: resolved.explanationOrder.value },
    });
    assert.ok(checked.judge.pass, `Blueprint Judge failed: ${checked.judge.failedChecks.join(", ")}`);
    const slots = blueprintSlots(checked.blueprint);
    process.stdout.write(`  Blueprint "${checked.blueprint.courseTitle}" (${Math.round((Date.now() - started) / 1000)} s, Judge pass):\n`);
    for (const [index, slot] of slots.entries()) {
      process.stdout.write(`   ${index + 1}. [${slot.method}] ${slot.title}: ${slot.lessonGoal}\n      ${slot.objectives.join(" | ")}\n`);
    }
    titles.push(slots.map((slot) => slot.title.toLowerCase()));
  }
  if (titles.length < 2) return;
  const shared = titles[0]!.filter((title) => titles[1]!.includes(title));
  process.stdout.write(`\nShared Lesson titles: ${shared.length ? shared.join("; ") : "none"}\n`);
  assert.ok(shared.length < Math.min(titles[0]!.length, titles[1]!.length) / 2, "The two focused Blueprints should be clearly different.");
  process.stdout.write("Focused Blueprint live check passed.\n");
}

await checkFocusedBlueprints();
