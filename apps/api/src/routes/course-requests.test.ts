import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import Fastify from "fastify";
import {
  courseRequests,
  learners,
  parseTeachingProfileAnswers,
  TEACHING_PROFILE_VERSION,
  type Database,
} from "@senoy/db";
import { courseRequestRoutes } from "./course-requests.ts";
import { libraryRoutes } from "./library.ts";

/** Stored Course Request fixture. */
type CourseRequest = typeof courseRequests.$inferSelect;

/** Creates an isolated Learner with a saved, all-skipped Teaching Profile. */
function savedLearner(): typeof learners.$inferSelect {
  return {
    id: randomUUID(),
    createdAt: new Date(),
    teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers({}),
    teachingProfileAssessedAt: new Date(),
    teachingProfileUpdatedAt: new Date(),
  };
}

/**
 * Runs real HTTP handlers against a small in-memory database boundary.
 * Only Course Request equality queries and empty published-Course queries are supported.
 */
async function testApp(learner = savedLearner(), failWrites = false) {
  const rows: CourseRequest[] = [];
  const dialect = new PgDialect();
  const db = {
    insert: () => ({
      values: (values: typeof courseRequests.$inferInsert) => ({
        returning: async () => {
          if (failWrites) throw new Error("Database unavailable");
          const row = { id: randomUUID(), createdAt: new Date(), ...values } as CourseRequest;
          rows.push(row);
          return [row];
        },
      }),
    }),
    select: () => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          const params = dialect.sqlToQuery(condition).params;
          const result = table === courseRequests
            ? rows.filter((row) => params.every((value) => value === row.id || value === row.learnerId))
            : [];
          return Object.assign(Promise.resolve(result), {
            limit: async (count: number) => result.slice(0, count),
          });
        },
      }),
    }),
  };
  const app = Fastify();
  app.decorate("db", db as unknown as Database);
  app.addHook("onRequest", async (request) => {
    request.currentLearner = learner;
  });
  await app.register(courseRequestRoutes);
  await app.register(libraryRoutes);
  return { app, learner };
}

test("Learner can save a subject and Learning Goal as an unpublished Course Request", async () => {
  const { app } = await testApp();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/course-requests",
      payload: {
        subject: "  Norse mythology  ",
        learningGoal: "  Explain the mythic corpus.  ",
        learnerId: randomUUID(),
        status: "published",
      },
    });
    assert.equal(response.statusCode, 201);
    const { courseRequest } = response.json();
    assert.match(courseRequest.id, /^[\da-f-]{36}$/);
    assert.equal(courseRequest.subject, "Norse mythology");
    assert.equal(courseRequest.learningGoal, "Explain the mythic corpus.");
    assert.equal(courseRequest.status, "awaiting_validity");
    assert.ok(!Number.isNaN(Date.parse(courseRequest.createdAt)));
    assert.equal(courseRequest.learnerId, undefined);
    const reopened = await app.inject({ method: "GET", url: `/api/course-requests/${courseRequest.id}` });
    assert.equal(reopened.statusCode, 200, "A supplied learnerId must not change Request ownership.");
    assert.deepEqual(reopened.json(), { courseRequest });
  } finally {
    await app.close();
  }
});

test("Course Request requires a saved current-version Teaching Profile", async () => {
  for (const profile of [
    { teachingProfileVersion: null, teachingProfileAnswers: null },
    { teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: null },
    { teachingProfileVersion: 0, teachingProfileAnswers: parseTeachingProfileAnswers({}) },
  ]) {
    const { app } = await testApp({ ...savedLearner(), ...profile });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/course-requests",
        payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." },
      });
      assert.equal(response.statusCode, 409);
      assert.deepEqual(response.json(), { error: "Save your Teaching Profile before creating a Course Request." });
      const library = await app.inject({ method: "GET", url: "/api/library" });
      assert.deepEqual(library.json().items, []);
    } finally {
      await app.close();
    }
  }
});

test("Course Request rejects missing, non-string, and whitespace-only fields without saving", async () => {
  const { app } = await testApp();
  try {
    for (const payload of [
      {}, null, [], "not an object",
      { subject: "Norse mythology" },
      { learningGoal: "Explain the mythic corpus." },
      { subject: 42, learningGoal: "Explain the mythic corpus." },
      { subject: "Norse mythology", learningGoal: ["Explain the mythic corpus."] },
      { subject: " \n\t ", learningGoal: "Explain the mythic corpus." },
      { subject: "Norse mythology", learningGoal: " \n\t " },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/course-requests",
        headers: { "content-type": "application/json" },
        payload: JSON.stringify(payload),
      });
      assert.equal(response.statusCode, 400, JSON.stringify(payload));
      assert.deepEqual(response.json(), { error: "Enter a subject and Learning Goal." });
    }
    const library = await app.inject({ method: "GET", url: "/api/library" });
    assert.deepEqual(library.json().items, []);
  } finally {
    await app.close();
  }
});

test("Saved Course Request can be reopened from Library and Open items", async () => {
  const { app } = await testApp();
  try {
    const created = await app.inject({
      method: "POST", url: "/api/course-requests",
      payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." },
    });
    const { courseRequest } = created.json();
    for (const url of ["/api/library", "/api/open-items"]) {
      const response = await app.inject({ method: "GET", url });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json().items, [{
        id: courseRequest.id,
        kind: "course_request",
        title: "Norse mythology",
        learningGoal: "Explain the mythic corpus.",
        status: "awaiting_validity",
        href: `/course-requests/${courseRequest.id}`,
      }]);
    }
    const reopened = await app.inject({ method: "GET", url: `/api/course-requests/${courseRequest.id}` });
    assert.equal(reopened.statusCode, 200);
    assert.deepEqual(reopened.json(), { courseRequest });
  } finally {
    await app.close();
  }
});

test("Course Request history stays readable after Profile reset but is private to its Learner", async () => {
  const { app, learner } = await testApp();
  try {
    const created = await app.inject({
      method: "POST", url: "/api/course-requests",
      payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." },
    });
    const { courseRequest } = created.json();
    learner.teachingProfileVersion = null;
    learner.teachingProfileAnswers = null;
    const history = await app.inject({ method: "GET", url: `/api/course-requests/${courseRequest.id}` });
    assert.equal(history.statusCode, 200);
    learner.id = randomUUID();
    for (const id of [courseRequest.id, randomUUID()]) {
      const response = await app.inject({ method: "GET", url: `/api/course-requests/${id}` });
      assert.equal(response.statusCode, 404);
      assert.deepEqual(response.json(), { error: "Course Request not found." });
    }
    const library = await app.inject({ method: "GET", url: "/api/library" });
    assert.deepEqual(library.json().items, []);
    const invalid = await app.inject({ method: "GET", url: "/api/course-requests/not-a-uuid" });
    assert.equal(invalid.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("Persistence failure is reported without claiming the Course Request was saved", async () => {
  const { app } = await testApp(savedLearner(), true);
  try {
    const response = await app.inject({
      method: "POST", url: "/api/course-requests",
      payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." },
    });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "Failed to save Course Request." });
    const library = await app.inject({ method: "GET", url: "/api/library" });
    assert.deepEqual(library.json().items, []);
  } finally {
    await app.close();
  }
});