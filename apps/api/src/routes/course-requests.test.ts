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
import type { SubjectChecker } from "../lib/subject-check.ts";
import type { ValidityGate } from "../lib/validity.ts";

/** Stored Course Request fixture. */
type CourseRequest = typeof courseRequests.$inferSelect;

/** Creates an isolated Learner with a saved, all-skipped Teaching Profile. */
function savedLearner(): typeof learners.$inferSelect {
  return {
    id: randomUUID(),
    createdAt: new Date(),
    authUserId: randomUUID(),
    displayName: "Curious_Owl",
    teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers({}),
    teachingProfileAssessedAt: new Date(),
    teachingProfileUpdatedAt: new Date(),
  };
}

/** A subject checker that always finds one reading, so a Request goes straight on to Validity. */
const singleReading: SubjectChecker = { async check() { return { kind: "single" }; } };

/** Runs the real routes against isolated storage, including conditional state-transition writes. */
async function testApp(learner = savedLearner(), failWrites = false, validityGate?: ValidityGate, subjectChecker: SubjectChecker = singleReading) {
  const rows: CourseRequest[] = [];
  const dialect = new PgDialect();
  const columnKeys = {
    id: "id", learner_id: "learnerId", subject: "subject", learning_goal: "learningGoal", status: "status",
    created_at: "createdAt", validity: "validity", clarification: "clarification", subject_check: "subjectCheck", focus: "focus", revised_from_id: "revisedFromId",
    failure_reason: "failureReason", hidden_at: "hiddenAt", last_opened_at: "lastOpenedAt",
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
          const row = { id: randomUUID(), createdAt: new Date(), validity: null, clarification: null, subjectCheck: null, focus: null, revisedFromId: null, failureReason: null, hiddenAt: null, lastOpenedAt: null, ...values } as CourseRequest;
          rows.push(row);
          return [project(row, fields)];
        },
      }),
    }),
    select: (fields?: Record<string, PgColumn>) => ({
      /** Joins (the Library's Study links) only ever read tables this store leaves empty. */
      from: (table: unknown) => ({
        leftJoin() { return this; },
        where: (condition: SQL) => {
          const matched = table === courseRequests ? rows.filter((row) => matches(row, condition)) : [];
          const result = matched.map((row) => project(row, fields));
          return Object.assign(Promise.resolve(result), {
            limit: async (count: number) => result.slice(0, count),
            /** Supports only the newest-first order the Library asks for. */
            orderBy: async (...order: SQL[]) => {
              if (table !== courseRequests) return [];
              assert.match(dialect.sqlToQuery(order[0]!).sql, /"(created|published)_at" desc/);
              return [...matched].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((row) => project(row, fields));
            },
          });
        },
      }),
    }),
    /** Only Course Requests are stored here; a write to another table (a job, a checkpoint) is accepted and dropped. */
    update: (table: unknown) => ({
      set: (changes: Partial<CourseRequest>) => ({
        where: (condition: SQL) => ({
          returning: async (fields?: Record<string, PgColumn>) => {
            if (failWrites) throw new Error("Database unavailable");
            if (table !== courseRequests) return [];
            return rows.filter((row) => matches(row, condition)).map((row) => {
              Object.assign(row, changes);
              return project(row, fields);
            });
          },
        }),
      }),
    }),
    delete: (table: unknown) => ({
      where: async (condition: SQL) => {
        if (failWrites) throw new Error("Database unavailable");
        if (table !== courseRequests) return [];
        for (const row of rows.filter((candidate) => matches(candidate, condition))) rows.splice(rows.indexOf(row), 1);
        return [];
      },
    }),
    /** Restores every Request if the callback throws, as a rolled-back transaction does. */
    transaction: async <T>(run: (transaction: unknown) => Promise<T>) => {
      const snapshot = rows.map((row) => ({ ...row }));
      try {
        return await run(db);
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        throw error;
      }
    },
  };
  const app = Fastify();
  app.decorate("db", db as unknown as Database);
  app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
  await app.register(courseRequestRoutes, { validityGate, subjectChecker });
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
    assert.equal(courseRequest.status, "awaiting_subject_check");
    assert.equal(courseRequest.subjectCheck, null);
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
        status: "awaiting_subject_check",
        href: `/course-requests/${courseRequest.id}`,
        // Only the Library says when it was last opened; it picks the current course from it.
        ...(url === "/api/library" ? { lastOpenedAt: null } : {}),
      }]);
    }
    const reopened = await app.inject({ method: "GET", url: `/api/course-requests/${courseRequest.id}` });
    assert.equal(reopened.statusCode, 200);
    assert.deepEqual(reopened.json(), { courseRequest });
  } finally {
    await app.close();
  }
});

test("Opening a Course Request is noted in the Library, for the Learner's own Requests only", async () => {
  const { app, rows } = await testApp();
  try {
    const created = await app.inject({ method: "POST", url: "/api/course-requests", payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." } });
    const { courseRequest } = created.json();

    const before = Date.now();
    const opened = await app.inject({ method: "POST", url: "/api/library/opened", payload: { kind: "course_request", id: courseRequest.id } });
    assert.equal(opened.statusCode, 204);
    const [item] = (await app.inject({ method: "GET", url: "/api/library" })).json().items as { lastOpenedAt: string }[];
    assert.ok(Date.parse(item!.lastOpenedAt) >= before);

    rows[0]!.learnerId = randomUUID();
    const someoneElses = await app.inject({ method: "POST", url: "/api/library/opened", payload: { kind: "course_request", id: courseRequest.id } });
    assert.equal(someoneElses.statusCode, 404);
    const unnamed = await app.inject({ method: "POST", url: "/api/library/opened", payload: { kind: "lesson", id: courseRequest.id } });
    assert.equal(unnamed.statusCode, 400);
  } finally {
    await app.close();
  }
});

test("Library and Open items list the newest Course Request first, so a repeated subject opens the latest one", async () => {
  const { app, rows } = await testApp();
  try {
    for (const learningGoal of ["The oldest attempt.", "The middle attempt.", "The newest attempt."]) {
      await app.inject({ method: "POST", url: "/api/course-requests", payload: { subject: "Norse mythology", learningGoal } });
    }
    // Saved out of order, as rows come back from Postgres without an ORDER BY.
    rows.forEach((row, index) => { row.createdAt = new Date(Date.UTC(2026, 9, 24, 16, [5, 1, 9][index])); });
    for (const url of ["/api/library", "/api/open-items"]) {
      const items = (await app.inject({ method: "GET", url })).json().items as { learningGoal: string }[];
      assert.deepEqual(items.map((item) => item.learningGoal), ["The newest attempt.", "The oldest attempt.", "The middle attempt."], url);
    }
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

/** Saves a Request for lifecycle tests through the real creation endpoint and runs its subject check. */
async function createRequest(app: FastifyInstance) {
  const response = await app.inject({ method: "POST", url: "/api/course-requests", payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." } });
  assert.equal(response.statusCode, 201, response.body);
  const checked = await app.inject({ method: "POST", url: `/api/course-requests/${response.json().courseRequest.id}/subject-check`, payload: {} });
  assert.equal(checked.statusCode, 200, checked.body);
  return checked.json().courseRequest;
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
    assert.equal(draft.focus, null);
    const draftUrl = `/api/course-requests/${draft.id}`;
    assert.equal((await app.inject({ method: "POST", url: `${draftUrl}/validity`, payload: {} })).statusCode, 409);
    const saved = await app.inject({ method: "PATCH", url: draftUrl, payload: { subject: "  Safety  ", learningGoal: "  Learn prevention.  ", status: "validity_passed", learnerId: randomUUID() } });
    assert.equal(saved.statusCode, 200, saved.body);
    assert.equal(saved.json().courseRequest.subject, "Safety");
    assert.equal(saved.json().courseRequest.status, "awaiting_subject_check");
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), rejected.json());
    const library = await app.inject({ method: "GET", url: "/api/library" });
    assert.equal(library.json().items.find((item: { id: string }) => item.id === row.id).status, "rejected");
    assert.equal(library.json().items.find((item: { id: string }) => item.id === draft.id).status, "awaiting_subject_check");
    learner.id = randomUUID();
    for (const endpoint of [url, draftUrl]) {
      for (const [method, suffix, payload] of [["GET", "", undefined], ["POST", "/validity", {}], ["POST", "/revise", {}], ["PATCH", "", { subject: "Changed", learningGoal: "Changed" }]] as const) {
        assert.equal((await app.inject({ method, url: endpoint + suffix, payload })).statusCode, 404);
      }
    }
  } finally { await app.close(); }
});

test("Revising a failed focused Request carries the focused goal as editable text but not its focus", async () => {
  const { app, rows } = await testApp();
  try {
    const row = await createRequest(app);
    const focus = {
      outcome: "focused", originalGoal: "Explain the mythic corpus.", rounds: [],
      proposal: { learningGoal: "Retell the main stories.", scope: { inScope: ["Main stories"], outOfScope: ["Later retellings"] } },
      scope: { inScope: ["Main stories"], outOfScope: ["Later retellings"] },
    } as const;
    Object.assign(rows.find((stored) => stored.id === row.id)!, { status: "generation_failed", learningGoal: "Retell the main stories.", focus });
    const revised = await app.inject({ method: "POST", url: `/api/course-requests/${row.id}/revise` });
    assert.equal(revised.statusCode, 201, revised.body);
    const draft = revised.json().courseRequest;
    assert.equal(draft.learningGoal, "Retell the main stories.");
    assert.equal(draft.focus, null, "The draft goes through Validity and focusing again.");
  } finally { await app.close(); }
});

test("Only a rejected or failed Request is revised here: a published or generating Course is never taken apart", async () => {
  const { app, rows } = await testApp();
  try {
    const row = await createRequest(app);
    const stored = rows.find((candidate) => candidate.id === row.id)!;
    for (const status of ["published", "generating", "generation_cancelled", "blueprint_review", "draft"] as const) {
      Object.assign(stored, { status });
      const revised = await app.inject({ method: "POST", url: `/api/course-requests/${row.id}/revise` });
      assert.equal(revised.statusCode, 409, `${status}: ${revised.body}`);
      assert.deepEqual(revised.json(), { error: "Only a rejected or failed Request can be revised here." });
      assert.equal(stored.status, status, "The Request is unchanged.");
      assert.equal(rows.length, 1, "No draft is created.");
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
test("Another Learner cannot hide a Course Request or a Course from the Library: same 404 as a missing one", async () => {
  const { app, learner, rows } = await testApp();
  try {
    const { courseRequest } = (await app.inject({ method: "POST", url: "/api/course-requests", payload: { subject: "Norse mythology", learningGoal: "Explain the mythic corpus." } })).json();
    const owner = learner.id;
    learner.id = randomUUID();
    for (const payload of [{ kind: "course_request", id: courseRequest.id }, { kind: "course_request", id: randomUUID() }, { kind: "course", id: randomUUID() }]) {
      const response = await app.inject({ method: "POST", url: "/api/library/hide", payload });
      assert.equal(response.statusCode, 404);
      assert.deepEqual(response.json(), { error: "That course wasn't found." });
    }
    assert.equal(rows[0]!.hiddenAt, null);
    learner.id = owner;
    assert.equal((await app.inject({ method: "GET", url: "/api/library" })).json().items.length, 1);
  } finally {
    await app.close();
  }
});

/** The readings a two-reading check offers in these tests. */
const MERCURY = [
  { label: "Mercury (planet)", gloss: "The planet nearest the Sun" },
  { label: "Mercury (element)", gloss: "The liquid metal, Hg" },
];

/** Saves a Request without running its subject check. */
async function composeRequest(app: FastifyInstance, subject = "Mercury", learningGoal = subject) {
  const response = await app.inject({ method: "POST", url: "/api/course-requests", payload: { subject, learningGoal } });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().courseRequest as { id: string; status: string };
}

test("One reading goes straight on to Validity with the subject as typed and nothing asked", async () => {
  const seen: unknown[] = [];
  const { app } = await testApp(savedLearner(), false, undefined, {
    async check(input) { seen.push(input); return { kind: "single" }; },
  });
  try {
    const row = await composeRequest(app, "Java", "Java for Android apps");
    const checked = await app.inject({ method: "POST", url: `/api/course-requests/${row.id}/subject-check`, payload: {} });
    assert.equal(checked.statusCode, 200, checked.body);
    const { courseRequest } = checked.json();
    assert.equal(courseRequest.status, "awaiting_validity");
    assert.equal(courseRequest.subject, "Java");
    assert.deepEqual(courseRequest.subjectCheck, { outcome: "single", subjectAsTyped: "Java", readings: [], answer: null });
    assert.deepEqual(seen, [{ subject: "Java", learningGoal: "Java for Android apps" }], "The subject and the goal are read together.");
    assert.deepEqual((await app.inject({ method: "GET", url: `/api/course-requests/${row.id}` })).json(), checked.json());
    const again = await app.inject({ method: "POST", url: `/api/course-requests/${row.id}/subject-check`, payload: {} });
    assert.equal(again.statusCode, 409, "The check runs once per Request.");
    assert.equal(seen.length, 1);
  } finally { await app.close(); }
});

test("A failed subject check never blocks: the Request goes on to Validity with the subject as typed", async () => {
  const { app } = await testApp(savedLearner(), false, undefined, {
    async check() { return { kind: "check_failed", error: "[subject-check: check] Subject check failed || subject=Mercury || timeout" }; },
  });
  try {
    const row = await composeRequest(app);
    const checked = await app.inject({ method: "POST", url: `/api/course-requests/${row.id}/subject-check`, payload: {} });
    assert.equal(checked.statusCode, 200, checked.body);
    assert.equal(checked.json().courseRequest.status, "awaiting_validity");
    assert.equal(checked.json().courseRequest.subject, "Mercury");
    assert.deepEqual(checked.json().courseRequest.subjectCheck, { outcome: "check_failed", subjectAsTyped: "Mercury", readings: [], answer: null });
  } finally { await app.close(); }
});

test("Several readings ask Which did you mean?, and a picked label becomes the subject while the typed one stays recorded", async () => {
  const { app } = await testApp(savedLearner(), false, undefined, { async check() { return { kind: "several", readings: MERCURY }; } });
  try {
    const row = await composeRequest(app);
    const url = `/api/course-requests/${row.id}`;
    // Validity waits until the subject is settled.
    assert.equal((await app.inject({ method: "POST", url: `${url}/subject-choice`, payload: { answer: "Mercury (planet)", ownWords: false } })).statusCode, 409);
    const checked = await app.inject({ method: "POST", url: `${url}/subject-check`, payload: {} });
    assert.equal(checked.statusCode, 200, checked.body);
    assert.equal(checked.json().courseRequest.status, "awaiting_subject_choice");
    assert.deepEqual(checked.json().courseRequest.subjectCheck, { outcome: null, subjectAsTyped: "Mercury", readings: MERCURY, answer: null });
    assert.equal((await app.inject({ method: "POST", url: `${url}/validity`, payload: {} })).statusCode, 409);

    for (const payload of [{}, { answer: "Mercury (planet)" }, { answer: "Mercury (god)", ownWords: false }, { answer: " ", ownWords: true }, { answer: 42, ownWords: true }, { answer: "x".repeat(301), ownWords: true }]) {
      const bad = await app.inject({ method: "POST", url: `${url}/subject-choice`, payload });
      assert.equal(bad.statusCode, 400, JSON.stringify(payload));
      assert.deepEqual(bad.json(), { error: "Pick one of the subjects, or say it in a few words." });
    }
    const chosen = await app.inject({ method: "POST", url: `${url}/subject-choice`, payload: { answer: "  Mercury (planet) ", ownWords: false } });
    assert.equal(chosen.statusCode, 200, chosen.body);
    const { courseRequest } = chosen.json();
    assert.equal(courseRequest.status, "awaiting_validity");
    assert.equal(courseRequest.subject, "Mercury (planet)");
    assert.equal(courseRequest.learningGoal, "Mercury");
    assert.deepEqual(courseRequest.subjectCheck, { outcome: "chosen", subjectAsTyped: "Mercury", readings: MERCURY, answer: "Mercury (planet)" });
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), chosen.json());
    assert.equal((await app.inject({ method: "POST", url: `${url}/subject-choice`, payload: { answer: "Mercury (element)", ownWords: false } })).statusCode, 409, "There is no second round.");
  } finally { await app.close(); }
});

test("None of these takes a short typed answer, used as written and not checked again; Validity then judges it", async () => {
  let checks = 0;
  const evaluated: string[] = [];
  const { app } = await testApp(savedLearner(), false, {
    async evaluate({ subject }) { evaluated.push(subject); return { policyVersion: 1, outcome: "pass", reason: "Learnable.", safeReframe: null, question: null }; },
  }, { async check() { checks++; return { kind: "several", readings: MERCURY }; } });
  try {
    const row = await composeRequest(app);
    const url = `/api/course-requests/${row.id}`;
    await app.inject({ method: "POST", url: `${url}/subject-check`, payload: {} });
    const own = await app.inject({ method: "POST", url: `${url}/subject-choice`, payload: { answer: "  The Mercury space programme  ", ownWords: true } });
    assert.equal(own.statusCode, 200, own.body);
    assert.equal(own.json().courseRequest.subject, "The Mercury space programme");
    assert.equal(own.json().courseRequest.subjectCheck.outcome, "own_words");
    assert.equal(own.json().courseRequest.subjectCheck.answer, "The Mercury space programme");
    assert.equal(checks, 1);
    const passed = await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    assert.equal(passed.statusCode, 200, passed.body);
    assert.equal(passed.json().courseRequest.status, "validity_passed");
    assert.deepEqual(evaluated, ["The Mercury space programme"]);
  } finally { await app.close(); }
});

test("Revise request copies the settled subject into a draft whose subject is checked again", async () => {
  let checks = 0;
  const { app } = await testApp(savedLearner(), false, {
    async evaluate() { return { policyVersion: 1, outcome: "reject", reason: "A hard rule applies.", safeReframe: "Study prevention.", question: null }; },
  }, { async check() { checks++; return { kind: "several", readings: MERCURY }; } });
  try {
    const row = await composeRequest(app);
    const url = `/api/course-requests/${row.id}`;
    await app.inject({ method: "POST", url: `${url}/subject-check`, payload: {} });
    await app.inject({ method: "POST", url: `${url}/subject-choice`, payload: { answer: "Mercury (element)", ownWords: false } });
    await app.inject({ method: "POST", url: `${url}/validity`, payload: {} });
    const revised = await app.inject({ method: "POST", url: `${url}/revise` });
    assert.equal(revised.statusCode, 201, revised.body);
    const draft = revised.json().courseRequest;
    assert.equal(draft.subject, "Mercury (element)");
    assert.equal(draft.subjectCheck, null);
    const saved = await app.inject({ method: "PATCH", url: `/api/course-requests/${draft.id}`, payload: { subject: "Mercury (element)", learningGoal: "Mercury (element)" } });
    assert.equal(saved.json().courseRequest.status, "awaiting_subject_check");
    const checked = await app.inject({ method: "POST", url: `/api/course-requests/${draft.id}/subject-check`, payload: {} });
    assert.equal(checked.json().courseRequest.subjectCheck.subjectAsTyped, "Mercury (element)");
    assert.equal(checks, 2);
  } finally { await app.close(); }
});

test("The subject check and choice are private to their Learner", async () => {
  const { app, learner } = await testApp(savedLearner(), false, undefined, { async check() { return { kind: "several", readings: MERCURY }; } });
  try {
    const row = await composeRequest(app);
    const url = `/api/course-requests/${row.id}`;
    learner.id = randomUUID();
    for (const [suffix, payload] of [["/subject-check", {}], ["/subject-choice", { answer: "Mercury (planet)", ownWords: false }]] as const) {
      assert.equal((await app.inject({ method: "POST", url: url + suffix, payload })).statusCode, 404);
    }
    assert.equal((await app.inject({ method: "POST", url: "/api/course-requests/not-a-uuid/subject-check", payload: {} })).statusCode, 400);
  } finally { await app.close(); }
});

test("A subject check that loses a race to another one does not overwrite it", async () => {
  const { promise: pending, resolve: finish } = Promise.withResolvers<{ kind: "single" }>();
  const { promise: started, resolve: firstStarted } = Promise.withResolvers<void>();
  let calls = 0;
  const { app } = await testApp(savedLearner(), false, undefined, {
    async check() {
      if (++calls === 1) {
        firstStarted();
        return pending;
      }
      return { kind: "several", readings: MERCURY };
    },
  });
  try {
    const row = await composeRequest(app);
    const url = `/api/course-requests/${row.id}`;
    const first = Promise.resolve(app.inject({ method: "POST", url: `${url}/subject-check`, payload: {} }));
    await started;
    const second = await app.inject({ method: "POST", url: `${url}/subject-check`, payload: {} });
    assert.equal(second.statusCode, 200, second.body);
    finish({ kind: "single" });
    assert.equal((await first).statusCode, 409);
    assert.deepEqual((await app.inject({ method: "GET", url })).json(), second.json());
  } finally { await app.close(); }
});
