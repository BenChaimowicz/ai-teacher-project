import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import {
  courseBlueprints,
  courseRequests,
  generationJobs,
  learners,
  parseTeachingProfileAnswers,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  unpublishedLessons,
  type CourseRequestStatus,
  type StartingLevel,
} from "@senoy/db";
import { createFixtureBlueprintBuilder } from "../lib/blueprint-fixture.ts";
import { BlueprintFailedError, type BlueprintBuilder, type BlueprintInput } from "../lib/blueprint.ts";
import { blueprintRoutes } from "./blueprint.ts";
import { fakeDb } from "./fake-db.ts";

/** A Learner with a saved Teaching Profile that asks for a Quiz after every reading. */
function savedLearner(): typeof learners.$inferSelect {
  return {
    id: randomUUID(),
    createdAt: new Date(),
    teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers({ quizCadence: { status: "selected", value: "every_reading" } }),
    teachingProfileAssessedAt: new Date(),
    teachingProfileUpdatedAt: new Date(),
  };
}

/** A confirmed mixed Starting Level: capabilities 1–3 evidenced. */
const startingLevel: StartingLevel = {
  learningGoal: "Play Iris by the Goo Goo Dolls",
  probedCapabilities: Array.from({ length: 8 }, (_, i) => ({
    id: `cap${i + 1}`, statement: `Capability ${i + 1}`, itemId: `item${i + 1}`, span: i + 1,
    status: i < 3 ? "correct" as const : "incorrect" as const, expandedByLearner: false,
  })),
  remainingGapStatement: "Your Course would start at Capability 4.",
  coverageNote: "Written knowledge only.",
  extremity: "mixed",
};

/** Fixture builder that records its inputs; `fail` makes it throw a Judge failure. */
function recordingBuilder(fail = false) {
  const inputs: BlueprintInput[] = [];
  const fixture = createFixtureBlueprintBuilder();
  const builder: BlueprintBuilder = {
    async build(input) {
      inputs.push(input);
      if (fail) throw new BlueprintFailedError([], { pass: false, failedChecks: ["coverage"], reasons: ["Misses counting."] });
      return fixture.build(input);
    },
  };
  return { builder, inputs };
}

/** Runs the real routes on in-memory storage with one Request in `status` and a confirmed Starting Level. */
async function testApp(status: CourseRequestStatus = "starting_level_confirmed", fail = false) {
  const learner = savedLearner();
  const { db, rows } = fakeDb([courseRequests, startingLevelDiagnostics, courseBlueprints, generationJobs, unpublishedLessons]);
  const { builder, inputs } = recordingBuilder(fail);
  const app = Fastify();
  app.decorate("db", db);
  app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
  await app.register(blueprintRoutes, { blueprintBuilder: builder });
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner.id, subject: "Drum kit", learningGoal: "Play Iris by the Goo Goo Dolls", status,
  }).returning();
  await db.insert(startingLevelDiagnostics).values({
    courseRequestId: request!.id, learnerId: learner.id, startingLevel, confirmation: "looks_right",
  }).returning();
  const url = `/api/course-requests/${request!.id}/blueprint`;
  /** The Request's generation jobs. */
  const jobs = () => rows.get(generationJobs)! as (typeof generationJobs.$inferSelect)[];
  return { app, rows, inputs, jobs, url, requestRow: rows.get(courseRequests)![0]! };
}

test("Preparing designs from the confirmed gap and write-time Profile, then shows only titles and Lesson goals", async () => {
  const { app, rows, inputs, url, requestRow } = await testApp();
  try {
    const response = await app.inject({ method: "POST", url });
    assert.equal(response.statusCode, 200);
    const { courseRequest, blueprint } = response.json();
    assert.equal(courseRequest.status, "blueprint_review");
    assert.equal(requestRow.status, "blueprint_review");
    assert.equal(blueprint.sequenceMode, "linear");
    assert.equal(blueprint.approved, false);
    const slots = blueprint.blueprint.modules[0].slots;
    assert.deepEqual(slots.map((slot: { method: string }) => slot.method), ["reading", "quiz"]);
    assert.deepEqual(Object.keys(slots[0]).sort(), ["id", "lessonGoal", "method", "title"]);
    assert.ok(!/objectives|topicTags|assessesSlotIds|judge/.test(response.body));

    assert.equal(inputs[0]!.startingLevel.remainingGapStatement, "Your Course would start at Capability 4.");
    assert.equal(inputs[0]!.confirmation, "looks_right");
    assert.equal(inputs[0]!.profile.quizCadence, "every_reading");
    const stored = rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect;
    assert.equal(stored.judge.pass, true);
    assert.equal(stored.approved, null);
  } finally {
    await app.close();
  }
});

test("A Blueprint is only designed after the Starting Level is confirmed, once", async () => {
  for (const status of ["awaiting_gap_confirmation", "blueprint_review", "generating"] as const) {
    const { app, url } = await testApp(status);
    try {
      assert.equal((await app.inject({ method: "POST", url })).statusCode, 409);
    } finally {
      await app.close();
    }
  }
});

test("A failed Blueprint check returns the Request to confirmed and saves no draft", async () => {
  const { app, rows, url, requestRow } = await testApp("starting_level_confirmed", true);
  try {
    const response = await app.inject({ method: "POST", url });
    assert.equal(response.statusCode, 502);
    assert.match(response.json().error, /did not pass our checks/);
    assert.equal(requestRow.status, "starting_level_confirmed");
    assert.equal(rows.get(courseBlueprints)!.length, 0);
  } finally {
    await app.close();
  }
});

test("Closing and returning keeps the review and the Sequence mode pick", async () => {
  const { app, url } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    const picked = await app.inject({ method: "PUT", url: `${url}/sequence-mode`, payload: { sequenceMode: "free_jump" } });
    assert.equal(picked.statusCode, 200);
    const reopened = await app.inject({ method: "GET", url });
    assert.equal(reopened.json().courseRequest.status, "blueprint_review");
    assert.equal(reopened.json().blueprint.sequenceMode, "free_jump");
    assert.equal(reopened.json().blueprint.blueprint.modules[0].slots.length, 2);
    assert.equal((await app.inject({ method: "PUT", url: `${url}/sequence-mode`, payload: { sequenceMode: "random" } })).statusCode, 400);
  } finally {
    await app.close();
  }
});

test("Approve persists the approved snapshot and Sequence mode, then queues one generation job for the worker", async () => {
  const { app, rows, jobs, url, requestRow } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    assert.equal((await app.inject({ method: "POST", url: `${url}/approve`, payload: {} })).statusCode, 400);
    const approved = await app.inject({ method: "POST", url: `${url}/approve`, payload: { sequenceMode: "free_jump" } });
    assert.equal(approved.statusCode, 200);
    assert.equal(approved.json().courseRequest.status, "generating");
    assert.equal(approved.json().blueprint.approved, true);
    assert.equal(requestRow.status, "generating");

    const stored = rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect;
    assert.deepEqual(stored.approved!.blueprint, stored.draft);
    assert.equal(stored.approved!.sequenceMode, "free_jump");
    assert.deepEqual(jobs().map((job) => [job.courseRequestId, job.learnerId, job.status]), [[requestRow.id, requestRow.learnerId, "queued"]]);
    assert.deepEqual(approved.json().generation, {
      status: "queued", stage: null, lessonNumber: null, lessonTitle: null, finishedLessons: 0, totalLessons: stored.draft.modules.flatMap((module) => module.slots).length,
    });

    assert.equal((await app.inject({ method: "POST", url: `${url}/approve`, payload: { sequenceMode: "linear" } })).statusCode, 409);
    assert.equal((await app.inject({ method: "PUT", url: `${url}/sequence-mode`, payload: { sequenceMode: "linear" } })).statusCode, 409);
    assert.equal(jobs().length, 1, "One job per Request.");
    const reopened = await app.inject({ method: "GET", url });
    assert.equal(reopened.json().blueprint.sequenceMode, "free_jump");
  } finally {
    await app.close();
  }
});

test("Another Learner's Request is not found", async () => {
  const { app, url } = await testApp();
  try {
    app.addHook("onRequest", async (request) => { request.currentLearner = savedLearner(); });
    assert.equal((await app.inject({ method: "POST", url })).statusCode, 404);
    assert.equal((await app.inject({ method: "GET", url })).statusCode, 404);
  } finally {
    await app.close();
  }
});

/** A Request approved and generating, with its job in `status` and the worker on its first Lesson. */
async function generatingApp(status: (typeof generationJobs.$inferSelect)["status"] = "running") {
  const context = await testApp();
  await context.app.inject({ method: "POST", url: context.url });
  await context.app.inject({ method: "POST", url: `${context.url}/approve`, payload: { sequenceMode: "linear" } });
  const blueprint = context.rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect;
  const first = blueprint.draft.modules[0]!.slots[0]!;
  Object.assign(context.jobs()[0]!, { status, stage: "lesson", currentSlotId: first.id, claimToken: randomUUID(), leaseExpiresAt: new Date() });
  const generationUrl = context.url.replace(/blueprint$/, "generation");
  return { ...context, first, generationUrl };
}

test("Waiting shows the stage, the current Lesson, and N of M, and never a draft body or its Sources", async () => {
  const { app, url, first } = await generatingApp();
  try {
    const waiting = await app.inject({ method: "GET", url });
    const generation = waiting.json().generation;
    assert.deepEqual([generation.status, generation.stage, generation.lessonNumber, generation.lessonTitle, generation.finishedLessons],
      ["running", "lesson", 1, first.title, 0]);
    assert.ok(generation.totalLessons >= 2);
    assert.ok(!/sourcePacks|citations|body|claimToken/.test(waiting.body));
  } finally {
    await app.close();
  }
});

test("Cancel stops the job and keeps the Request's checkpoints; Resume queues the same job again", async () => {
  const { app, url, jobs, requestRow, generationUrl } = await generatingApp();
  try {
    const cancelled = await app.inject({ method: "POST", url: `${generationUrl}/cancel` });
    assert.equal(cancelled.statusCode, 200);
    assert.equal(cancelled.json().courseRequest.status, "generation_cancelled");
    assert.equal(requestRow.status, "generation_cancelled");
    assert.deepEqual([jobs()[0]!.status, jobs()[0]!.claimToken, jobs()[0]!.leaseExpiresAt], ["cancelled", null, null], "The worker's lease is gone.");
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/cancel` })).statusCode, 409);
    assert.equal((await app.inject({ method: "GET", url })).json().generation.status, "cancelled", "Nothing resumes by itself.");

    const resumed = await app.inject({ method: "POST", url: `${generationUrl}/resume` });
    assert.equal(resumed.statusCode, 200);
    assert.equal(resumed.json().courseRequest.status, "generating");
    assert.equal(jobs().length, 1);
    assert.deepEqual([jobs()[0]!.status, jobs()[0]!.stage], ["queued", null]);
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/resume` })).statusCode, 409);
  } finally {
    await app.close();
  }
});

test("An interrupted job resumes and clears the failure reason; a failed check does not resume", async () => {
  const { app, jobs, requestRow, generationUrl } = await generatingApp("interrupted");
  try {
    Object.assign(requestRow, { status: "generation_failed", failureReason: "Generation was interrupted while writing the Lesson." });
    const resumed = await app.inject({ method: "POST", url: `${generationUrl}/resume` });
    assert.equal(resumed.statusCode, 200);
    assert.deepEqual([requestRow.status, requestRow.failureReason, jobs()[0]!.status], ["generating", null, "queued"]);

    Object.assign(requestRow, { status: "generation_failed", failureReason: "We couldn't write the Lesson." });
    Object.assign(jobs()[0]!, { status: "failed" });
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/resume` })).statusCode, 409);
    assert.equal(requestRow.status, "generation_failed");
  } finally {
    await app.close();
  }
});
