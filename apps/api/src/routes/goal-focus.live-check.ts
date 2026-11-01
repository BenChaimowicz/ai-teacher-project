import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import {
  courseRequests,
  createDb,
  learners,
  loadRootEnv,
  parseTeachingProfileAnswers,
  TEACHING_PROFILE_VERSION,
  type CourseRequestRecord,
  type Database,
  type FocusAnswer,
  type FocusQuestion,
} from "@senoy/db";
import { goalFocusRoutes } from "./goal-focus.ts";
import { withLiveCheckTracking } from "../lib/live-check-tracking.ts";

/** Picks, per question, the option whose words best match `leaning`; an own-words answer when none do. */
function answerToward(questions: FocusQuestion[], leaning: RegExp, ownWords: string): FocusAnswer[] {
  return questions.map((question) => {
    const option = question.options.find((candidate) => leaning.test(candidate));
    return option ? { questionId: question.id, answer: option, ownWords: false } : { questionId: question.id, answer: ownWords, ownWords: true };
  });
}

/**
 * Starts focusing one Request through the real route.
 * @returns The Request after the first turn
 */
async function startFocus(app: FastifyInstance, learnerId: string, transaction: Database, subject: string, learningGoal: string): Promise<CourseRequestRecord> {
  const [row] = await transaction.insert(courseRequests).values({ learnerId, subject, learningGoal, status: "validity_passed" }).returning();
  assert.ok(row);
  const started = await app.inject({ method: "POST", url: `/api/course-requests/${row.id}/focus`, payload: {} });
  assert.equal(started.statusCode, 200, started.body);
  return started.json().courseRequest as CourseRequestRecord;
}

/**
 * Answers rounds toward one reading until the Course Guide proposes a focus.
 * @returns The Request awaiting confirmation
 */
async function focusToward(app: FastifyInstance, request: CourseRequestRecord, leaning: RegExp, ownWords: string): Promise<CourseRequestRecord> {
  let current = request;
  while (current.status === "awaiting_focus_answers") {
    const open = current.focus?.rounds.at(-1);
    assert.ok(open);
    process.stdout.write(`  Round ${current.focus!.rounds.length}:\n${open.questions.map((question) => `    ${question.question} [${question.options.join(" | ")}]`).join("\n")}\n`);
    const answered = await app.inject({
      method: "POST", url: `/api/course-requests/${current.id}/focus`, payload: { answers: answerToward(open.questions, leaning, ownWords) },
    });
    assert.equal(answered.statusCode, 200, answered.body);
    current = answered.json().courseRequest as CourseRequestRecord;
  }
  assert.equal(current.status, "awaiting_focus_confirmation");
  return current;
}

/** Exercises real OpenRouter and hosted Postgres without leaving Learner or Request records behind. Billable. */
async function checkGoalFocus() {
  loadRootEnv(import.meta.url, 4);
  if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY) throw new Error("DATABASE_URL and OPENROUTER_API_KEY are required for the goal focus live check.");
  const db = createDb(process.env.DATABASE_URL, { max: 1 });
  const rollback = new Error("SEN-90 live check rollback");
  try {
    try {
      await db.transaction(async (transaction) => {
        const [learner] = await transaction.insert(learners).values({ id: randomUUID(), displayName: "Curious_Owl", teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}) }).returning();
        assert.ok(learner);
        const app = Fastify({ logger: { level: "error" } });
        app.decorate("db", transaction as unknown as Database);
        app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
        await app.register(goalFocusRoutes);
        const database = transaction as unknown as Database;
        try {
          const broadGoal = "explain the main stories and figures in the Norse mythic corpus";
          const precise = await startFocus(app, learner.id, database, "Norse mythology", "name the Æsir and Vanir and how they are related");
          assert.equal(precise.status, "goal_focused", JSON.stringify(precise.focus));
          assert.equal(precise.focus?.outcome, "precise");
          process.stdout.write("Precise goal passed straight through.\n");

          const readings = [
            { name: "pantheon structure", leaning: /pantheon|gods|Æsir|Vanir|famil|relat|structure|who/i, ownWords: "How the gods are organised into families and groups" },
            { name: "sources and scholarship", leaning: /source|Edda|manuscript|scholar|text|where|written|origin/i, ownWords: "Where the myths come from: the medieval sources and how scholars read them" },
          ];
          for (const reading of readings) {
            const broad = await startFocus(app, learner.id, database, "Norse mythology", broadGoal);
            assert.equal(broad.status, "awaiting_focus_answers", JSON.stringify(broad.focus));
            process.stdout.write(`Broad goal, answered toward ${reading.name}:\n`);
            const proposed = await focusToward(app, broad, reading.leaning, reading.ownWords);
            const proposal = proposed.focus!.proposal!;
            process.stdout.write(`  Proposal: ${proposal.learningGoal}\n  In scope: ${proposal.scope.inScope.join("; ")}\n  Out of scope: ${proposal.scope.outOfScope.join("; ")}\n`);
            const confirmed = await app.inject({ method: "POST", url: `/api/course-requests/${proposed.id}/focus/confirm` });
            assert.equal(confirmed.statusCode, 200, confirmed.body);
            const focused = confirmed.json().courseRequest as CourseRequestRecord;
            assert.equal(focused.status, "goal_focused");
            assert.equal(focused.learningGoal, proposal.learningGoal);
            assert.deepEqual(focused.focus?.scope, proposal.scope);
          }
        } finally { await app.close(); }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    process.stdout.write("Goal focus live check passed; all temporary records rolled back.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[goal-focus.live-check.ts: checkGoalFocus] Live check failed || ${message}`);
  } finally { await db.$client.end(); }
}

await withLiveCheckTracking("check:goal-focus:live", checkGoalFocus);
