import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { eq } from "drizzle-orm";
import {
  courseRequests,
  createDb,
  learners,
  lessonCompletions,
  loadRootEnv,
  parseTeachingProfileAnswers,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  type Database,
} from "@senoy/db";
import { redact } from "@senoy/research";
import { startingLevelRoutes } from "./starting-level.ts";

/**
 * Runs one real Starting Level diagnostic (OpenRouter author + Judge, You.com fact-check) through the HTTP
 * handlers on hosted Postgres, then rolls every record back. Prints model IDs, never keys.
 */
async function checkStartingLevel() {
  loadRootEnv(import.meta.url, 4);
  const { DATABASE_URL, OPENROUTER_API_KEY, YOU_DOT_COM_API_KEY } = process.env;
  if (!DATABASE_URL || !OPENROUTER_API_KEY || !YOU_DOT_COM_API_KEY) {
    throw new Error("DATABASE_URL, OPENROUTER_API_KEY, and YOU_DOT_COM_API_KEY are required for the Starting Level live check.");
  }
  /** Removes both provider keys from anything printed. */
  const safe = (text: string) => redact(redact(text, OPENROUTER_API_KEY), YOU_DOT_COM_API_KEY);
  const db = createDb(DATABASE_URL, { max: 1 });
  const rollback = new Error("SEN-41 live check rollback");
  try {
    try {
      await db.transaction(async (transaction) => {
        const [learner] = await transaction.insert(learners).values({
          id: randomUUID(), teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}),
        }).returning();
        assert.ok(learner);
        const [request] = await transaction.insert(courseRequests).values({
          learnerId: learner.id, subject: "Microbiology lab fundamentals",
          learningGoal: "Perform and interpret a Gram stain and explain why each reagent step matters.", status: "validity_passed",
        }).returning();
        assert.ok(request);
        const app = Fastify({ logger: { level: "error" } });
        app.decorate("db", transaction as unknown as Database);
        app.addHook("onRequest", async (incoming) => { incoming.currentLearner = learner; });
        await app.register(startingLevelRoutes);
        const url = `/api/course-requests/${request.id}/diagnostic`;
        try {
          const started = Date.now();
          const prepared = await app.inject({ method: "POST", url });
          assert.equal(prepared.statusCode, 200, safe(prepared.body));
          const { diagnostic } = prepared.json() as { diagnostic: { items: { id: string; stem: string; options: string[] }[] } };
          assert.equal(diagnostic.items.length, 8);
          assert.ok(!prepared.body.includes("keyIndex") && !prepared.body.includes("warrant"), "Keys never reach the browser.");

          const [attempt] = await transaction.select().from(startingLevelDiagnostics).where(eq(startingLevelDiagnostics.courseRequestId, request.id));
          assert.ok(attempt?.authorModelId && attempt.judgeModelId);
          assert.notEqual(attempt.authorModelId, attempt.judgeModelId, "Author and Judge must be different models.");
          const rounds = Math.max(...attempt.reviews.map((review) => review.round)) + 1;
          process.stdout.write(`Prepared in ${Math.round((Date.now() - started) / 1000)} s, ${rounds} review round(s)\n`);
          process.stdout.write(`Author: ${attempt.authorModelId}\nJudge: ${attempt.judgeModelId}\nFact-check: ${attempt.factCheckVendor ?? "not needed"}\n`);
          process.stdout.write(`Rejected item versions: ${attempt.reviews.filter((review) => !review.passed).length}\n`);
          for (const [index, capability] of attempt.capabilities.entries()) {
            process.stdout.write(`  ${capability.span}. ${capability.statement}\n     Q: ${attempt.items[index]!.stem}\n`);
          }
          process.stdout.write(`Coverage note: ${attempt.coverageNote}\n`);

          // Learner knows the first five capabilities by span and nothing after.
          const answers = Object.fromEntries(attempt.items.map((item, index) => [item.id, index < 5 ? item.keyIndex : "dont_know"]));
          const scored = await app.inject({ method: "POST", url: `${url}/answers`, payload: { answers } });
          assert.equal(scored.statusCode, 200, safe(scored.body));
          const result = scored.json().diagnostic.result as { remainingGapStatement: string; extremity: string; canExpandGap: boolean };
          assert.equal(result.extremity, "mixed");
          process.stdout.write(`Remaining gap (mixed): ${result.remainingGapStatement}\n`);

          const widened = await app.inject({ method: "POST", url: `${url}/too-easy` });
          assert.equal(widened.statusCode, 200, safe(widened.body));
          process.stdout.write(`After Too easy (${widened.json().diagnostic.result.extremity}): ${widened.json().diagnostic.result.remainingGapStatement}\n`);

          const confirmed = await app.inject({ method: "POST", url: `${url}/confirm`, payload: { choice: "looks_right" } });
          assert.equal(confirmed.statusCode, 200, safe(confirmed.body));
          assert.equal(confirmed.json().courseRequest.status, "starting_level_confirmed");
          const [stored] = await transaction.select().from(startingLevelDiagnostics).where(eq(startingLevelDiagnostics.id, attempt.id));
          assert.ok(stored?.startingLevel?.remainingGapStatement && stored.startingLevel.coverageNote);
          assert.equal(stored.startingLevel.probedCapabilities.length, 8);
          assert.equal("percentCorrect" in stored.startingLevel, false);
          assert.equal((await transaction.select().from(lessonCompletions).where(eq(lessonCompletions.learnerId, learner.id))).length, 0);
        } finally {
          await app.close();
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    process.stdout.write("Starting Level live check passed; all temporary records rolled back.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(safe(`[starting-level.live-check.ts: checkStartingLevel] Live check failed || ${message}`));
  } finally {
    await db.$client.end();
  }
}

await checkStartingLevel();
