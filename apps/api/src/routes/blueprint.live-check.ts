import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { eq } from "drizzle-orm";
import {
  courseBlueprints,
  courseRequests,
  createDb,
  learners,
  loadRootEnv,
  parseTeachingProfileAnswers,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  type Database,
  type StartingLevel,
} from "@senoy/db";
import { redact } from "@senoy/research";
import { blueprintRoutes } from "./blueprint.ts";
import { withLiveCheckTracking } from "../lib/live-check-tracking.ts";

/** A mixed Gram-stain Starting Level: the first three capabilities evidenced. */
const CAPABILITIES = [
  "Name the two cell-wall types Gram staining distinguishes",
  "State the purpose of heat-fixing a smear",
  "Identify crystal violet as the primary stain",
  "Explain iodine's role as a mordant",
  "Explain why decolorization time matters",
  "Explain why safranin is applied last",
  "Predict the colour of Gram-positive and Gram-negative cells",
  "Diagnose a likely cause of an all-pink slide of a known Gram-positive culture",
];

/**
 * Designs one real Course Blueprint (OpenRouter author + Judge) through the HTTP handlers on hosted Postgres,
 * approves it, then rolls every record back. Prints the Blueprint, never keys. Needs migration 0006 applied.
 */
async function checkBlueprint() {
  loadRootEnv(import.meta.url, 4);
  const { DATABASE_URL, OPENROUTER_API_KEY } = process.env;
  if (!DATABASE_URL || !OPENROUTER_API_KEY) throw new Error("DATABASE_URL and OPENROUTER_API_KEY are required for the Blueprint live check.");
  const safe = (text: string) => redact(text, OPENROUTER_API_KEY);
  const db = createDb(DATABASE_URL, { max: 1 });
  const rollback = new Error("SEN-42 live check rollback");
  try {
    try {
      await db.transaction(async (transaction) => {
        const [learner] = await transaction.insert(learners).values({
          id: randomUUID(), teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}),
        }).returning();
        assert.ok(learner);
        const learningGoal = "Perform and interpret a Gram stain and explain why each reagent step matters.";
        const [request] = await transaction.insert(courseRequests).values({
          learnerId: learner.id, subject: "Microbiology lab fundamentals", learningGoal, status: "starting_level_confirmed",
        }).returning();
        assert.ok(request);
        const startingLevel: StartingLevel = {
          learningGoal,
          probedCapabilities: CAPABILITIES.map((statement, i) => ({
            id: `cap${i + 1}`, statement, itemId: `item${i + 1}`, span: i + 1,
            status: i < 3 ? "correct" : "incorrect", expandedByLearner: false,
          })),
          remainingGapStatement: "Your Course would start with iodine's role as a mordant and carry on through decolorizing, counterstaining, and reading the slide.",
          coverageNote: "This written check cannot measure wet-lab technique.",
          extremity: "mixed",
        };
        await transaction.insert(startingLevelDiagnostics).values({
          courseRequestId: request.id, learnerId: learner.id, startingLevel, confirmation: "looks_right",
        });
        const app = Fastify({ logger: { level: "error" } });
        app.decorate("db", transaction as unknown as Database);
        app.addHook("onRequest", async (incoming) => { incoming.currentLearner = learner; });
        await app.register(blueprintRoutes);
        const url = `/api/course-requests/${request.id}/blueprint`;
        try {
          const started = Date.now();
          const prepared = await app.inject({ method: "POST", url });
          assert.equal(prepared.statusCode, 200, safe(prepared.body));
          assert.equal(prepared.json().courseRequest.status, "blueprint_review");
          assert.ok(!/objectives|topicTags/.test(prepared.body), "Review shows titles and Lesson goals only.");

          const [stored] = await transaction.select().from(courseBlueprints).where(eq(courseBlueprints.courseRequestId, request.id));
          assert.ok(stored?.judge.pass);
          process.stdout.write(`Designed and judged in ${Math.round((Date.now() - started) / 1000)} s\nCourse: ${stored.draft.courseTitle}\n`);
          for (const module of stored.draft.modules) {
            process.stdout.write(`Module: ${module.title}\n`);
            for (const slot of module.slots) {
              process.stdout.write(`  [${slot.method}] ${slot.title}\n     Goal: ${slot.lessonGoal}\n     Objectives: ${slot.objectives.join("; ")}\n     Tags: ${slot.topicTags.join(", ")}\n`);
            }
          }

          const approved = await app.inject({ method: "POST", url: `${url}/approve`, payload: { sequenceMode: "linear" } });
          assert.equal(approved.statusCode, 200, safe(approved.body));
          assert.equal(approved.json().courseRequest.status, "generating");
        } finally {
          await app.close();
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    process.stdout.write("Blueprint live check passed; all temporary records rolled back.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(safe(`[blueprint.live-check.ts: checkBlueprint] Live check failed || ${message}`));
  } finally {
    await db.$client.end();
  }
}

await withLiveCheckTracking("check:blueprint:live", checkBlueprint);
