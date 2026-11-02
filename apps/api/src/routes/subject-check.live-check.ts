import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { createDb, learners, loadRootEnv, parseTeachingProfileAnswers, TEACHING_PROFILE_VERSION, type CourseRequestRecord, type Database } from "@senoy/db";
import { courseRequestRoutes } from "./course-requests.ts";
import { withLiveCheckTracking } from "../lib/live-check-tracking.ts";

/** Exercises the real triage model and hosted Postgres without leaving Learner or Request records behind (SEN-124). */
async function checkSubjectCheck() {
  loadRootEnv(import.meta.url, 4);
  if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY) throw new Error("DATABASE_URL and OPENROUTER_API_KEY are required for the subject check live check.");
  const db = createDb(process.env.DATABASE_URL, { max: 1 });
  const rollback = new Error("SEN-124 live check rollback");
  try {
    try {
      await db.transaction(async (transaction) => {
        const [learner] = await transaction.insert(learners).values({ id: randomUUID(), displayName: "Curious_Owl", teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}) }).returning();
        assert.ok(learner);
        const app = Fastify({ logger: { level: "error" } });
        app.decorate("db", transaction as unknown as Database);
        app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
        await app.register(courseRequestRoutes);
        /** Saves one Request through HTTP and runs its subject check on the real triage model. */
        async function check(subject: string, learningGoal: string, expected: CourseRequestRecord["status"]): Promise<CourseRequestRecord> {
          const created = await app.inject({ method: "POST", url: "/api/course-requests", payload: { subject, learningGoal } });
          assert.equal(created.statusCode, 201, created.body);
          const id = created.json().courseRequest.id;
          const checked = await app.inject({ method: "POST", url: `/api/course-requests/${id}/subject-check`, payload: {} });
          assert.equal(checked.statusCode, 200, checked.body);
          const row = checked.json().courseRequest as CourseRequestRecord;
          assert.notEqual(row.subjectCheck?.outcome, "check_failed", `${subject}: the triage call failed`);
          assert.equal(row.status, expected, checked.body);
          assert.deepEqual((await app.inject({ method: "GET", url: `/api/course-requests/${id}` })).json(), { courseRequest: row });
          const readings = row.subjectCheck?.readings.map((reading) => `${reading.label} — ${reading.gloss}`).join("; ") || "one reading";
          process.stdout.write(`${subject} / ${learningGoal}: ${row.status} (${readings})\n`);
          return row;
        }
        try {
          const mercury = await check("Mercury", "Mercury", "awaiting_subject_choice");
          assert.ok((mercury.subjectCheck?.readings.length ?? 0) >= 2);
          await check("Java", "Java", "awaiting_subject_choice");
          await check("Norse mythology", "Norse mythology", "awaiting_validity");
          await check("Java", "Java for Android apps", "awaiting_validity");
          const label = mercury.subjectCheck!.readings[0]!.label;
          const chosen = await app.inject({ method: "POST", url: `/api/course-requests/${mercury.id}/subject-choice`, payload: { answer: label, ownWords: false } });
          assert.equal(chosen.statusCode, 200, chosen.body);
          const settled = chosen.json().courseRequest as CourseRequestRecord;
          assert.equal(settled.status, "awaiting_validity");
          assert.equal(settled.subject, label);
          assert.equal(settled.subjectCheck?.subjectAsTyped, "Mercury");
          process.stdout.write(`Picked "${label}": the subject is settled and Validity is next.\n`);
        } finally { await app.close(); }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
    process.stdout.write("Subject check live check passed; all temporary records rolled back.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[subject-check.live-check.ts: checkSubjectCheck] Live check failed || ${message}`);
  } finally { await db.$client.end(); }
}

await withLiveCheckTracking("check:subject-check:live", checkSubjectCheck);
