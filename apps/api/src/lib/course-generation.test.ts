import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  courseRequests,
  learners,
  lessonResearch,
  parseTeachingProfileAnswers,
  publishedCourses,
  publishedLessons,
  publishedModules,
  startingLevelDiagnostics,
  TEACHING_PROFILE_VERSION,
  unpublishedLessons,
  type ApprovedBlueprint,
  type Database,
} from "@senoy/db";
import type { SourcePack } from "@senoy/research";
import { fakeDb } from "../routes/fake-db.ts";
import type { CourseJudge, CourseOutline } from "./course-judge.ts";
import { createCourseGeneration, CourseFailedError } from "./course-generation.ts";
import { LeaseLostError, type GenerationControl, type SettledStatus } from "./generation-job.ts";
import { QuizFailedError, type QuizGenerator, type QuizInput } from "./quiz-generation.ts";
import { ReadingFailedError, type ReadingGenerator, type ReadingInput } from "./reading-generation.ts";

const APPROVED: ApprovedBlueprint = {
  sequenceMode: "linear",
  approvedAt: "2026-10-13T10:00:00.000Z",
  blueprint: {
    courseTitle: "Norse cosmology",
    modules: [{
      title: "The world tree",
      slots: [
        {
          id: "slot1", method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
          objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil", "nine-worlds"], assessesSlotIds: [],
        },
        {
          id: "slot2", method: "quiz", title: "Check: the World Tree", lessonGoal: "Recall how Yggdrasil connects the worlds.",
          objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil", "quiz"], assessesSlotIds: ["slot1"],
        },
      ],
    }],
  },
};

/** Every table a generation run touches. */
const TABLES = [courseRequests, learners, startingLevelDiagnostics, lessonResearch, unpublishedLessons, publishedCourses, publishedModules, publishedLessons];

const PACKS = [{ slot: "primary", sources: [] }, { slot: "secondary", sources: [] }] as unknown as SourcePack[];

/** Generator returning a fixed passing reading for whichever slot it is given; `fail` throws a Judge failure. */
function recordingGenerator(fail = false) {
  const inputs: ReadingInput[] = [];
  const readingGenerator: ReadingGenerator = {
    async generate(input) {
      inputs.push(input);
      if (fail) throw new ReadingFailedError([], { pass: false, failedChecks: ["claim_support"], reasons: ["Unsupported."] });
      const url = "https://en.wikipedia.org/w/index.php?oldid=1";
      return {
        judge: { pass: true, failedChecks: [], reasons: [] },
        repairs: 0,
        rejectedSources: [{ sourceId: "src_bbbbbbbbbb", url: "https://shop.example/blog", reason: "A shop's blog." }],
        lesson: {
          slotId: input.slot.id, teachingMethod: "reading", title: input.slot.title, lessonGoal: input.slot.lessonGoal,
          objectives: input.slot.objectives, topicTags: input.slot.topicTags, lineage: null,
          body: { sections: [{ heading: "A tree", blocks: [{ kind: "prose", text: "Yggdrasil [1]." }] }] },
          citations: [{ n: 1, title: "Yggdrasil", url }],
          sources: [{ n: 1, sourceId: "src_aaaaaaaaaa", title: "Yggdrasil", url, publisher: "en.wikipedia.org", retrievedAt: "2026-10-08T17:41:57.034Z", usedAs: "paraphrase" }],
        },
      };
    },
  };
  return { readingGenerator, inputs };
}

/** Quiz generator returning six fixed items for whichever slot it is given; `fail` throws a Judge failure. */
function recordingQuizGenerator(fail = false) {
  const inputs: QuizInput[] = [];
  const quizGenerator: QuizGenerator = {
    async generate(input) {
      inputs.push(input);
      if (fail) throw new QuizFailedError([], { pass: false, failedChecks: ["answerable_from_lessons"], reasons: ["Item 1 is not in the Reading."] });
      return {
        judge: { pass: true, failedChecks: [], reasons: [] },
        repairs: 0,
        lesson: {
          slotId: input.slot.id, teachingMethod: "quiz", title: input.slot.title, lessonGoal: input.slot.lessonGoal,
          objectives: input.slot.objectives, topicTags: input.slot.topicTags, lineage: null, sources: [], citations: [],
          body: {
            items: [1, 2, 3, 4, 5, 6].map((n) => ({
              id: `item${n}`, prompt: `Question ${n}?`, correctOptionId: "c",
              options: ["a", "b", "c", "d"].map((id) => ({ id, text: `${id}${n}` })),
              explanations: { brief: "B.", standard: "S.", detailed: "D." },
            })),
          },
        },
      };
    },
  };
  return { quizGenerator, inputs };
}

/** Whole-Course Judge recording each outline it reads; `fail` names a Lesson. */
function recordingCourseJudge(fail = false) {
  const outlines: CourseOutline[] = [];
  const courseJudge: CourseJudge = {
    async judge(outline) {
      outlines.push(outline);
      return fail
        ? { pass: false, failedChecks: ["lesson_coherence"], reasons: ["Lesson 2 assesses something Lesson 1 does not commit to."] }
        : { pass: true, failedChecks: [], reasons: [] };
    },
  };
  return { courseJudge, outlines };
}

/**
 * Job control recording what generation reports and how it settles; `lose` makes the job lost (a Cancel) from then on.
 */
function recordingControl() {
  const progress: string[] = [];
  const settled: SettledStatus[] = [];
  let lost = false;
  /** Throws once the job is lost. */
  const check = () => { if (lost) throw new LeaseLostError("job1"); };
  const control: GenerationControl = {
    async progress(stage, slotId) { check(); progress.push(slotId ? `${stage}:${slotId}` : stage); },
    async hold() { check(); },
    async settle(_transaction, status) { check(); settled.push(status); },
  };
  return { control, progress, settled, lose: () => { lost = true; } };
}

type Failure = "reading" | "quiz" | "course" | null;

/**
 * Runs generation for one approved Request on in-memory storage.
 * @param fail - Which stage fails its checks
 * @param courseJudgeOverride - Replaces the recording whole-Course Judge
 * @param before - Prepares storage before the run, as an earlier run would have left it
 */
async function run(
  fail: Failure = null,
  courseJudgeOverride?: (tables: ReturnType<typeof fakeDb>["rows"]) => CourseJudge,
  before?: (db: Database, requestId: string) => Promise<void>,
  approved: ApprovedBlueprint = APPROVED,
  research: (topic: string) => Promise<SourcePack[]> = async () => PACKS,
) {
  const { db, rows } = fakeDb(TABLES);
  const [learner] = await db.insert(learners).values({
    id: randomUUID(), teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers({ contentScope: { status: "selected", value: "compact" } }),
  }).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner!.id, subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world", status: "generating",
  }).returning();
  await db.insert(startingLevelDiagnostics).values({
    courseRequestId: request!.id, learnerId: learner!.id, confirmation: "looks_right",
    startingLevel: {
      learningGoal: "Explain the Norse picture of the world", probedCapabilities: [], coverageNote: "Note.", extremity: "mixed",
      remainingGapStatement: "Your Course would start at the World Tree.",
    },
  });
  await before?.(db, request!.id);
  const topics: string[] = [];
  const { readingGenerator, inputs } = recordingGenerator(fail === "reading");
  const { quizGenerator, inputs: quizInputs } = recordingQuizGenerator(fail === "quiz");
  const { courseJudge, outlines } = recordingCourseJudge(fail === "course");
  /** Published rows when the Quiz was generated: nothing may be playable mid-generation. */
  const publishedDuringGeneration: number[] = [];
  const quizGeneratorSpy: QuizGenerator = {
    async generate(input) {
      publishedDuringGeneration.push(rows.get(publishedCourses)!.length + rows.get(publishedLessons)!.length);
      return quizGenerator.generate(input);
    },
  };
  const generation = createCourseGeneration({
    readingGenerator, quizGenerator: quizGeneratorSpy, courseJudge: courseJudgeOverride?.(rows) ?? courseJudge,
    research: async (topic) => { topics.push(topic); return research(topic); },
  });
  const job = recordingControl();
  const started = generation.start({
    db: db as unknown as Database, courseRequestId: request!.id, learnerId: learner!.id, approved, control: job.control,
  });
  /** The stored Request. */
  const stored = () => (rows.get(courseRequests)! as (typeof courseRequests.$inferSelect)[])[0]!;
  return {
    started, rows, topics, inputs, quizInputs, outlines, publishedDuringGeneration, stored, job, requestId: request!.id, learnerId: learner!.id,
  };
}

test("The approved Reading slot is researched, its packs stored, then generated and saved as one unpublished checkpoint", async () => {
  const { started, rows, topics, inputs, requestId } = await run();
  await started;

  assert.equal(topics.length, 1, "The Quiz slot is not researched.");
  assert.match(topics[0]!, /The World Tree \(Norse mythology\)\. Describe how Yggdrasil connects the Nine Worlds\./);
  assert.equal(inputs[0]!.slot.id, "slot1");
  assert.equal(inputs[0]!.courseTitle, "Norse cosmology");
  assert.deepEqual(inputs[0]!.packs, PACKS);
  assert.deepEqual(Object.keys(inputs[0]!.profile).sort(), ["contentScope", "explanationOrder", "instructionLanguage", "requiredReadingSupports"]);
  assert.equal(inputs[0]!.profile.contentScope, "compact");

  const saved = rows.get(unpublishedLessons)! as (typeof unpublishedLessons.$inferSelect)[];
  assert.equal(saved.filter((row) => row.teachingMethod === "reading").length, 1);
  assert.equal(saved[0]!.courseRequestId, requestId);
  assert.equal(saved[0]!.slotId, "slot1");
  assert.equal(saved[0]!.position, 0);
  assert.equal(saved[0]!.teachingMethod, "reading");
  assert.equal(saved[0]!.citations[0]!.n, 1);
  assert.equal(saved[0]!.sources[0]!.sourceId, "src_aaaaaaaaaa");
  const research = rows.get(lessonResearch)! as (typeof lessonResearch.$inferSelect)[];
  assert.deepEqual(research.map((row) => [row.courseRequestId, row.slotId, row.sourcePacks]), [[requestId, "slot1", PACKS]]);
  assert.equal(saved[0]!.rejectedSources[0]!.reason, "A shop's blog.");
  assert.equal(saved[0]!.judge.pass, true);
});

test("A Lesson that fails its checks is not saved, no Quiz is generated without its Reading, and the Request fails", async () => {
  const { started, rows, quizInputs, stored, job } = await run("reading");
  await assert.rejects(started, ReadingFailedError);
  assert.equal(rows.get(unpublishedLessons)!.length, 0);
  assert.equal(quizInputs.length, 0);
  assert.equal(stored().status, "generation_failed");
  assert.match(stored().failureReason!, /couldn't write the Lesson “The World Tree” so that it passed our quality checks/);
  assert.equal(rows.get(publishedCourses)!.length, 0);
  assert.deepEqual(job.settled, ["failed"]);
});

test("A provider error is told as an interruption", async () => {
  const { db, rows } = fakeDb(TABLES);
  const [learner] = await db.insert(learners).values({
    id: randomUUID(), teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}),
  }).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner!.id, subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world", status: "generating",
  }).returning();
  const generation = createCourseGeneration({ research: async () => { throw new Error("vendor down"); } });
  const { control, settled } = recordingControl();
  await assert.rejects(generation.start({ db, courseRequestId: request!.id, learnerId: learner!.id, approved: APPROVED, control }), /vendor down/);
  const stored = (rows.get(courseRequests)! as (typeof courseRequests.$inferSelect)[])[0]!;
  assert.equal(stored.status, "generation_failed");
  assert.match(stored.failureReason!, /^Generation was interrupted while researching your Lessons\. Resume continues from the next unfinished Lesson\.$/);
  assert.deepEqual(settled, ["interrupted"], "Resume can pick an interrupted job up.");
});

test("The Quiz is generated from the checkpointed Reading and saved as its own checkpoint", async () => {
  const { started, rows, quizInputs, requestId } = await run();
  await started;

  assert.equal(quizInputs.length, 1);
  const input = quizInputs[0]!;
  assert.equal(input.slot.id, "slot2");
  assert.deepEqual(input.slots.map((slot) => slot.id), ["slot1", "slot2"]);
  assert.deepEqual(input.assessed.map(({ slotId, title, body }) => ({ slotId, title, heading: (body as { sections: { heading: string }[] }).sections[0]!.heading })), [
    { slotId: "slot1", title: "The World Tree", heading: "A tree" },
  ]);
  assert.deepEqual(input.profile, { instructionLanguage: "en" }, "Only the quiz plugin's write-time fields.");

  const saved = rows.get(unpublishedLessons)! as (typeof unpublishedLessons.$inferSelect)[];
  assert.deepEqual(saved.map((row) => [row.slotId, row.teachingMethod, row.position]), [["slot1", "reading", 0], ["slot2", "quiz", 1]]);
  const quiz = saved[1]!;
  assert.equal(quiz.courseRequestId, requestId);
  assert.equal((quiz.body as { items: unknown[] }).items.length, 6);
  assert.deepEqual([quiz.sources, quiz.citations, quiz.rejectedSources, quiz.lineage], [[], [], [], null]);
  assert.equal(quiz.judge.pass, true);
});

test("A Quiz that fails its checks is not saved; the Reading checkpoint stays and the Request fails", async () => {
  const { started, rows, stored } = await run("quiz");
  await assert.rejects(started, QuizFailedError);
  assert.deepEqual((rows.get(unpublishedLessons)! as (typeof unpublishedLessons.$inferSelect)[]).map((row) => row.slotId), ["slot1"]);
  assert.equal(stored().status, "generation_failed");
  assert.match(stored().failureReason!, /“Check: the World Tree”/);
  assert.equal(rows.get(publishedCourses)!.length, 0);
});

test("Nothing is playable while generation runs; the Course publishes only at the end", async () => {
  const { started, publishedDuringGeneration } = await run();
  await started;
  assert.deepEqual(publishedDuringGeneration, [0]);
});

test("The whole-Course Judge reads one outline of titles, goals, objectives, and commitments, never a Lesson body", async () => {
  const { started, outlines } = await run();
  await started;

  assert.equal(outlines.length, 1, "One pass over the whole Course.");
  assert.deepEqual(outlines[0], {
    courseTitle: "Norse cosmology",
    learningGoal: "Explain the Norse picture of the world",
    startingLevel: "Your Course would start at the World Tree.",
    modules: [{
      title: "The world tree",
      lessons: [
        { n: 1, method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.", objectives: ["Describe Yggdrasil"], commitments: ["A tree"] },
        { n: 2, method: "quiz", title: "Check: the World Tree", lessonGoal: "Recall how Yggdrasil connects the worlds.", objectives: ["Describe Yggdrasil"], commitments: ["Describe Yggdrasil"] },
      ],
    }],
  });
  assert.doesNotMatch(JSON.stringify(outlines[0]), /Yggdrasil \[1\]|Question 1/, "No Lesson body reaches the Judge.");
});

test("A passing Course publishes atomically: Course, Module, both Lessons, the published status, and the job's success", async () => {
  const { started, rows, stored, job, requestId, learnerId } = await run();
  await started;
  assert.deepEqual(job.settled, ["succeeded"]);

  const [course] = rows.get(publishedCourses)! as (typeof publishedCourses.$inferSelect)[];
  assert.deepEqual([course!.learnerId, course!.courseRequestId, course!.title, course!.subject, course!.sequenceMode],
    [learnerId, requestId, "Norse cosmology", "Norse mythology", "linear"]);
  const modules = rows.get(publishedModules)! as (typeof publishedModules.$inferSelect)[];
  assert.deepEqual(modules.map((row) => [row.publishedCourseId, row.title, row.position]), [[course!.id, "The world tree", 0]]);
  const lessons = rows.get(publishedLessons)! as (typeof publishedLessons.$inferSelect)[];
  assert.deepEqual(lessons.map((row) => [row.moduleId, row.position, row.teachingMethod, row.title]), [
    [modules[0]!.id, 0, "reading", "The World Tree"],
    [modules[0]!.id, 1, "quiz", "Check: the World Tree"],
  ]);
  assert.deepEqual(lessons[1]!.assessedLessonIds, [lessons[0]!.id], "The Quiz assesses the published Reading.");
  assert.equal(stored().status, "published");
  assert.equal(stored().failureReason, null);
  assert.equal(rows.get(unpublishedLessons)!.length, 2, "Checkpoints stay after publish.");
});

test("A failed whole-Course Judge publishes nothing, keeps the checkpoints, and fails the Request", async () => {
  const { started, rows, stored } = await run("course");
  await assert.rejects(started, CourseFailedError);
  assert.equal(rows.get(publishedCourses)!.length, 0);
  assert.equal(rows.get(publishedLessons)!.length, 0);
  assert.equal(rows.get(unpublishedLessons)!.length, 2);
  assert.equal(stored().status, "generation_failed");
  assert.match(stored().failureReason!, /didn't fit together well enough to publish/);
});

test("Publish is all or nothing: a Request that stopped generating leaves no published rows", async () => {
  const { started, rows, stored } = await run(null, (tables) => ({
    async judge() {
      // Something else moved the Request on (a later Cancel) before publish.
      (tables.get(courseRequests)![0] as { status: string }).status = "blueprint_review";
      return { pass: true, failedChecks: [], reasons: [] };
    },
  }));
  await assert.rejects(started, /no longer generating/);
  assert.equal(rows.get(publishedCourses)!.length, 0);
  assert.equal(rows.get(publishedModules)!.length, 0);
  assert.equal(rows.get(publishedLessons)!.length, 0);
  assert.equal(stored().status, "blueprint_review", "A failure never overwrites a status that moved on.");
});

test("Each stage is reported for the Waiting screen: research, every Lesson in order, then publish", async () => {
  const { started, job } = await run();
  await started;
  assert.deepEqual(job.progress, ["research", "lesson:slot1", "lesson:slot2", "publish"]);
});

/** A Reading checkpoint an earlier run saved for slot1, with a heading later Lessons carry forward. */
async function savedReading(db: Database, requestId: string) {
  await db.insert(unpublishedLessons).values({
    courseRequestId: requestId, slotId: "slot1", position: 0, teachingMethod: "reading", title: "The World Tree",
    lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.", objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil"],
    lineage: null, sources: [], citations: [], judge: { pass: true, failedChecks: [], reasons: [] },
    body: { sections: [{ heading: "Saved before the crash", blocks: [{ kind: "prose", text: "Yggdrasil [1]." }] }] },
  });
}

test("A resumed job continues from the next unfinished Lesson: a checkpointed Reading is not researched or written again", async () => {
  const { started, rows, topics, inputs, quizInputs, job, stored } = await run(null, undefined, savedReading);
  await started;

  assert.equal(topics.length, 0, "No research for a finished Lesson.");
  assert.equal(inputs.length, 0, "No Generator call for a finished Lesson.");
  assert.deepEqual(job.progress, ["lesson:slot2", "publish"]);
  assert.equal(quizInputs[0]!.assessed[0]!.body.sections[0]!.heading, "Saved before the crash", "The Quiz reads the saved Reading.");
  assert.deepEqual((rows.get(unpublishedLessons)! as (typeof unpublishedLessons.$inferSelect)[]).map((row) => row.slotId), ["slot1", "slot2"]);
  assert.equal(stored().status, "published");
});

test("A cancelled run stops at its next stage: the Lesson in flight is not saved and nothing is recorded", async () => {
  const { db, rows } = fakeDb(TABLES);
  const [learner] = await db.insert(learners).values({
    id: randomUUID(), teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}),
  }).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner!.id, subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world", status: "generation_cancelled",
  }).returning();
  const { control, settled, lose } = recordingControl();
  const { readingGenerator } = recordingGenerator();
  const { quizGenerator, inputs: quizInputs } = recordingQuizGenerator();
  const generation = createCourseGeneration({
    // The Learner cancels while the Reading is being written.
    research: async () => { lose(); return PACKS; },
    readingGenerator, quizGenerator, courseJudge: recordingCourseJudge().courseJudge,
  });

  await assert.rejects(generation.start({ db, courseRequestId: request!.id, learnerId: learner!.id, approved: APPROVED, control }), LeaseLostError);
  assert.equal(rows.get(unpublishedLessons)!.length, 0);
  assert.equal(rows.get(lessonResearch)!.length, 0, "Research that finished after Cancel is not stored.");
  assert.equal(quizInputs.length, 0);
  assert.deepEqual(settled, []);
  const stored = (rows.get(courseRequests)! as (typeof courseRequests.$inferSelect)[])[0]!;
  assert.equal(stored.status, "generation_cancelled", "Cancel's status stands.");
  assert.equal(stored.failureReason, null);
});

test("A whole-Course failure fails the job; nothing publishes", async () => {
  const { started, job } = await run("course");
  await assert.rejects(started, CourseFailedError);
  assert.deepEqual(job.settled, ["failed"]);
});

/** A Reading slot for the longer Course. */
function readingSlot(n: number) {
  return {
    id: `slot${n}`, method: "reading" as const, title: `Reading ${n}`, lessonGoal: `Explain idea ${n}.`,
    objectives: [`Explain idea ${n}`], topicTags: ["norse", `idea-${n}`], assessesSlotIds: [],
  };
}

/** A Quiz slot for the longer Course. */
function quizSlot(n: number, assesses: number[]) {
  return {
    id: `slot${n}`, method: "quiz" as const, title: `Quiz ${n}`, lessonGoal: `Show ideas ${assesses.join(" and ")}.`,
    objectives: assesses.map((number) => `Explain idea ${number}`), topicTags: ["norse", "quiz"], assessesSlotIds: assesses.map((number) => `slot${number}`),
  };
}

/** Six Lessons: two Readings and a Quiz, twice, as the default Quiz cadence places them. */
const LONG: ApprovedBlueprint = {
  sequenceMode: "linear",
  approvedAt: "2026-10-21T10:00:00.000Z",
  blueprint: {
    courseTitle: "Norse cosmology",
    modules: [{ title: "The Nine Worlds", slots: [readingSlot(1), readingSlot(2), quizSlot(3, [1, 2]), readingSlot(4), readingSlot(5), quizSlot(6, [4, 5])] }],
  },
};

/** Packs tagged with the topic they were researched for, so a test can tell which slot's packs a Reading got. */
function packsFor(topic: string) {
  return [{ slot: "primary", topic, sources: [] }, { slot: "secondary", topic, sources: [] }] as unknown as SourcePack[];
}

test("Every Reading is researched at once before any Lesson is written, and each is written from its stored packs", async () => {
  let inFlight = 0;
  let peak = 0;
  const { started, rows, topics, inputs, job } = await run(null, undefined, undefined, LONG, async (topic) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return packsFor(topic);
  });
  await started;

  assert.equal(topics.length, 4, "Only the four Readings are researched.");
  assert.equal(peak, 4, "All four research calls run at the same time.");
  assert.equal(job.progress[0], "research");
  const research = rows.get(lessonResearch)! as (typeof lessonResearch.$inferSelect)[];
  assert.deepEqual(research.map((row) => row.slotId).sort(), ["slot1", "slot2", "slot4", "slot5"]);
  for (const input of inputs) {
    const stored = research.find((row) => row.slotId === input.slot.id)!;
    assert.deepEqual(input.packs, stored.sourcePacks, `${input.slot.id} is written from its own stored packs.`);
    assert.match((input.packs[0] as { topic: string }).topic, new RegExp(`^${input.slot.title} `));
  }
});

test("A longer Course is written one Lesson at a time in Blueprint order, carrying earlier Readings forward", async () => {
  const { started, inputs, quizInputs, job } = await run(null, undefined, undefined, LONG);
  await started;

  assert.deepEqual(job.progress, ["research", "lesson:slot1", "lesson:slot2", "lesson:slot3", "lesson:slot4", "lesson:slot5", "lesson:slot6", "publish"]);
  assert.deepEqual(inputs.map((input) => [input.slot.id, input.priorLessons.map((lesson) => lesson.title)]), [
    ["slot1", []],
    ["slot2", ["Reading 1"]],
    ["slot4", ["Reading 1", "Reading 2"]],
    ["slot5", ["Reading 1", "Reading 2", "Reading 4"]],
  ]);
  assert.deepEqual(quizInputs.map((input) => [input.slot.id, input.assessed.map((lesson) => lesson.slotId)]), [
    ["slot3", ["slot1", "slot2"]],
    ["slot6", ["slot4", "slot5"]],
  ]);
});

test("A longer Course publishes every Lesson, each Quiz assessing its own Readings", async () => {
  const { started, rows, outlines, stored } = await run(null, undefined, undefined, LONG);
  await started;

  assert.equal(stored().status, "published");
  assert.deepEqual(outlines[0]!.modules[0]!.lessons.map((lesson) => [lesson.n, lesson.method]), [
    [1, "reading"], [2, "reading"], [3, "quiz"], [4, "reading"], [5, "reading"], [6, "quiz"],
  ]);
  const lessons = rows.get(publishedLessons)! as (typeof publishedLessons.$inferSelect)[];
  assert.deepEqual(lessons.map((row) => [row.position, row.teachingMethod]), [
    [0, "reading"], [1, "reading"], [2, "quiz"], [3, "reading"], [4, "reading"], [5, "quiz"],
  ]);
  assert.deepEqual(lessons[2]!.assessedLessonIds, [lessons[0]!.id, lessons[1]!.id]);
  assert.deepEqual(lessons[5]!.assessedLessonIds, [lessons[3]!.id, lessons[4]!.id]);
});

test("A research call that fails keeps the research that finished; Resume researches only what is missing", async () => {
  const first = await run(null, undefined, undefined, LONG, async (topic) => {
    if (topic.startsWith("Reading 4 ")) throw new Error("vendor down");
    return packsFor(topic);
  });
  await assert.rejects(first.started, /vendor down/);
  assert.deepEqual(first.job.settled, ["interrupted"]);
  assert.match(first.stored().failureReason!, /interrupted while researching your Lessons/);
  const kept = first.rows.get(lessonResearch)! as (typeof lessonResearch.$inferSelect)[];
  assert.deepEqual(kept.map((row) => row.slotId).sort(), ["slot1", "slot2", "slot5"]);
  assert.equal(first.rows.get(unpublishedLessons)!.length, 0, "No Lesson is written until every Reading is researched.");

  // Resume: slot1 was already written and slot2 researched before the interruption.
  const resumed = await run(null, undefined, async (db, requestId) => {
    await savedReading(db, requestId);
    await db.insert(lessonResearch).values({ courseRequestId: requestId, slotId: "slot2", sourcePacks: packsFor("stored for slot2") });
  }, LONG, async (topic) => packsFor(topic));
  await resumed.started;
  assert.deepEqual(resumed.topics.map((topic) => topic.split(" (")[0]), ["Reading 4", "Reading 5"], "Finished research is not re-run.");
  assert.deepEqual(resumed.inputs.map((input) => input.slot.id), ["slot2", "slot4", "slot5"]);
  assert.deepEqual(resumed.inputs[0]!.packs, packsFor("stored for slot2"));
  assert.equal(resumed.stored().status, "published");
});
