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
import type { DiagnosticBuilder, DiagnosticDraft, GapStatementInput } from "../lib/diagnostic.ts";
import { fakeDb } from "./fake-db.ts";
import { startingLevelRoutes } from "./starting-level.ts";

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

/** Builder fixture that records gap-statement inputs; `fail` makes preparation throw. */
function fixtureBuilder(fail = false) {
  const gapInputs: GapStatementInput[] = [];
  const builder: DiagnosticBuilder = {
    async build() {
      if (fail) throw new Error("provider down");
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
async function testApp(status: CourseRequestStatus = "validity_passed", fail = false) {
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

test("A preparation failure returns the Request to validity passed so the Learner can try again", async () => {
  const { app, url, requestRow } = await testApp("validity_passed", true);
  try {
    assert.equal((await app.inject({ method: "POST", url })).statusCode, 502);
    assert.equal(requestRow.status, "validity_passed");
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
