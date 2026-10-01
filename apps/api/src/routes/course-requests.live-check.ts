import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import Fastify from "fastify";
import {
  createDb,
  learners,
  loadRootEnv,
  parseTeachingProfileAnswers,
  TEACHING_PROFILE_VERSION,
  type Database,
} from "@senoy/db";
import { courseRequestRoutes } from "./course-requests.ts";
import { libraryRoutes } from "./library.ts";
import { teachingProfileRoutes } from "./teaching-profile.ts";

/**
 * Checks the real HTTP/database boundary using only temporary Learners.
 * All writes are rolled back, including when an assertion fails.
 */
async function checkCourseRequests() {
  loadRootEnv(import.meta.url, 4);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for the opt-in live check.");
  const db = createDb(url, { max: 1 });
  const learnerId = randomUUID();
  const otherLearnerId = randomUUID();
  const rollback = new Error("SEN-35 live check rollback");
  try {
    try {
      await db.transaction(async (transaction) => {
        await transaction.insert(learners).values([
          {
            id: learnerId,
            teachingProfileVersion: TEACHING_PROFILE_VERSION,
            teachingProfileAnswers: parseTeachingProfileAnswers({}),
          },
          { id: otherLearnerId },
        ]);
        let currentLearnerId = learnerId;
        const app = Fastify();
        app.decorate("db", transaction as unknown as Database);
        app.addHook("onRequest", async (request) => {
          const [learner] = await transaction.select().from(learners).where(eq(learners.id, currentLearnerId));
          assert.ok(learner);
          request.currentLearner = learner;
        });
        try {
          await app.register(courseRequestRoutes);
          await app.register(libraryRoutes);
          await app.register(teachingProfileRoutes);
          const created = await app.inject({
            method: "POST", url: "/api/course-requests",
            payload: {
              subject: "  Norse mythology  ", learningGoal: "  Explain the mythic corpus.  ",
              learnerId: otherLearnerId, status: "published",
            },
          });
          assert.equal(created.statusCode, 201, created.body);
          const { courseRequest } = created.json();
          assert.equal(courseRequest.subject, "Norse mythology");
          assert.equal(courseRequest.learningGoal, "Explain the mythic corpus.");
          assert.equal(courseRequest.status, "awaiting_validity");
          assert.equal(courseRequest.learnerId, undefined);
          const requestUrl = `/api/course-requests/${courseRequest.id}`;
          const reopened = await app.inject({ method: "GET", url: requestUrl });
          assert.equal(reopened.statusCode, 200, reopened.body);
          assert.deepEqual(reopened.json(), { courseRequest });
          for (const endpoint of ["/api/library", "/api/open-items"]) {
            const response = await app.inject({ method: "GET", url: endpoint });
            assert.equal(response.statusCode, 200, response.body);
            assert.deepEqual(response.json().items, [{
              id: courseRequest.id,
              kind: "course_request",
              title: "Norse mythology",
              learningGoal: "Explain the mythic corpus.",
              status: "awaiting_validity",
              href: `/course-requests/${courseRequest.id}`,
            }]);
          }
          currentLearnerId = otherLearnerId;
          const privateRequest = await app.inject({ method: "GET", url: requestUrl });
          assert.equal(privateRequest.statusCode, 404, privateRequest.body);
          const blocked = await app.inject({
            method: "POST", url: "/api/course-requests",
            payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." },
          });
          assert.equal(blocked.statusCode, 409, blocked.body);
          const otherLibrary = await app.inject({ method: "GET", url: "/api/library" });
          assert.deepEqual(otherLibrary.json().items, []);
          currentLearnerId = learnerId;
          const reset = await app.inject({ method: "DELETE", url: "/api/teaching-profile" });
          assert.equal(reset.statusCode, 200, reset.body);
          const history = await app.inject({ method: "GET", url: requestUrl });
          assert.equal(history.statusCode, 200, history.body);
          assert.deepEqual(history.json(), { courseRequest });
        } finally {
          await app.close();
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
    for (const id of [learnerId, otherLearnerId]) {
      const rows = await db.select().from(learners).where(eq(learners.id, id));
      assert.deepEqual(rows, [], "Temporary Learners must not survive rollback.");
    }
    process.stdout.write("Course Request live check passed; all temporary records rolled back.\n");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[course-requests.live-check.ts: checkCourseRequests] Live check failed || ${message}`);
  } finally {
    await db.$client.end();
  }
}

await checkCourseRequests();