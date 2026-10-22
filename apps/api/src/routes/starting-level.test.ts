import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import {
  courseRequests,
  learners,
  lessonCompletions,
  parseTeachingProfileAnswers,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  type CourseRequestStatus,
  type DiagnosticItem,
} from "@senoy/db";
import { DiagnosticFailedError, type DiagnosticBuilder, type DiagnosticDraft, type GapStatementInput } from "../lib/diagnostic.ts";
import { fakeDb } from "./fake-db.ts";
import { ASSESSMENT_FAILED_REASON, PREPARE_FAILED_REASON, PREPARE_INTERRUPTED_REASON, startingLevelRoutes } from "./starting-level.ts";

/** A Learner with a saved Teaching Profile. */
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

/** Eight prepared items, span-ordered; every key is option 1. */
const draft: DiagnosticDraft = {
  capabilities: Array.from({ length: 8 }, (_, i) => ({ id: `cap${i + 1}`, statement: `Capability ${i + 1}`, itemId: `item${i + 1}`, span: i + 1 })),
  items: Array.from({ length: 8 }, (_, i): DiagnosticItem => ({
    id: `item${i + 1}`, capabilityId: `cap${i + 1}`, kind: i < 2 ? "application" : "knowledge",
    stem: `Question ${i + 1}?`, options: ["A", "B", "C"], keyIndex: 1, warrant: `SECRET warrant ${i + 1}`,
  })),
  reviews: [],
  coverageNote: "Written knowledge only; not kit playing.",
  authorModelId: "fixture/author",
  judgeModelId: "fixture/judge",
  factCheckVendor: "you-research",
};

/** How a fixture preparation fails: a provider error, or a set that failed its checks with both Generators. */
type Failure = "provider" | "checks" | null;

/** Builder fixture that records gap-statement inputs; `fail` makes preparation throw. */
function fixtureBuilder(fail: Failure = null) {
  const gapInputs: GapStatementInput[] = [];
  const builder: DiagnosticBuilder = {
    async build() {
      if (fail === "provider") throw new Error("provider down");
      if (fail === "checks") throw new DiagnosticFailedError({ item3: ["The reviewer found more than one defensible answer."] });
      return structuredClone(draft);
    },
    async writeGapStatement(input) {
      gapInputs.push(input);
      return `Gap statement ${gapInputs.length} (${input.extremity})`;
    },
  };
  return { builder, gapInputs };
}

/** Runs the real routes on in-memory storage with one Course Request in `status`. */
async function testApp(status: CourseRequestStatus = "validity_passed", fail: Failure = null) {
  const learner = savedLearner();
  const { db, rows, inserts } = fakeDb([courseRequests, startingLevelDiagnostics, lessonCompletions]);
  const { builder, gapInputs } = fixtureBuilder(fail);
  const app = Fastify();
  app.decorate("db", db);
  app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
  await app.register(startingLevelRoutes, { diagnosticBuilder: builder });
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner.id, subject: "Drums", learningGoal: "Play Iris by the Goo Goo Dolls", status,
  }).returning();
  const url = `/api/course-requests/${request!.id}/diagnostic`;
  return { app, rows, inserts, gapInputs, url, requestRow: rows.get(courseRequests)![0]! };
}

/** Answers keyed by item: the listed item numbers are correct, the rest are I don't know. */
function answers(...correct: number[]) {
  return Object.fromEntries(draft.items.map((item, i) => [item.id, correct.includes(i + 1) ? 1 : "dont_know"]));
}

test("Starting the diagnostic prepares eight items and never sends keys, warrants, or capabilities", async () => {
  const { app, rows, url, requestRow } = await testApp();
  try {
    const response = await app.inject({ method: "POST", url });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.courseRequest.status, "assessment_ready");
    assert.equal(body.diagnostic.items.length, 8);
    assert.deepEqual(Object.keys(body.diagnostic.items[0]).sort(), ["id", "options", "stem"]);
    assert.ok(!response.body.includes("SECRET") && !response.body.includes("keyIndex") && !response.body.includes("Capability 1"));
    assert.equal(requestRow.status, "assessment_ready");
    const [attempt] = rows.get(startingLevelDiagnostics)!;
    assert.equal(attempt!.authorModelId, "fixture/author");
    assert.equal(attempt!.judgeModelId, "fixture/judge");
    assert.equal(attempt!.factCheckVendor, "you-research");
    const reopened = await app.inject({ method: "GET", url });
    assert.equal(reopened.statusCode, 200);
    assert.ok(!reopened.body.includes("SECRET") && !reopened.body.includes("keyIndex"));
    assert.equal(reopened.json().diagnostic.items.length, 8);
  } finally {
    await app.close();
  }
});

test("A diagnostic only starts after the Validity gate passes, once", async () => {
  for (const status of ["awaiting_validity", "rejected", "assessment_ready"] as const) {
    const { app, url } = await testApp(status);
    try {
      assert.equal((await app.inject({ method: "POST", url })).statusCode, 409);
    } finally {
      await app.close();
    }
  }
});

test("A provider failure returns the Request to where it started, with a reason and Try again", async () => {
  const { app, url, requestRow } = await testApp("validity_passed", "provider");
  try {
    const response = await app.inject({ method: "POST", url });
    assert.equal(response.statusCode, 200, "The failure is a saved state, not a lost request.");
    assert.deepEqual([response.json().courseRequest.status, response.json().courseRequest.failureReason], ["validity_passed", PREPARE_FAILED_REASON]);
    assert.equal(requestRow.status, "validity_passed");
    assert.equal(requestRow.failureReason, PREPARE_FAILED_REASON);
  } finally {
    await app.close();
  }
});

test("A set failing its checks with both Generators is assessment-failed; Retry diagnostic is the one way on", async () => {
  const { app, url, requestRow } = await testApp("validity_passed", "checks");
  try {
    const failed = await app.inject({ method: "POST", url });
    assert.deepEqual([failed.json().courseRequest.status, failed.json().courseRequest.failureReason], ["assessment_failed", ASSESSMENT_FAILED_REASON]);
    assert.equal(requestRow.status, "assessment_failed");
    assert.equal(failed.json().diagnostic, null, "No Starting Level is invented.");
    for (const action of ["/answers", "/confirm", "/too-easy"]) {
      assert.equal((await app.inject({ method: "POST", url: `${url}${action}`, payload: {} })).statusCode, 409);
    }
  } finally {
    await app.close();
  }
});

test("Retry diagnostic prepares a fresh set and clears the reason", async () => {
  const { app, url, requestRow } = await testApp("assessment_failed");
  try {
    Object.assign(requestRow, { failureReason: ASSESSMENT_FAILED_REASON });
    const retried = await app.inject({ method: "POST", url });
    assert.deepEqual([retried.json().courseRequest.status, retried.json().courseRequest.failureReason], ["assessment_ready", null]);
  } finally {
    await app.close();
  }
});

test("A check left preparing by an API restart can be started again", async () => {
  const { app, url, requestRow } = await testApp("assessment_preparing");
  try {
    const reopened = await app.inject({ method: "GET", url });
    assert.deepEqual([reopened.json().courseRequest.status, reopened.json().courseRequest.failureReason], ["validity_passed", PREPARE_INTERRUPTED_REASON]);
    assert.equal(requestRow.status, "validity_passed");
    const started = await app.inject({ method: "POST", url });
    assert.deepEqual([started.json().courseRequest.status, started.json().courseRequest.failureReason], ["assessment_ready", null]);
  } finally {
    await app.close();
  }
});

test("A check still being prepared by this process is left alone", async () => {
  const learner = savedLearner();
  const { db, rows } = fakeDb([courseRequests, startingLevelDiagnostics]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const app = Fastify();
  app.decorate("db", db);
  app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
  await app.register(startingLevelRoutes, {
    diagnosticBuilder: { async build() { await gate; return structuredClone(draft); }, async writeGapStatement() { return "Gap"; } },
  });
  const [request] = await db.insert(courseRequests).values({ learnerId: learner.id, subject: "Drums", learningGoal: "Play", status: "validity_passed" }).returning();
  const url = `/api/course-requests/${request!.id}/diagnostic`;
  try {
    const preparing = app.inject({ method: "POST", url });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal((await app.inject({ method: "GET", url })).json().courseRequest.status, "assessment_preparing");
    release();
    assert.equal((await preparing).json().courseRequest.status, "assessment_ready");
    assert.equal(rows.get(courseRequests)![0]!.status, "assessment_ready");
  } finally {
    await app.close();
  }
});

test("Submitting answers yields a remaining-gap statement without per-item correctness or a Progress write", async () => {
  const { app, rows, inserts, gapInputs, url, requestRow } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    const response = await app.inject({ method: "POST", url: `${url}/answers`, payload: { answers: answers(1, 3, 5) } });
    assert.equal(response.statusCode, 200);
    const { diagnostic, courseRequest } = response.json();
    assert.equal(courseRequest.status, "awaiting_gap_confirmation");
    assert.equal(diagnostic.result.remainingGapStatement, "Gap statement 1 (mixed)");
    assert.equal(diagnostic.result.coverageNote, "Written knowledge only; not kit playing.");
    assert.equal(diagnostic.result.extremity, "mixed");
    assert.equal(diagnostic.result.canExpandGap, true);
    assert.ok(!/correct|incorrect|dont_know|percent/i.test(JSON.stringify(diagnostic)), "No per-item correctness or percent reaches the browser.");
    assert.deepEqual(gapInputs[0]!.capabilities.filter((c) => c.status === "correct").map((c) => c.span), [1, 3, 5]);
    const stored = rows.get(startingLevelDiagnostics)![0]!.startingLevel as { learningGoal: string; extremity: string };
    assert.equal(stored.learningGoal, "Play Iris by the Goo Goo Dolls");
    assert.equal(requestRow.status, "awaiting_gap_confirmation");
    assert.equal(inserts.filter((insert) => insert.table === lessonCompletions).length, 0);
  } finally {
    await app.close();
  }
});

test("Answers must cover exactly the attempt's items with an option or I don't know", async () => {
  const { app, url } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    for (const payload of [
      { answers: { ...answers(), item1: 3 } },
      { answers: { ...answers(), item9: 0 } },
      { answers: { item1: 0 } },
      {},
    ]) {
      assert.equal((await app.inject({ method: "POST", url: `${url}/answers`, payload })).statusCode, 400);
    }
  } finally {
    await app.close();
  }
});

test("Too easy from ceiling widens the gap, shows the ordinary screen, and keeps the real answers", async () => {
  const { app, rows, gapInputs, url } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    const scored = await app.inject({ method: "POST", url: `${url}/answers`, payload: { answers: answers(1, 2, 3, 4, 5, 6, 7) } });
    assert.equal(scored.json().diagnostic.result.extremity, "ceiling");
    const widened = await app.inject({ method: "POST", url: `${url}/too-easy` });
    assert.equal(widened.statusCode, 200);
    assert.equal(widened.json().diagnostic.result.extremity, "mixed");
    assert.equal(widened.json().diagnostic.result.remainingGapStatement, "Gap statement 2 (mixed)");
    assert.equal(widened.json().courseRequest.status, "awaiting_gap_confirmation");
    const stored = rows.get(startingLevelDiagnostics)![0]!.startingLevel as { probedCapabilities: { span: number; status: string; expandedByLearner: boolean }[] };
    assert.deepEqual(stored.probedCapabilities.filter((c) => c.expandedByLearner).map((c) => c.span), [1, 2]);
    assert.equal(stored.probedCapabilities.filter((c) => c.status === "correct").length, 7);
    assert.equal(gapInputs.length, 2);
  } finally {
    await app.close();
  }
});

test("Too easy is refused once nothing is evidenced", async () => {
  const { app, url } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    await app.inject({ method: "POST", url: `${url}/answers`, payload: { answers: answers() } });
    assert.equal((await app.inject({ method: "POST", url: `${url}/too-easy` })).statusCode, 409);
  } finally {
    await app.close();
  }
});

test("Looks right confirms an ordinary gap; Short Course is only for ceiling", async () => {
  const { app, rows, url, requestRow } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    await app.inject({ method: "POST", url: `${url}/answers`, payload: { answers: answers(1, 2, 3) } });
    assert.equal((await app.inject({ method: "POST", url: `${url}/confirm`, payload: { choice: "short_course" } })).statusCode, 409);
    const confirmed = await app.inject({ method: "POST", url: `${url}/confirm`, payload: { choice: "looks_right" } });
    assert.equal(confirmed.statusCode, 200);
    assert.equal(confirmed.json().courseRequest.status, "starting_level_confirmed");
    assert.equal(requestRow.status, "starting_level_confirmed");
    assert.equal(rows.get(startingLevelDiagnostics)![0]!.confirmation, "looks_right");
    assert.equal((await app.inject({ method: "POST", url: `${url}/too-easy` })).statusCode, 409);
  } finally {
    await app.close();
  }
});

test("At ceiling the Learner chooses Short Course or Change my goal, never Looks right", async () => {
  const { app, rows, url } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    await app.inject({ method: "POST", url: `${url}/answers`, payload: { answers: answers(1, 2, 3, 4, 5, 6, 7, 8) } });
    assert.equal((await app.inject({ method: "POST", url: `${url}/confirm`, payload: { choice: "looks_right" } })).statusCode, 409);
    const changed = await app.inject({ method: "POST", url: `${url}/change-goal` });
    assert.equal(changed.statusCode, 201);
    assert.equal(changed.json().courseRequest.status, "draft");
    assert.equal(changed.json().courseRequest.learningGoal, "Play Iris by the Goo Goo Dolls");
    const short = await app.inject({ method: "POST", url: `${url}/confirm`, payload: { choice: "short_course" } });
    assert.equal(short.statusCode, 200);
    assert.equal(rows.get(startingLevelDiagnostics)![0]!.confirmation, "short_course");
  } finally {
    await app.close();
  }
});

test("Another Learner's Request is not found", async () => {
  const { app, url } = await testApp();
  try {
    app.addHook("onRequest", async (request) => { request.currentLearner = savedLearner(); });
    assert.equal((await app.inject({ method: "POST", url })).statusCode, 404);
  } finally {
    await app.close();
  }
});
