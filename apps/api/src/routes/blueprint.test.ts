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
import { createBlueprintJob, REDESIGN_FAILED_REASON } from "../lib/blueprint-job.ts";
import { BlueprintFailedError, type BlueprintBuilder, type BlueprintInput } from "../lib/blueprint.ts";
import { jobOwner, type GenerationControl } from "../lib/generation-job.ts";
import { blueprintRoutes } from "./blueprint.ts";
import { courseRequestRoutes } from "./course-requests.ts";
import { fakeDb } from "./fake-db.ts";

/** A Learner with a saved Teaching Profile that asks for a Quiz after every reading. */
function savedLearner(): typeof learners.$inferSelect {
  return {
    id: randomUUID(),
    createdAt: new Date(),
    authUserId: randomUUID(),
    displayName: "Curious_Owl",
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

/** A generation job row. */
type JobRow = typeof generationJobs.$inferSelect;

/** Job control for a run that holds `job`: settling writes the job's status, as the Postgres control does. */
function heldControl(job: JobRow): GenerationControl {
  return {
    signal: new AbortController().signal,
    async progress() {},
    async hold() {},
    async settle(_transaction, status) {
      Object.assign(job, { status, claimToken: null, leaseExpiresAt: null });
    },
  };
}

/**
 * Runs the real routes on in-memory storage with one Request in `status` and a confirmed Starting Level.
 * `runBlueprintJob` stands in for the worker: it claims the queued Blueprint job and runs it with `builder`.
 */
async function testApp(status: CourseRequestStatus = "starting_level_confirmed", fail = false) {
  const learner = savedLearner();
  const { db, rows } = fakeDb([learners, courseRequests, startingLevelDiagnostics, courseBlueprints, generationJobs, unpublishedLessons]);
  const recording = recordingBuilder(fail);
  const app = Fastify();
  app.decorate("db", db);
  app.addHook("onRequest", async (request) => { request.currentLearner = learner; });
  await app.register(blueprintRoutes);
  // Revise request lives with the Course Request routes but acts on this Request's job and checkpoints (SEN-85).
  await app.register(courseRequestRoutes, { validityGate: { async evaluate() { throw new Error("Validity is not part of these checks."); } } });
  await db.insert(learners).values(learner).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner.id, subject: "Drum kit", learningGoal: "Play Iris by the Goo Goo Dolls", status,
  }).returning();
  await db.insert(startingLevelDiagnostics).values({
    courseRequestId: request!.id, learnerId: learner.id, startingLevel, confirmation: "looks_right",
  }).returning();
  const url = `/api/course-requests/${request!.id}/blueprint`;
  /** The Request's jobs of one kind. */
  const jobs = (kind: JobRow["kind"] = "course") => (rows.get(generationJobs)! as JobRow[]).filter((job) => job.kind === kind);
  /**
   * Claims the queued Blueprint job and runs it, as the worker would. A failed run's error is returned, not thrown,
   * since the worker only logs it.
   */
  async function runBlueprintJob(builder: BlueprintBuilder = recording.builder) {
    const job = jobs("blueprint").find((candidate) => candidate.status === "queued");
    assert.ok(job, "A Blueprint job is queued.");
    Object.assign(job, { status: "running", claimToken: randomUUID(), leaseExpiresAt: new Date() });
    return createBlueprintJob(builder).start({ db, courseRequestId: request!.id, learnerId: learner.id, control: heldControl(job) })
      .then(() => null, (error: unknown) => error);
  }
  /** Queues the Blueprint through the route, then runs its job. */
  async function designBlueprint() {
    assert.equal((await app.inject({ method: "POST", url })).statusCode, 202);
    assert.equal(await runBlueprintJob(), null);
  }
  return { app, db, rows, inputs: recording.inputs, jobs, url, requestId: request!.id, requestRow: rows.get(courseRequests)![0]!, runBlueprintJob, designBlueprint };
}

test("Preparing queues a Blueprint job whose run designs from the confirmed gap and write-time Profile; review shows only titles and Lesson goals", async () => {
  const { app, rows, inputs, jobs, url, requestRow, runBlueprintJob } = await testApp();
  try {
    const queued = await app.inject({ method: "POST", url });
    assert.equal(queued.statusCode, 202);
    assert.equal(queued.json().courseRequest.status, "blueprint_preparing");
    assert.deepEqual(jobs("blueprint").map((job) => job.status), ["queued"], "The status and the job land together.");
    assert.equal(inputs.length, 0, "The API never designs the Blueprint itself.");
    assert.equal((await app.inject({ method: "POST", url })).statusCode, 409, "One Blueprint job at a time.");
    assert.equal((await app.inject({ method: "GET", url })).json().blueprint, null);

    assert.equal(await runBlueprintJob(), null);
    assert.equal(jobs("blueprint")[0]!.status, "succeeded");
    const response = await app.inject({ method: "GET", url });
    const { courseRequest, blueprint } = response.json();
    assert.equal(courseRequest.status, "blueprint_review");
    assert.equal(requestRow.status, "blueprint_review");
    assert.equal(blueprint.sequenceMode, "linear");
    assert.equal(blueprint.approved, false);
    const slots = blueprint.blueprint.modules[0].slots;
    assert.deepEqual(slots.map((slot: { method: string }) => slot.method), ["reading", "reading", "quiz"]);
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
  for (const status of ["awaiting_gap_confirmation", "blueprint_preparing", "blueprint_review", "generating"] as const) {
    const { app, url, jobs } = await testApp(status);
    try {
      assert.equal((await app.inject({ method: "POST", url })).statusCode, 409);
      assert.equal(jobs("blueprint").length, 0);
    } finally {
      await app.close();
    }
  }
});

test("A Blueprint still failing its checks returns the Request to confirmed with a reason; Try again queues the same job", async () => {
  const { app, rows, jobs, url, requestRow, runBlueprintJob } = await testApp("starting_level_confirmed", true);
  try {
    await app.inject({ method: "POST", url });
    assert.ok(await runBlueprintJob() instanceof BlueprintFailedError);
    assert.equal(requestRow.status, "starting_level_confirmed");
    assert.match(String(requestRow.failureReason), /passed our checks, even after 2 revisions\. Try again/);
    assert.equal(rows.get(courseBlueprints)!.length, 0, "No draft is saved.");
    assert.equal(jobs("blueprint")[0]!.status, "failed");
    assert.match((await app.inject({ method: "GET", url })).json().courseRequest.failureReason, /Try again/);

    const retried = await app.inject({ method: "POST", url });
    assert.equal(retried.statusCode, 202);
    assert.deepEqual([requestRow.status, requestRow.failureReason], ["blueprint_preparing", null]);
    assert.deepEqual(jobs("blueprint").map((job) => job.status), ["queued"], "The same row is queued again.");
    assert.equal(await runBlueprintJob(createFixtureBlueprintBuilder()), null);
    assert.deepEqual([requestRow.status, requestRow.failureReason], ["blueprint_review", null]);
  } finally {
    await app.close();
  }
});

test("A Blueprint run stopped by a provider error says so and offers Try again", async () => {
  const { app, jobs, url, requestRow, runBlueprintJob } = await testApp();
  try {
    await app.inject({ method: "POST", url });
    assert.ok(await runBlueprintJob({ async build() { throw new Error("provider down"); } }) instanceof Error);
    assert.deepEqual([requestRow.status, requestRow.failureReason], [
      "starting_level_confirmed", "We couldn't finish designing your Course Blueprint. Try again.",
    ]);
    assert.equal(jobs("blueprint")[0]!.status, "failed");
  } finally {
    await app.close();
  }
});

test("Closing and returning keeps the review and the Sequence mode pick", async () => {
  const { app, url, designBlueprint } = await testApp();
  try {
    await designBlueprint();
    const picked = await app.inject({ method: "PUT", url: `${url}/sequence-mode`, payload: { sequenceMode: "free_jump" } });
    assert.equal(picked.statusCode, 200);
    const reopened = await app.inject({ method: "GET", url });
    assert.equal(reopened.json().courseRequest.status, "blueprint_review");
    assert.equal(reopened.json().blueprint.sequenceMode, "free_jump");
    assert.equal(reopened.json().blueprint.blueprint.modules[0].slots.length, 3);
    assert.equal((await app.inject({ method: "PUT", url: `${url}/sequence-mode`, payload: { sequenceMode: "random" } })).statusCode, 400);
  } finally {
    await app.close();
  }
});

test("Approve persists the approved snapshot and Sequence mode, then queues one generation job for the worker", async () => {
  const { app, rows, jobs, url, requestRow, designBlueprint } = await testApp();
  try {
    await designBlueprint();
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
      status: "queued", stage: null, lessonNumber: null, lessonTitle: null, finishedLessons: 0, finishedSlotIds: [], totalLessons: stored.draft.modules.flatMap((module) => module.slots).length,
    });

    assert.equal((await app.inject({ method: "POST", url: `${url}/approve`, payload: { sequenceMode: "linear" } })).statusCode, 409);
    assert.equal((await app.inject({ method: "PUT", url: `${url}/sequence-mode`, payload: { sequenceMode: "linear" } })).statusCode, 409);
    assert.equal(jobs().length, 1, "One Course job per Request.");
    assert.equal(jobs("blueprint")[0]!.status, "succeeded", "The Blueprint job is untouched.");
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

/** A Request approved and generating, with its Course job in `status` and the worker on its first Lesson. */
async function generatingApp(status: JobRow["status"] = "running") {
  const context = await testApp();
  await context.designBlueprint();
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
    assert.equal(jobs("blueprint")[0]!.status, "succeeded", "Cancel touches only the Course job.");
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

test("Every queued job belongs to the stack that queued it, so another developer's worker on the shared database never claims it", async () => {
  const { app, jobs, url } = await testApp();
  try {
    assert.equal((await app.inject({ method: "POST", url })).statusCode, 202);
    assert.equal(jobs("blueprint")[0]!.owner, jobOwner(), "Preparing queues a Blueprint job for this stack.");
  } finally {
    await app.close();
  }
});

test("Retry and Resume move a job queued by another stack to this one, so this stack's worker runs it on this code", async () => {
  const { app, jobs, requestRow, generationUrl } = await generatingApp("failed");
  try {
    assert.equal(jobs()[0]!.owner, jobOwner(), "Approve queues the Course job for this stack.");
    Object.assign(requestRow, { status: "generation_failed", failureReason: "We couldn't write the Lesson." });
    Object.assign(jobs()[0]!, { owner: "another-developer" });
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/retry` })).statusCode, 200);
    assert.equal(jobs()[0]!.owner, jobOwner());

    Object.assign(requestRow, { status: "generation_cancelled", failureReason: null });
    Object.assign(jobs()[0]!, { status: "cancelled", owner: "another-developer" });
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/resume` })).statusCode, 200);
    assert.equal(jobs()[0]!.owner, jobOwner());
  } finally {
    await app.close();
  }
});

test("Retry queues a failed job again on the same Blueprint and clears the reason; a cancelled job is resumed, not retried", async () => {
  const { app, jobs, requestRow, generationUrl } = await generatingApp("failed");
  try {
    Object.assign(requestRow, { status: "generation_failed", failureReason: "We couldn't write the Lesson “The World Tree”." });
    const retried = await app.inject({ method: "POST", url: `${generationUrl}/retry` });
    assert.equal(retried.statusCode, 200);
    assert.equal(retried.json().courseRequest.status, "generating");
    assert.equal(jobs().length, 1, "The same job runs again.");
    assert.deepEqual([requestRow.status, requestRow.failureReason, jobs()[0]!.status, jobs()[0]!.stage], ["generating", null, "queued", null]);
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/retry` })).statusCode, 409, "A queued job is not retried.");

    Object.assign(requestRow, { status: "generation_failed", failureReason: "Generation was interrupted." });
    Object.assign(jobs()[0]!, { status: "interrupted" });
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/retry` })).statusCode, 200, "For an interruption, Retry is Resume.");

    Object.assign(requestRow, { status: "generation_cancelled", failureReason: null });
    Object.assign(jobs()[0]!, { status: "cancelled" });
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/retry` })).statusCode, 409);

    Object.assign(requestRow, { status: "generation_failed", failureReason: "Together, the finished Lessons don't reach your Learning Goal." });
    Object.assign(jobs()[0]!, { status: "needs_new_blueprint" });
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/retry` })).statusCode, 409, "Retrying cannot fix a sequence.");
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/resume` })).statusCode, 409);
    assert.equal(requestRow.status, "generation_failed");
  } finally {
    await app.close();
  }
});

test("Revise request after a generation failure discards the unpublished Lessons and leaves nothing to Retry", async () => {
  const { app, db, rows, jobs, requestRow, generationUrl, requestId, first } = await generatingApp("failed");
  try {
    await db.insert(unpublishedLessons).values({
      courseRequestId: requestId, slotId: first.id, position: 0, teachingMethod: "reading", title: first.title,
      lessonGoal: first.lessonGoal, objectives: first.objectives, topicTags: first.topicTags, lineage: null,
      sources: [], citations: [], judge: { pass: true, failedChecks: [], reasons: [] },
      body: { sections: [{ heading: "Written before the failure", blocks: [{ kind: "prose", text: "A tree [1]." }] }] },
    }).returning();
    Object.assign(requestRow, { status: "generation_failed", failureReason: "We couldn't write the Lesson." });
    assert.equal(rows.get(unpublishedLessons)!.length, 1, "One Lesson was checkpointed before the failure.");
    assert.equal((await app.inject({ method: "GET", url: `/api/course-requests/${requestId}/blueprint` })).json().generation.finishedLessons, 1);

    const revised = await app.inject({ method: "POST", url: `/api/course-requests/${requestId}/revise` });
    assert.equal(revised.statusCode, 201, revised.body);
    const draft = revised.json().courseRequest;
    assert.equal(draft.status, "draft");
    assert.equal(draft.revisedFromId, requestId);
    assert.equal(draft.subject, "Drum kit", "The failed Request's subject carries over as editable text.");

    assert.equal(rows.get(unpublishedLessons)!.length, 0, "The failed Request's unpublished Lessons are discarded.");
    assert.deepEqual([requestRow.status, requestRow.failureReason], ["generation_failed", "We couldn't write the Lesson."],
      "The failed Request stays in history with its reason.");
    assert.deepEqual([jobs()[0]!.status, jobs()[0]!.claimToken], ["revised", null]);
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/retry` })).statusCode, 409, "No Retry once the Request was revised.");
    assert.equal((await app.inject({ method: "POST", url: `${generationUrl}/resume` })).statusCode, 409);
    assert.equal(rows.get(unpublishedLessons)!.length, 0);
  } finally {
    await app.close();
  }
});

test("The structural return's redesign plans again from the sequence the written Lessons failed, and keeps the reason on screen", async () => {
  const { app, rows, inputs, jobs, url, requestRow, designBlueprint, runBlueprintJob } = await testApp();
  try {
    await designBlueprint();
    await app.inject({ method: "POST", url: `${url}/approve`, payload: { sequenceMode: "linear" } });
    const plan = rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect;
    const reviewed = plan.draft.modules[0]!.slots[0]!.title;
    // As the failing generation run left it: approval gone, the Judge's reasons on the draft, Blueprint job queued.
    Object.assign(plan, {
      approved: null, approvedAt: null,
      draft: { ...plan.draft, sequenceFailure: { reasons: ["Covers two rudiments, not a whole song."] } },
    });
    Object.assign(requestRow, { status: "blueprint_preparing", failureReason: "Together, the finished Lessons don't reach your Learning Goal." });
    Object.assign(jobs("blueprint")[0]!, { status: "queued", claimToken: null, leaseExpiresAt: null });

    assert.equal(await runBlueprintJob(), null);
    assert.deepEqual(inputs[1]!.sequenceRedesign?.reasons, ["Covers two rudiments, not a whole song."]);
    assert.equal(inputs[1]!.sequenceRedesign?.previousBlueprint.modules[0]!.slots[0]!.title, reviewed, "The redesign sees the plan that failed.");
    assert.equal(inputs[1]!.revision, undefined, "A structural redesign is not a redesign from the Learner's marks.");
    assert.equal(requestRow.status, "blueprint_review");
    assert.match(String(requestRow.failureReason), /don't reach your Learning Goal/, "The reason the plan changed is still unread.");
    assert.equal(rows.get(courseBlueprints)!.length, 1, "The redesign replaces the draft.");
    assert.equal((rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect).draft.sequenceFailure, undefined);
    assert.equal((await app.inject({ method: "GET", url })).json().blueprint.approved, false, "The new plan waits for Approve.");
  } finally {
    await app.close();
  }
});

test("A redesign that fails after the structural return leaves the plan that could not be generated on screen", async () => {
  const { app, rows, jobs, url, requestRow, designBlueprint, runBlueprintJob } = await testApp();
  try {
    await designBlueprint();
    await app.inject({ method: "POST", url: `${url}/approve`, payload: { sequenceMode: "linear" } });
    const plan = rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect;
    Object.assign(plan, {
      approved: null, approvedAt: null, draft: { ...plan.draft, sequenceFailure: { reasons: ["Stops short of the song."] } },
    });
    Object.assign(requestRow, { status: "blueprint_preparing", failureReason: "Together, the finished Lessons don't reach your Learning Goal." });
    Object.assign(jobs("blueprint")[0]!, { status: "queued", claimToken: null, leaseExpiresAt: null });

    assert.ok(await runBlueprintJob(recordingBuilder(true).builder) instanceof BlueprintFailedError);
    assert.equal(requestRow.status, "blueprint_review");
    assert.equal(requestRow.failureReason, REDESIGN_FAILED_REASON);
    assert.equal((rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect).draft.sequenceFailure, undefined,
      "The marker is cleared, so Try again designs from scratch rather than from a plan that is gone.");
  } finally {
    await app.close();
  }
});

test("Marking Lessons as not relevant queues a redesign from the marks; the new plan replaces the old and keeps the Sequence mode", async () => {
  const { app, rows, inputs, jobs, url, requestRow, designBlueprint, runBlueprintJob } = await testApp();
  try {
    await designBlueprint();
    await app.inject({ method: "PUT", url: `${url}/sequence-mode`, payload: { sequenceMode: "free_jump" } });
    for (const payload of [{}, { irrelevantSlotIds: [] }, { irrelevantSlotIds: ["nope"] }, { irrelevantSlotIds: ["slot1", "slot2", "slot3"] },
      { irrelevantSlotIds: ["slot1"], reason: "bored" }]) {
      assert.equal((await app.inject({ method: "POST", url: `${url}/revise`, payload })).statusCode, 400, JSON.stringify(payload));
    }
    const queued = await app.inject({ method: "POST", url: `${url}/revise`, payload: { irrelevantSlotIds: ["slot1"], reason: "already_know" } });
    assert.equal(queued.statusCode, 202, queued.body);
    assert.equal(queued.json().courseRequest.status, "blueprint_preparing");
    assert.deepEqual(jobs("blueprint").map((job) => job.status), ["queued"], "The same Blueprint job is queued again.");
    const during = await app.inject({ method: "GET", url });
    assert.equal(during.json().blueprint.blueprint.modules[0].slots[0].title, "Reading: Capability 4", "The reviewed plan shows while it is redone.");
    assert.ok(!/learnerFeedback/.test(during.body));

    assert.equal(await runBlueprintJob(), null);
    assert.deepEqual(inputs[1]!.revision?.feedback, { irrelevantSlotIds: ["slot1"], reason: "already_know" });
    assert.equal(inputs[1]!.revision?.previousBlueprint.modules[0]!.slots[0]!.title, "Reading: Capability 4");
    assert.equal(requestRow.status, "blueprint_review");
    const reviewed = (await app.inject({ method: "GET", url })).json().blueprint;
    assert.deepEqual(reviewed.blueprint.modules[0].slots.map((slot: { title: string }) => slot.title).slice(0, 2), ["Reading: Capability 5", "Reading: Capability 6"]);
    assert.equal(reviewed.sequenceMode, "free_jump");
    assert.equal(rows.get(courseBlueprints)!.length, 1, "The redesign replaces the draft.");
    assert.equal((rows.get(courseBlueprints)![0] as typeof courseBlueprints.$inferSelect).draft.learnerFeedback, undefined);
  } finally {
    await app.close();
  }
});

test("A redesign that fails returns to review with the plan as it was and says so", async () => {
  const { app, url, requestRow, designBlueprint, runBlueprintJob } = await testApp();
  try {
    await designBlueprint();
    await app.inject({ method: "POST", url: `${url}/revise`, payload: { irrelevantSlotIds: ["slot2"] } });
    assert.ok(await runBlueprintJob({ async build() { throw new Error("provider down"); } }) instanceof Error);
    assert.equal(requestRow.status, "blueprint_review");
    assert.match(String(requestRow.failureReason), /couldn't redo the plan/);
    const view = (await app.inject({ method: "GET", url })).json().blueprint;
    assert.equal(view.blueprint.modules[0].slots[1].title, "Reading: Capability 5");
    assert.equal((await app.inject({ method: "POST", url: `${url}/approve`, payload: { sequenceMode: "linear" } })).statusCode, 200, "Make it as it is.");
  } finally {
    await app.close();
  }
});

test("Another Learner gets 404 from every Blueprint and generation action on a Request, and changes nothing", async () => {
  const context = await testApp();
  const stranger = savedLearner();
  let asStranger = false;
  context.app.addHook("onRequest", async (request) => { if (asStranger) request.currentLearner = stranger; });
  try {
    await context.designBlueprint();
    const generationUrl = context.url.replace(/blueprint$/, "generation");
    const before = JSON.stringify([...context.rows.values()]);
    asStranger = true;
    const calls: { method: "GET" | "POST" | "PUT"; url: string; payload?: object }[] = [
      { method: "GET", url: context.url },
      { method: "POST", url: context.url },
      { method: "PUT", url: `${context.url}/sequence-mode`, payload: { sequenceMode: "free_jump" } },
      { method: "POST", url: `${context.url}/revise`, payload: { irrelevantSlotIds: [] } },
      { method: "POST", url: `${context.url}/approve`, payload: { sequenceMode: "linear" } },
      { method: "POST", url: `${generationUrl}/cancel` },
      { method: "POST", url: `${generationUrl}/resume` },
      { method: "POST", url: `${generationUrl}/retry` },
      { method: "POST", url: `/api/course-requests/${context.requestId}/revise` },
    ];
    for (const call of calls) {
      const response = await context.app.inject(call);
      assert.equal(response.statusCode, 404, `${call.method} ${call.url}`);
      assert.deepEqual(response.json(), { error: "Course Request not found." });
    }
    assert.equal(JSON.stringify([...context.rows.values()]), before);
  } finally {
    await context.app.close();
  }
});
