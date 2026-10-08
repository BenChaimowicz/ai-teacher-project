import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance } from "fastify";
import {
  courseRequests,
  learners,
  parseTeachingProfileAnswers,
  TEACHING_PROFILE_VERSION,
  type Database,
  type ValidityResult,
} from "@senoy/db";
import { courseRequestRoutes } from "./course-requests.ts";
import { libraryRoutes } from "./library.ts";
import type { ValidityGate } from "../lib/validity.ts";

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

/** Runs the real routes against isolated storage, including conditional state-transition writes. */
async function testApp(learner = savedLearner(), failWrites = false, validityGate?: ValidityGate) {
  const rows: CourseRequest[] = [];
  const dialect = new PgDialect();
  const columnKeys = {
    id: "id", learner_id: "learnerId", subject: "subject", learning_goal: "learningGoal", status: "status",
    created_at: "createdAt", validity: "validity", clarification: "clarification", revised_from_id: "revisedFromId",
  } as const;
  /** Projects precisely the selected columns, as Postgres does. */
  function project(row: CourseRequest, fields?: Record<string, PgColumn>) {
    if (!fields) return { ...row };
    return Object.fromEntries(Object.entries(fields).map(([key, column]) => [key, row[columnKeys[column.name as keyof typeof columnKeys]]]));
  }
  /** Evaluates only the equality/null predicates used by these routes. */
  function matches(row: CourseRequest, condition: SQL) {
    const query = dialect.sqlToQuery(condition);
    return [...query.sql.matchAll(/"course_requests"\."(\w+)"\s*(=\s*\$(\d+)|is null)/gi)].every((match) => {
      const value = row[columnKeys[match[1] as keyof typeof columnKeys]];
      if (!match[3]) return value === null;
      const expected = query.params[Number(match[3]) - 1];
      return typeof value === "object" && value !== null
        ? JSON.stringify(value) === (typeof expected === "string" ? expected : JSON.stringify(expected))
        : value === expected;
    });
  }
  const db = {
    insert: () => ({
      values: (values: typeof courseRequests.$inferInsert) => ({
        returning: async (fields?: Record<string, PgColumn>) => {
          if (failWrites) throw new Error("Database unavailable");
          const row = { id: randomUUID(), createdAt: new Date(), validity: null, clarification: null, revisedFromId: null, ...values } as CourseRequest;
          rows.push(row);
          return [project(row, fields)];
        },
      }),
    }),
    select: (fields?: Record<string, PgColumn>) => ({
      from: (table: unknown) => ({
        where: (condition: SQL) => {
          const result = table === courseRequests ? rows.filter((row) => matches(row, condition)).map((row) => project(row, fields)) : [];
          return Object.assign(Promise.resolve(result), { limit: async (count: number) => result.slice(0, count) });
        },
      }),
    }),
    update: () => ({
      set: (changes: Partial<CourseRequest>) => ({
        where: (condition: SQL) => ({
          returning: async (fields?: Record<string, PgColumn>) => {
            if (failWrites) throw new Error("Database unavailable");
            return rows.filter((row) => matches(row, condition)).map((row) => {
              Object.assign(row, changes);
              return project(row, fields);
            });
          },
        }),
      }),
    }),
  };
  const app = Fastify();
  app.decorate("db", db as unknown as Database);
  app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
  await app.register(courseRequestRoutes, { validityGate });
  await app.register(libraryRoutes);
  return { app, learner, rows };
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

/** Saves a Request for lifecycle tests through the real creation endpoint. */
async function createRequest(app: FastifyInstance) {
  const response = await app.inject({ method: "POST", url: "/api/course-requests", payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().courseRequest;
}

test("A passed validity outcome survives reopening and cannot be re-reviewed or edited", async () => {
  const { app } = await testApp(savedLearner(), false, {
    async evaluate() { return { policyVersion: 1, outcome: "pass", reason: "The mythic corpus can be studied.", safeReframe: null, question: null }; },
  });
  try {
    const row = await createRequest(app);
    const url = `/api/course-requests/${row.id}`;
    const reviewed = await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    assert.equal(reviewed.statusCode, 200, reviewed.body);
    assert.equal(reviewed.json().courseRequest.status, "validity_passed");
    const reopened = await app.inject({ method: "GET", url });
    assert.deepEqual(reopened.json(), reviewed.json());
    for (const [method, endpoint, payload] of [["POST", `${url}/validity`, {}], ["PATCH", url, { subject: "Other", learningGoal: "Different" }]] as const) {
      assert.equal((await app.inject({ method, url: endpoint, payload })).statusCode, 409);
    }
    const history = await app.inject({ method: "GET", url });
    assert.deepEqual(history.json(), reviewed.json());
  } finally { await app.close(); }
});

test("Clarification requires an answer and persists the confirmed outcome and response", async () => {
  let call = 0;
  const { app } = await testApp(savedLearner(), false, {
    async evaluate() {
      return ++call === 1
        ? { policyVersion: 1, outcome: "clarify", reason: "The intended framing is unclear.", question: "Is this mythology or real-world animal care?", safeReframe: null }
        : { policyVersion: 1, outcome: "reject", reason: "Real-world unicorn care relies on an unsupported premise.", question: null, safeReframe: "Study unicorns in mythology." };
    },
  });
  try {
    const row = await createRequest(app);
    const url = `/api/course-requests/${row.id}`;
    assert.equal((await app.inject({ method: "POST", url: `${url}/validity`, payload: { answer: "premature" } })).statusCode, 400);
    const clarified = await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    assert.equal(clarified.statusCode, 200, clarified.body);
    assert.equal(clarified.json().courseRequest.status, "awaiting_clarification");
    for (const answer of [undefined, " ", 42]) {
      assert.equal((await app.inject({ method: "POST", url: `${url}/validity`, payload: { answer } })).statusCode, 400);
    }
    assert.equal(call, 1, "Missing answers must not consume a model call or alter the outcome.");
    const rejected = await app.inject({ method: "POST", url: `${url}/validity`, payload: { answer: "  Real-world animal care.  " } });
    assert.equal(rejected.statusCode, 200, rejected.body);
    assert.equal(rejected.json().courseRequest.status, "rejected");
    assert.deepEqual(rejected.json().courseRequest.clarification, { question: "Is this mythology or real-world animal care?", answer: "Real-world animal care." });
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), rejected.json());
  } finally { await app.close(); }
});

test("Revise creates an editable new Request while rejected history and ownership remain intact", async () => {
  const { app, learner } = await testApp(savedLearner(), false, {
    async evaluate() { return { policyVersion: 1, outcome: "reject", reason: "Operational harmful instruction is not supported.", safeReframe: "Study safety and prevention.", question: null }; },
  });
  try {
    const row = await createRequest(app);
    const url = `/api/course-requests/${row.id}`;
    const rejected = await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    const revised = await app.inject({ method: "POST", url: `${url}/revise` });
    assert.equal(revised.statusCode, 201, revised.body);
    const draft = revised.json().courseRequest;
    assert.notEqual(draft.id, row.id);
    assert.equal(draft.status, "draft");
    assert.equal(draft.revisedFromId, row.id);
    assert.equal(draft.validity, null);
    const draftUrl = `/api/course-requests/${draft.id}`;
    assert.equal((await app.inject({ method: "POST", url: `${draftUrl}/validity`, payload: {} })).statusCode, 409);
    const saved = await app.inject({ method: "PATCH", url: draftUrl, payload: { subject: "  Safety  ", learningGoal: "  Learn prevention.  ", status: "validity_passed", learnerId: randomUUID() } });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().courseRequest.subject, "Safety");
    assert.equal(saved.json().courseRequest.status, "awaiting_validity");
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), rejected.json());
    const library = await app.inject({ method: "GET", url: "/api/library" });
    assert.equal(library.json().items.find((item: { id: string }) => item.id === row.id).status, "rejected");
    assert.equal(library.json().items.find((item: { id: string }) => item.id === draft.id).status, "awaiting_validity");
    learner.id = randomUUID();
    for (const endpoint of [url, draftUrl]) {
      for (const [method, suffix, payload] of [["GET", "", undefined], ["POST", "/validity", {}], ["POST", "/revise", {}], ["PATCH", "", { subject: "Changed", learningGoal: "Changed" }]] as const) {
        assert.equal((await app.inject({ method, url: endpoint + suffix, payload })).statusCode, 404);
      }
    }
  } finally { await app.close(); }
});

test("A provider interruption leaves the pending Request intact and permits review to finish later", async () => {
  let fail = true;
  const { app } = await testApp(savedLearner(), false, {
    async evaluate() {
      if (fail) throw new Error("Provider unavailable");
      return { policyVersion: 1, outcome: "pass", reason: "Learnable.", safeReframe: null, question: null };
    },
  });
  try {
    const row = await createRequest(app);
    const url = `/api/course-requests/${row.id}`;
    const failed = await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    assert.equal(failed.statusCode, 502);
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), { courseRequest: row });
    fail = false;
    const passed = await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    assert.equal(passed.statusCode, 200, passed.body);
    assert.equal(passed.json().courseRequest.status, "validity_passed");
  } finally { await app.close(); }
});

test("An older concurrent review cannot overwrite a newer persisted decision", async () => {
  const { promise: pendingOld, resolve: finishOld } = Promise.withResolvers<ValidityResult>();
  const { promise: started, resolve: oldStarted } = Promise.withResolvers<void>();
  let calls = 0;
  const { app } = await testApp(savedLearner(), false, {
    async evaluate() {
      if (++calls === 1) {
        oldStarted();
        return pendingOld;
      }
      return { policyVersion: 1, outcome: "reject", reason: "A hard rule applies.", safeReframe: "Study prevention.", question: null };
    },
  });
  try {
    const row = await createRequest(app);
    const url = `/api/course-requests/${row.id}`;
    const old = app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    const oldResponse = Promise.resolve(old);
    await started;
    const newer = await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    assert.equal(newer.statusCode, 200, newer.body);
    finishOld({ policyVersion: 1, outcome: "pass", reason: "Stale pass.", safeReframe: null, question: null });
    assert.equal((await oldResponse).statusCode, 409);
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), newer.json());
  } finally { await app.close(); }
});