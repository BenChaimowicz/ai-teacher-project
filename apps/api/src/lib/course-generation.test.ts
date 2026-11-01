import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { test } from "node:test";
import {
  courseBlueprints,
  courseRequests,
  generationJobs,
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
  type ReuseCandidate,
} from "@senoy/db";
import type { SourcePack } from "@senoy/research";
import { fakeDb } from "../routes/fake-db.ts";
import type { CourseJudge, CourseOutline } from "./course-judge.ts";
import { createCourseGeneration, CourseFailedError, failureReason, lessonResearchTopic, researchQueries, searchForEvidence } from "./course-generation.ts";
import { LeaseLostError, type GenerationControl, type SettledStatus, type WorkerIdentity } from "./generation-job.ts";
import type { ReuseFit, ReuseFitInput } from "./lesson-reuse.ts";
import { QuizFailedError, type AuthoredItem, type QuizGenerator, type QuizInput, type QuizRound } from "./quiz-generation.ts";
import { loadModelConfig } from "./model-config.ts";
import { allSupported } from "./objective-grounding.ts";
import { ModelError } from "./openrouter.ts";
import { LessonUnresearchableError, ReadingFailedError, ReuseUnfitError, type ReadingGenerator, type ReadingInput } from "./reading-generation.ts";
import { installUsageTracking, type PipelineEventFinish, type PipelineEventStart, type UsageSink } from "./usage-tracking.ts";

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

/** Every table a generation run touches, including the ones the structural return writes (SEN-85). */
const TABLES = [courseRequests, learners, startingLevelDiagnostics, lessonResearch, unpublishedLessons, publishedCourses,
  publishedModules, publishedLessons, courseBlueprints, generationJobs];

/** One grounded Source: research with nothing to cite fails the Course before writing (spec §5.9). */
const SOURCE = { sourceId: "src_aaaaaaaaaa", url: "https://en.wikipedia.org/wiki/Yggdrasil", excerpts: [{ id: "e1", text: "Yggdrasil is the world tree." }] };
const PACKS = [{ slot: "primary", sources: [SOURCE] }, { slot: "secondary", sources: [] }] as unknown as SourcePack[];

/**
 * Generator returning a fixed passing reading for whichever slot it is given, adapted from its reused Lesson when it
 * has one; `fail` throws a Judge failure, and `unfit` refuses every reused Lesson.
 */
function recordingGenerator(fail = false, unfit = false) {
  const inputs: ReadingInput[] = [];
  const readingGenerator: ReadingGenerator = {
    async generate(input) {
      inputs.push(input);
      if (fail) throw new ReadingFailedError([], { pass: false, failedChecks: ["claim_support"], reasons: ["Unsupported."] });
      if (input.reuse && unfit) throw new ReuseUnfitError(input.slot.id, "It teaches a different capability.");
      const url = "https://en.wikipedia.org/w/index.php?oldid=1";
      return {
        judge: { pass: true, failedChecks: [], reasons: [] },
        media: [],
        repairs: 0,
        grounding: allSupported(input.slot.objectives),
        authorModelIds: ["fixture/author"],
        judgeModelId: "fixture/judge",
        rounds: [],
        rejectedSources: [{ sourceId: "src_bbbbbbbbbb", url: "https://shop.example/blog", reason: "A shop's blog." }],
        lesson: {
          slotId: input.slot.id, teachingMethod: "reading", title: input.slot.title, lessonGoal: input.slot.lessonGoal,
          objectives: input.slot.objectives, topicTags: input.slot.topicTags,
          lineage: input.reuse ? { originLessonId: input.reuse.originLessonId, mode: "adapted" } : null,
          body: { sections: [{ heading: "A tree", blocks: [{ kind: "prose", text: "Yggdrasil [1]." }] }] },
          citations: [{ n: 1, title: "Yggdrasil", url }],
          sources: [{ n: 1, sourceId: "src_aaaaaaaaaa", title: "Yggdrasil", url, publisher: "en.wikipedia.org", retrievedAt: "2026-10-08T17:41:57.034Z", usedAs: "paraphrase" }],
        },
      };
    },
  };
  return { readingGenerator, inputs };
}

/** One item as the stub Quiz author wrote it, before its options were placed. */
const QUIZ_ITEM: AuthoredItem = {
  objective: "Describe Yggdrasil",
  prompt: "Question 1?",
  options: ["a", "b", "c", "d"].map((id) => ({ id: `opt${id}`, text: `${id}1`, correct: id === "c" })),
  explanations: { brief: "B.", standard: "S.", detailed: "D." },
};

/** The rounds the stub Quiz author reports: a draft the Judge rejected, then the rewrite. */
const QUIZ_ROUNDS: QuizRound[] = [
  { modelId: "fixture/author", items: [QUIZ_ITEM], problems: ["Item 1 is not in the Reading."] },
  { modelId: "fixture/fallback", items: [QUIZ_ITEM], problems: [] },
];

/** Quiz generator returning six fixed items for whichever slot it is given; `fail` throws a Judge failure. */
function recordingQuizGenerator(fail = false) {
  const inputs: QuizInput[] = [];
  const quizGenerator: QuizGenerator = {
    async generate(input) {
      inputs.push(input);
      if (fail) {
        throw new QuizFailedError(
          [], { pass: false, failedChecks: ["answerable_from_lessons"], reasons: ["Item 1 is not in the Reading."] }, null,
          [QUIZ_ROUNDS[0]!, { ...QUIZ_ROUNDS[1]!, problems: ["Item 1 is not in the Reading."] }],
        );
      }
      return {
        judge: { pass: true, failedChecks: [], reasons: [] },
        repairs: 0,
        grounding: allSupported(input.slot.objectives),
        authorModelIds: ["fixture/author"],
        judgeModelId: "fixture/judge",
        rounds: QUIZ_ROUNDS,
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

/** Whole-Course Judge recording each outline it reads and who it was told wrote it; `fail` names a Lesson. */
function recordingCourseJudge(fail = false) {
  const outlines: CourseOutline[] = [];
  const authors: (readonly string[])[] = [];
  const courseJudge: CourseJudge = {
    async judge(outline, authorModelIds) {
      outlines.push(outline);
      authors.push(authorModelIds);
      return fail
        ? { pass: false, failedChecks: ["lesson_coherence"], reasons: ["Lesson 2 assesses something Lesson 1 does not commit to."] }
        : { pass: true, failedChecks: [], reasons: [] };
    },
  };
  return { courseJudge, outlines, authors };
}

/**
 * Job control recording what generation reports and how it settles; `lose` makes the job lost (a Cancel) from then on,
 * and `abort` is the worker's heartbeat noticing that loss, which also aborts the run's signal.
 */
function recordingControl() {
  const progress: string[] = [];
  const settled: SettledStatus[] = [];
  const lost = new AbortController();
  let gone = false;
  /** Throws once the job is lost. */
  const check = () => { if (gone) throw new LeaseLostError("job1"); };
  const control: GenerationControl = {
    signal: lost.signal,
    async progress(stage, slotId) { check(); progress.push(slotId ? `${stage}:${slotId}` : stage); },
    async hold() { check(); },
    async settle(_transaction, status) { check(); settled.push(status); },
  };
  const lose = () => { gone = true; };
  return { control, progress, settled, lose, abort: () => { lose(); lost.abort(new LeaseLostError("job1")); } };
}

/** Records each Pipeline Event's kind and the detail it finished with, while tracking is installed. */
function eventSink() {
  const kinds = new Map<string, PipelineEventStart["kind"]>();
  const events: { kind: PipelineEventStart["kind"]; detail: Record<string, unknown> | null }[] = [];
  const sink: UsageSink = {
    async startPipelineEvent(row: PipelineEventStart) {
      const id = `event${kinds.size + 1}`;
      kinds.set(id, row.kind);
      return id;
    },
    async finishPipelineEvent(id: string, row: PipelineEventFinish) { events.push({ kind: kinds.get(id)!, detail: row.detail }); },
    async insertUsageRecord() {},
    async setUsageMeasurement() {},
    async insertProductEvent() {},
    async insertApiRequest() {},
  };
  return { sink, detail: (kind: PipelineEventStart["kind"]) => events.find((event) => event.kind === kind)!.detail };
}

type Failure = "reading" | "quiz" | "course" | "reuse" | null;

/** The Course Request whose published Reading the reuse tests offer. */
const ORIGIN_REQUEST = "origin-request";

/** The packs the offered Reading was written from, stored under its own Request. */
const ORIGIN_PACKS = [
  { slot: "primary", sources: [{ ...SOURCE, sourceId: "src_cccccccccc", url: "https://en.wikipedia.org/wiki/Norse_cosmology" }] },
  { slot: "secondary", sources: [] },
] as unknown as SourcePack[];

/**
 * A published Reading on this subject that shares a Topic tag with slot1, written for the test Learner's profile.
 * @param overrides - Fields to change
 */
function candidate(overrides: Partial<ReuseCandidate> = {}): ReuseCandidate {
  return {
    lessonId: "origin-lesson", title: "Yggdrasil", lessonGoal: "Describe the world tree.", objectives: ["Describe Yggdrasil"],
    topicTags: ["Yggdrasil", "cosmology"], lineage: null,
    body: { sections: [{ heading: "The tree", blocks: [{ kind: "prose", text: "Yggdrasil is the world tree [1]." }] }] },
    sources: [{
      n: 1, sourceId: "src_cccccccccc", url: "https://en.wikipedia.org/wiki/Norse_cosmology", title: "Norse cosmology",
      publisher: "en.wikipedia.org", retrievedAt: "2026-10-08T17:41:57.034Z", usedAs: "paraphrase",
    }],
    origin: { courseRequestId: ORIGIN_REQUEST, slotId: "origin-slot" },
    authorModelIds: ["origin/author"], rejectedSources: [],
    writtenFor: { instructionLanguage: "en", requiredReadingSupports: [], contentScope: "compact", explanationOrder: "topic_appropriate" },
    ...overrides,
  };
}

/** Stores the offered Reading's retrieval set, as its own Course's generation left it. */
async function originResearch(db: Database) {
  await db.insert(lessonResearch).values({ courseRequestId: ORIGIN_REQUEST, slotId: "origin-slot", sourcePacks: ORIGIN_PACKS });
}

/** What the reuse tests offer: the published Readings on this subject, and which one the fit call picks for a slot. */
type ReuseSetup = { candidates?: ReuseCandidate[]; pick?: (input: ReuseFitInput) => string | null };

/**
 * Fit call recording what it was asked; it picks nothing unless told to.
 * @param pick - Which candidate to pick for a slot
 */
function recordingReuseFit(pick: ReuseSetup["pick"] = () => null) {
  const inputs: ReuseFitInput[] = [];
  const reuseFit: ReuseFit = {
    async choose(input) {
      inputs.push(input);
      return { lessonId: pick(input), reason: "Its objectives match the slot's.", modelId: "fixture/fit" };
    },
  };
  return { reuseFit, inputs };
}

/**
 * Runs generation for one approved Request on in-memory storage.
 * @param fail - Which stage fails its checks
 * @param courseJudgeOverride - Replaces the recording whole-Course Judge
 * @param before - Prepares storage before the run, as an earlier run would have left it
 * @param worker - The worker the run executes on
 * @param reuse - Published Readings on this subject and the fit call's picks; none by default
 */
async function run(
  fail: Failure = null,
  courseJudgeOverride?: (tables: ReturnType<typeof fakeDb>["rows"]) => CourseJudge,
  before?: (db: Database, requestId: string) => Promise<void>,
  approved: ApprovedBlueprint = APPROVED,
  research: (topic: string) => Promise<SourcePack[]> = async () => PACKS,
  worker?: WorkerIdentity,
  reuse: ReuseSetup = {},
) {
  const { db, rows } = fakeDb(TABLES);
  const [learner] = await db.insert(learners).values({
    id: randomUUID(), displayName: "Curious_Owl", teachingProfileVersion: TEACHING_PROFILE_VERSION,
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
  // The approved plan the run generates from, as Approve stored it, with its job: the structural return un-approves
  // this row and queues the Blueprint job again (SEN-85).
  await db.insert(courseBlueprints).values({
    courseRequestId: request!.id, learnerId: learner!.id, draft: approved.blueprint, sequenceMode: approved.sequenceMode,
    judge: { pass: true, failedChecks: [], reasons: [] }, approved, approvedAt: new Date(approved.approvedAt),
  });
  await db.insert(generationJobs).values({ courseRequestId: request!.id, learnerId: learner!.id, kind: "blueprint", status: "succeeded" });
  await db.insert(generationJobs).values({ courseRequestId: request!.id, learnerId: learner!.id, kind: "course", status: "running" });
  await before?.(db, request!.id);
  const topics: string[] = [];
  const { readingGenerator, inputs } = recordingGenerator(fail === "reading", fail === "reuse");
  const { reuseFit, inputs: fitInputs } = recordingReuseFit(reuse.pick);
  const { quizGenerator, inputs: quizInputs } = recordingQuizGenerator(fail === "quiz");
  const { courseJudge, outlines, authors } = recordingCourseJudge(fail === "course");
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
    findReuseCandidates: async () => reuse.candidates ?? [], reuseFit,
  });
  const job = recordingControl();
  const started = generation.start({
    db: db as unknown as Database, courseRequestId: request!.id, learnerId: learner!.id, approved, control: job.control, worker,
  });
  /** The stored Request. */
  const stored = () => (rows.get(courseRequests)! as (typeof courseRequests.$inferSelect)[])[0]!;
  return {
    started, rows, topics, inputs, quizInputs, outlines, authors, publishedDuringGeneration, stored, job, requestId: request!.id, learnerId: learner!.id,
    fitInputs,
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
  assert.deepEqual(saved[0]!.authorModelIds, ["fixture/author"]);
  assert.equal(saved[0]!.judgeModelId, "fixture/judge");
  assert.deepEqual(saved[0]!.writeTimeProfile, {
    instructionLanguage: "en", requiredReadingSupports: [], contentScope: "compact", explanationOrder: "topic_appropriate",
  }, "A checkpoint records the write-time values it was written for, so reuse can compare them later.");
  assert.deepEqual(saved.find((row) => row.teachingMethod === "quiz")!.writeTimeProfile, { instructionLanguage: "en" });
});

test("Research with no usable Source fails the Course before writing, and discards that research so Retry searches again", async () => {
  const empty = [{ slot: "primary", sources: [{ ...SOURCE, excerpts: [] }] }, { slot: "secondary", sources: [] }] as unknown as SourcePack[];
  const { started, rows, inputs, stored, job } = await run(null, undefined, undefined, APPROVED, async () => empty);
  await assert.rejects(started, (error: unknown) => error instanceof LessonUnresearchableError && error.slotId === "slot1");
  assert.equal(inputs.length, 0, "Nothing is written from empty research.");
  assert.equal(stored().status, "generation_failed");
  assert.match(stored().failureReason!, /^We couldn't find reliable Sources for the Lesson “The World Tree”\. Retry searches for it again/);
  assert.deepEqual(job.settled, ["failed"]);
  assert.equal(rows.get(lessonResearch)!.length, 0, "Packs with nothing to cite are not stored, so Retry searches again.");
});

test("An empty Source pack is searched again with broader queries before the Course can fail for it (spec §5.9)", async () => {
  const empty = [{ slot: "primary", status: "empty_vendor", sources: [] }, { slot: "secondary", status: "empty_filtered", sources: [] }] as unknown as SourcePack[];
  const { started, rows, topics, inputs, stored, job } = await run(null, undefined, undefined, APPROVED, async () => empty);
  await assert.rejects(started, (error: unknown) => error instanceof LessonUnresearchableError && error.slotId === "slot1");

  assert.deepEqual(topics, researchQueries("Norse mythology", APPROVED.blueprint.modules[0]!.slots[0]!, null),
    "Three queries, broadest last, before the Lesson is called hard to research.");
  assert.equal(topics.length, 3);
  assert.doesNotMatch(topics[1]!, /Covers:/, "The second query drops the objective list.");
  assert.equal(topics[2], "The World Tree (Norse mythology)", "The third is the bare title and subject.");
  assert.equal(inputs.length, 0, "Nothing is written from empty research.");
  assert.equal(rows.get(lessonResearch)!.length, 0);
  assert.equal(stored().status, "generation_failed");
  assert.match(stored().failureReason!, /^We couldn't find reliable Sources for the Lesson “The World Tree”\./);
  assert.deepEqual(job.settled, ["failed"]);
});

test("A broader query that finds Sources stops the ladder: those packs are stored and the Course is written from them", async () => {
  const empty = [{ slot: "primary", status: "empty_vendor", sources: [] }] as unknown as SourcePack[];
  const { started, rows, topics, inputs, stored } = await run(null, undefined, undefined, APPROVED,
    async (topic) => (/Covers:/.test(topic) ? empty : PACKS));
  await started;

  assert.equal(topics.length, 2, "The ladder stops at the query that found something.");
  const research = rows.get(lessonResearch)! as (typeof lessonResearch.$inferSelect)[];
  assert.deepEqual(research.map((row) => row.sourcePacks), [PACKS], "Only the packs with something to cite are stored.");
  assert.deepEqual(inputs[0]!.packs, PACKS);
  assert.equal(stored().status, "published");
});

test("A vendor that never answered is an interruption, not a hard-to-research Lesson (SEN-85)", async () => {
  for (const status of ["timed_out", "error"] as const) {
    const unfinished = [{ slot: "primary", status, sources: [] }, { slot: "secondary", status: "empty_vendor", sources: [] }] as unknown as SourcePack[];
    const { started, rows, topics, stored, job } = await run(null, undefined, undefined, APPROVED, async () => unfinished);
    await assert.rejects(started, /Research did not finish/);

    assert.equal(topics.length, 1, `A ${status} call says nothing about the topic, so broadening the query would answer the wrong question.`);
    assert.equal(rows.get(lessonResearch)!.length, 0, "Nothing is stored, so Retry searches again.");
    assert.deepEqual(job.settled, ["interrupted"], `A ${status} call is retried, not a terminal failure.`);
    assert.equal(stored().status, "generation_failed");
    assert.match(stored().failureReason!, /^Generation was interrupted while researching your Lessons\./);
    assert.doesNotMatch(stored().failureReason!, /reliable Sources/);
  }
});

test("The query ladder broadens by deletion, keeping the Learner's confirmed scope until the last query (SEN-90)", () => {
  const slot = APPROVED.blueprint.modules[0]!.slots[0]!;
  const scope = { inScope: ["Cosmology"], outOfScope: ["Later retellings"] };
  const queries = researchQueries("Norse mythology", slot, scope);
  assert.equal(queries[0], lessonResearchTopic("Norse mythology", slot, scope));
  assert.equal(queries[1], "The World Tree (Norse mythology). Describe how Yggdrasil connects the Nine Worlds. Focus: Cosmology.");
  assert.equal(queries[2], "The World Tree (Norse mythology)");
  assert.deepEqual(new Set(queries).size, 3, "Each query is a different search.");
});

test("The search for one Reading's evidence stops at the first pack with something to cite", async () => {
  const empty = [{ slot: "primary", status: "empty_vendor", sources: [] }] as unknown as SourcePack[];
  const asked: string[] = [];
  const found = await searchForEvidence(async (query) => { asked.push(query); return query === "c" ? PACKS : empty; }, ["a", "b", "c"]);
  assert.deepEqual([asked, found.queries, found.interrupted], [["a", "b", "c"], ["a", "b", "c"], false]);
  assert.deepEqual(found.packs, PACKS);

  const gaveUp = await searchForEvidence(async () => empty, ["a", "b"]);
  assert.deepEqual([gaveUp.queries, gaveUp.interrupted], [["a", "b"], false]);
});

test("The whole-Course Judge is told every model that wrote a Lesson; a checkpoint from before SEN-57 names the primary", async () => {
  const { started, authors } = await run(null, undefined, savedReading);
  await started;
  assert.deepEqual(authors, [[loadModelConfig().generatorModel, "fixture/author"]]);
});

test("A Lesson that fails its checks is not saved, no Quiz is generated without its Reading, and the Request fails", async () => {
  const { started, rows, quizInputs, stored, job } = await run("reading");
  await assert.rejects(started, ReadingFailedError);
  assert.equal(rows.get(unpublishedLessons)!.length, 0);
  assert.equal(quizInputs.length, 0);
  assert.equal(stored().status, "generation_failed");
  // The first Lesson failing keeps no Lessons, so Retry must not promise any back (SEN-95).
  assert.equal(
    stored().failureReason,
    "We couldn't write the Lesson “The World Tree” so that it passed our quality checks. Retry tries that Lesson again.",
  );
  assert.equal(rows.get(publishedCourses)!.length, 0);
  assert.deepEqual(job.settled, ["failed"]);
});

test("A provider error is told as an interruption", async () => {
  const { db, rows } = fakeDb(TABLES);
  const [learner] = await db.insert(learners).values({
    id: randomUUID(), displayName: "Curious_Owl", teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}),
  }).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner!.id, subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world", status: "generating",
  }).returning();
  const generation = createCourseGeneration({ research: async () => { throw new Error("vendor down"); }, findReuseCandidates: async () => [] });
  const { control, settled } = recordingControl();
  await assert.rejects(generation.start({ db, courseRequestId: request!.id, learnerId: learner!.id, approved: APPROVED, control }), /vendor down/);
  const stored = (rows.get(courseRequests)! as (typeof courseRequests.$inferSelect)[])[0]!;
  assert.equal(stored.status, "generation_failed");
  assert.match(stored.failureReason!, /^Generation was interrupted while researching your Lessons\. Retry continues from the next unfinished Lesson\.$/);
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
  // One Reading is checkpointed, so the failure names what Retry keeps (SEN-95).
  assert.match(stored().failureReason!, /Retry tries again from there, keeping the Lesson already written\.$/);
  assert.equal(rows.get(publishedCourses)!.length, 0);
});

test("The failure counts the Lessons Retry keeps, and promises none when none are checkpointed (SEN-95)", () => {
  const lesson = { kind: "lesson", title: "The World Tree" } as const;
  const checkFailed = new ReadingFailedError([], { pass: false, failedChecks: ["claim_support"], reasons: ["Unsupported."] });
  assert.match(failureReason(lesson, checkFailed, 0), /quality checks\. Retry tries that Lesson again\.$/);
  assert.match(failureReason(lesson, checkFailed, 1), /Retry tries again from there, keeping the Lesson already written\.$/);
  assert.match(failureReason(lesson, checkFailed, 3), /Retry tries again from there, keeping the 3 Lessons already written\.$/);

  const unresearchable = new LessonUnresearchableError("slot1");
  assert.match(failureReason(lesson, unresearchable, 0), /Retry searches for it again\.$/);
  assert.match(failureReason(lesson, unresearchable, 2), /Retry searches for it again, keeping the 2 Lessons already written\.$/);
});

test("A Lesson that fails for a required image names the Lesson and the image, and Retry is offered as for any failed check (SEN-115)", () => {
  const lesson = { kind: "lesson", title: "Holding the sticks" } as const;
  const proposal = { section: "Matched grip", mediaCategory: "drum-grip" as const, topicTags: ["matched-grip"], caption: "Matched grip.", alt: "Two hands.", required: true };
  const pass = { pass: true, failedChecks: [], reasons: [] };
  const missing = new ReadingFailedError([], pass, null, [], [], [], [{ proposal, status: "miss", rejected: [], checks: [] }]);
  assert.equal(missing.requiredMediaMissing, true);
  assert.match(missing.message, /failed required media checks \|\| The required drum-grip image \(matched-grip\) after "Matched grip" has no library file left to try\./);
  assert.equal(
    failureReason(lesson, missing, 0),
    "We couldn't find an image that fits the Lesson “Holding the sticks”, and it can't teach without one. Retry tries that Lesson again.",
  );
  assert.match(failureReason(lesson, missing, 2), /Retry tries again from there, keeping the 2 Lessons already written\.$/);

  const dropped = new ReadingFailedError([], pass, null, [], [], [], [{ proposal: { ...proposal, required: false }, status: "miss", rejected: [], checks: [] }]);
  assert.equal(dropped.requiredMediaMissing, false, "A missing optional image is never a defect.");
});

test("A Quiz's Pipeline Event keeps every round it took, pass or fail, as a Reading's does (SEN-91)", async () => {
  for (const fail of [false, true]) {
    const recording = eventSink();
    const uninstall = installUsageTracking({ sink: recording.sink, log: { error() {} } });
    try {
      const { started } = await run(fail ? "quiz" : null);
      if (fail) await assert.rejects(started, QuizFailedError);
      else await started;
    } finally {
      uninstall();
    }
    const detail = recording.detail("quiz")!;
    assert.deepEqual(detail.rounds, fail
      ? [QUIZ_ROUNDS[0], { ...QUIZ_ROUNDS[1], problems: ["Item 1 is not in the Reading."] }]
      : QUIZ_ROUNDS);
    assert.equal(detail.slotId, "slot2", "Alongside what the step already recorded.");
  }
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
    scope: null,
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

test("The Course-generation Pipeline Event records the worker host and commit the run executed on", async () => {
  const recording = eventSink();
  const uninstall = installUsageTracking({ sink: recording.sink, log: { error() {} } });
  const worker: WorkerIdentity = { host: "bens-laptop", owner: "ben", commit: "0c4cc91", dirty: false };
  try {
    await (await run(null, undefined, undefined, APPROVED, undefined, worker)).started;
  } finally {
    uninstall();
  }
  assert.deepEqual(recording.detail("course_generation")!.worker, worker);
});

test("A failed whole-Course Judge publishes nothing, keeps the checkpoints, and fails the Request", async () => {
  const { started, rows, stored, job } = await run("course");
  await assert.rejects(started, CourseFailedError);
  assert.equal(rows.get(publishedCourses)!.length, 0);
  assert.equal(rows.get(publishedLessons)!.length, 0);
  assert.equal(rows.get(unpublishedLessons)!.length, 2);
  assert.equal(stored().status, "generation_failed");
  assert.match(stored().failureReason!, /didn't fit together well enough to publish/);
  assert.deepEqual(job.settled, ["failed"], "A Lesson the Judge names waits for Retry.");
});

test("A whole-Course sequence that misses the goal makes the structural return: Lessons discarded, plan un-approved, redesign queued", async () => {
  const { started, rows, stored, job } = await run(null, () => ({
    async judge() {
      return { pass: false, failedChecks: ["sequence_reaches_goal"], reasons: ["Covers two myths, not the main stories."] };
    },
  }));
  await assert.rejects(started, CourseFailedError);
  assert.deepEqual(job.settled, ["needs_new_blueprint"], "Retrying the same plan is never offered.");
  assert.equal(rows.get(publishedCourses)!.length, 0);
  assert.equal(rows.get(unpublishedLessons)!.length, 0, "Every Lesson written under the failed plan is discarded (spec §5.1).");
  assert.equal(rows.get(lessonResearch)!.length, 0, "Its research is keyed to slot ids the new plan will not have.");

  const [plan] = rows.get(courseBlueprints)! as (typeof courseBlueprints.$inferSelect)[];
  assert.deepEqual([plan!.approved, plan!.approvedAt], [null, null], "No worker generates this plan again.");
  assert.deepEqual(plan!.draft.sequenceFailure, { reasons: ["Covers two myths, not the main stories."] },
    "The redesign is told what the sequence failed on.");
  assert.equal(plan!.draft.courseTitle, "Norse cosmology", "The failed plan is still there for the redesign to read.");

  assert.equal(stored().status, "blueprint_preparing", "The Request returns to Blueprint review by way of a new design.");
  assert.match(stored().failureReason!, /don't reach your Learning Goal/);
  assert.match(stored().failureReason!, /planning it again/);
  assert.doesNotMatch(stored().failureReason!, /Retry /);
  const jobs = rows.get(generationJobs)! as (typeof generationJobs.$inferSelect)[];
  assert.deepEqual(jobs.find((row) => row.kind === "blueprint")!.status, "queued", "The redesign is queued in the same transaction.");
});

test("A structural failure leaves a Request that moved on alone: nothing is discarded and no redesign is queued", async () => {
  const { started, rows, stored } = await run(null, (tables) => ({
    async judge() {
      // The Learner cancelled while the whole-Course Judge was reading the outline.
      (tables.get(courseRequests)![0] as { status: string }).status = "generation_cancelled";
      return { pass: false, failedChecks: ["sequence_reaches_goal"], reasons: ["Covers two myths."] };
    },
  }));
  await assert.rejects(started, CourseFailedError);
  assert.equal(stored().status, "generation_cancelled");
  assert.equal(rows.get(unpublishedLessons)!.length, 2, "Checkpoints of a Request this run no longer owns are kept.");
  const [plan] = rows.get(courseBlueprints)! as (typeof courseBlueprints.$inferSelect)[];
  assert.notEqual(plan!.approved, null, "The approved plan survives a failure that is no longer ours to record.");
  const jobs = rows.get(generationJobs)! as (typeof generationJobs.$inferSelect)[];
  assert.equal(jobs.find((row) => row.kind === "blueprint")!.status, "succeeded");
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
    id: randomUUID(), displayName: "Curious_Owl", teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}),
  }).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner!.id, subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world", status: "generation_cancelled",
  }).returning();
  const { control, settled, lose } = recordingControl();
  const { readingGenerator } = recordingGenerator();
  const { quizGenerator, inputs: quizInputs } = recordingQuizGenerator();
  const generation = createCourseGeneration({
    findReuseCandidates: async () => [],
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

test("A run whose call was cut off because it lost its job ends with the loss, not the call's error, and records nothing (SEN-93)", async () => {
  const { db, rows } = fakeDb(TABLES);
  const [learner] = await db.insert(learners).values({
    id: randomUUID(), displayName: "Curious_Owl", teachingProfileVersion: TEACHING_PROFILE_VERSION, teachingProfileAnswers: parseTeachingProfileAnswers({}),
  }).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner!.id, subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world", status: "generation_cancelled",
  }).returning();
  const { control, settled, abort } = recordingControl();
  const generation = createCourseGeneration({
    findReuseCandidates: async () => [],
    research: async () => PACKS,
    readingGenerator: {
      // The heartbeat learns of the Cancel while the Reading is written, and the model call it cuts off fails.
      async generate() {
        abort();
        throw new ModelError("network");
      },
    },
    quizGenerator: recordingQuizGenerator().quizGenerator,
    courseJudge: recordingCourseJudge().courseJudge,
  });

  await assert.rejects(generation.start({ db, courseRequestId: request!.id, learnerId: learner!.id, approved: APPROVED, control }), LeaseLostError);
  assert.deepEqual(settled, [], "The job is no longer this run's to settle.");
  assert.equal(rows.get(unpublishedLessons)!.length, 0);
  const stored = (rows.get(courseRequests)! as (typeof courseRequests.$inferSelect)[])[0]!;
  assert.equal(stored.status, "generation_cancelled", "Cancel's status stands.");
  assert.equal(stored.failureReason, null, "No interruption is reported for a cut-off call.");
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
  return [{ slot: "primary", topic, sources: [SOURCE] }, { slot: "secondary", topic, sources: [] }] as unknown as SourcePack[];
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

/** A Learner-confirmed focus of the Learning Goal (SEN-90). */
const SCOPE = { inScope: ["the World Tree", "the Nine Worlds"], outOfScope: ["manuscript sources"] };

test("Without a scope, a research topic is the slot's title, subject, goal, and objectives, exactly as before", () => {
  const slot = APPROVED.blueprint.modules[0]!.slots[0]!;
  assert.equal(lessonResearchTopic("Norse mythology", slot, null),
    "The World Tree (Norse mythology). Describe how Yggdrasil connects the Nine Worlds. Covers: Describe Yggdrasil.");
});

test("With a scope, a research topic ends with its focus and exclusion phrases", () => {
  const slot = APPROVED.blueprint.modules[0]!.slots[0]!;
  assert.equal(lessonResearchTopic("Norse mythology", slot, SCOPE),
    "The World Tree (Norse mythology). Describe how Yggdrasil connects the Nine Worlds. Covers: Describe Yggdrasil. Focus: the World Tree; the Nine Worlds. Not: manuscript sources.");
  assert.equal(lessonResearchTopic("Norse mythology", slot, { inScope: ["the World Tree"], outOfScope: [] }),
    "The World Tree (Norse mythology). Describe how Yggdrasil connects the Nine Worlds. Covers: Describe Yggdrasil. Focus: the World Tree.");
});

test("A focused Request's scope reaches each Reading's research topic, the Reading and Quiz generators, and the whole-Course Judge's outline", async () => {
  const { started, topics, inputs, quizInputs, outlines } = await run(null, undefined, async (db, requestId) => {
    await db.update(courseRequests).set({
      focus: { outcome: "focused", originalGoal: "Learn Norse myths", rounds: [], proposal: null, scope: SCOPE },
    }).where(eq(courseRequests.id, requestId)).returning();
  });
  await started;
  assert.match(topics[0]!, / Focus: the World Tree; the Nine Worlds\. Not: manuscript sources\.$/);
  assert.deepEqual(inputs[0]!.scope, SCOPE);
  assert.deepEqual(quizInputs[0]!.scope, SCOPE);
  assert.deepEqual(outlines[0]!.scope, SCOPE);
});

test("An unfocused Request gives the Reading and Quiz generators a null scope", async () => {
  const { started, inputs, quizInputs } = await run();
  await started;
  assert.equal(inputs[0]!.scope, null);
  assert.equal(quizInputs[0]!.scope, null);
});

test("With no reuse candidates on the subject, no fit call is made and every Reading is researched as before", async () => {
  const { started, topics, fitInputs, inputs } = await run();
  await started;
  assert.equal(fitInputs.length, 0);
  assert.equal(topics.length, 1);
  assert.equal(inputs[0]!.reuse, undefined);
});

test("Only candidates that share a Topic tag with the slot are offered to the fit call; tags match whatever their case", async () => {
  const unrelated = candidate({ lessonId: "untagged", topicTags: ["thor"] });
  const tagged = candidate({ lessonId: "tagged", topicTags: ["YGGDRASIL "] });
  const { started, fitInputs, topics } = await run(null, undefined, undefined, APPROVED, undefined, undefined, { candidates: [unrelated, tagged] });
  await started;
  assert.deepEqual(fitInputs.map((input) => input.candidates.map((offered) => offered.lessonId)), [["tagged"]]);
  assert.equal(topics.length, 1, "A slot the fit call picks nothing for is researched.");
});

test("A slot the fit call picks a Lesson for is not researched: it gets a copy of that Lesson's packs and is fitted from them (spec §5.8)", async () => {
  const { started, rows, topics, inputs, fitInputs, requestId } = await run(null, undefined, originResearch, APPROVED, undefined, undefined, {
    candidates: [candidate()], pick: (input) => input.candidates[0]!.lessonId,
  });
  await started;

  assert.equal(topics.length, 0, "A reused slot is never researched.");
  assert.equal(fitInputs.length, 1, "Only the Reading slot is offered for reuse; a Quiz never is.");
  assert.equal(fitInputs[0]!.slot.id, "slot1");
  assert.equal(fitInputs[0]!.learningGoal, "Explain the Norse picture of the world");
  const research = (rows.get(lessonResearch)! as (typeof lessonResearch.$inferSelect)[]).filter((row) => row.courseRequestId === requestId);
  assert.deepEqual(research.map((row) => [row.slotId, row.reusedLessonId, row.sourcePacks]), [["slot1", "origin-lesson", ORIGIN_PACKS]]);

  const reuse = inputs[0]!.reuse!;
  assert.deepEqual(inputs[0]!.packs, ORIGIN_PACKS, "The reused Lesson is checked against the Sources it was written from.");
  assert.equal(reuse.originLessonId, "origin-lesson");
  assert.deepEqual(reuse.sections, [{ heading: "The tree", paragraphs: ["Yggdrasil is the world tree [src_cccccccccc]."] }]);
  assert.equal(reuse.verbatimAllowed, true, "It was written for exactly this Learner's write-time values.");
  assert.deepEqual(reuse.authorModelIds, ["origin/author"]);

  const saved = rows.get(unpublishedLessons)! as (typeof unpublishedLessons.$inferSelect)[];
  assert.deepEqual(saved.find((row) => row.slotId === "slot1")!.lineage, { originLessonId: "origin-lesson", mode: "adapted" });
  const published = rows.get(publishedLessons)! as (typeof publishedLessons.$inferSelect)[];
  assert.deepEqual(published.find((row) => row.position === 0)!.lineage, { originLessonId: "origin-lesson", mode: "adapted" });
  assert.equal(published.find((row) => row.position === 1)!.lineage, null, "A Quiz is always generated.");
});

test("A reused Lesson written for another profile is offered as adapt at most", async () => {
  const { started, inputs } = await run(null, undefined, originResearch, APPROVED, undefined, undefined, {
    candidates: [candidate({ writtenFor: { ...candidate().writtenFor, contentScope: "standard" } })],
    pick: (input) => input.candidates[0]!.lessonId,
  });
  await started;
  assert.equal(inputs[0]!.reuse!.verbatimAllowed, false);
});

test("A reused Lesson that cannot be made to fit is researched then and written like any other (spec §5.8)", async () => {
  const { started, rows, topics, inputs, requestId, stored } = await run("reuse", undefined, originResearch, APPROVED, undefined, undefined, {
    candidates: [candidate()], pick: (input) => input.candidates[0]!.lessonId,
  });
  await started;

  assert.equal(topics.length, 1, "The slot is researched once its reused Lesson did not fit.");
  assert.deepEqual(inputs.map((input) => [input.slot.id, input.reuse?.originLessonId ?? null]), [["slot1", "origin-lesson"], ["slot1", null]]);
  assert.deepEqual(inputs[1]!.packs, PACKS);
  const research = (rows.get(lessonResearch)! as (typeof lessonResearch.$inferSelect)[]).filter((row) => row.courseRequestId === requestId);
  assert.deepEqual(research.map((row) => [row.slotId, row.reusedLessonId, row.sourcePacks]), [["slot1", null, PACKS]],
    "The copied packs are replaced, so a Retry writes the slot instead of trying the same Lesson again.");
  const saved = rows.get(unpublishedLessons)! as (typeof unpublishedLessons.$inferSelect)[];
  assert.equal(saved.find((row) => row.slotId === "slot1")!.lineage, null);
  assert.equal(stored().status, "published");
});

test("A reused Lesson that doesn't fit, on a topic research finds nothing for, fails the Course as any Reading would", async () => {
  const empty = [{ slot: "primary", sources: [{ ...SOURCE, excerpts: [] }] }, { slot: "secondary", sources: [] }] as unknown as SourcePack[];
  const { started, rows, stored, requestId } = await run("reuse", undefined, originResearch, APPROVED, async () => empty, undefined, {
    candidates: [candidate()], pick: (input) => input.candidates[0]!.lessonId,
  });
  await assert.rejects(started, (error: unknown) => error instanceof LessonUnresearchableError && error.slotId === "slot1");
  assert.match(stored().failureReason!, /^We couldn't find reliable Sources for the Lesson “The World Tree”/);
  const research = (rows.get(lessonResearch)! as (typeof lessonResearch.$inferSelect)[]).filter((row) => row.courseRequestId === requestId);
  assert.equal(research.length, 0, "Retry decides reuse for the slot again, then searches.");
});

test("A resumed job fits the Lesson it already chose from its stored copy, without asking the fit call again", async () => {
  const { started, topics, inputs, fitInputs } = await run(null, undefined, async (db, requestId) => {
    await originResearch(db);
    await db.insert(lessonResearch).values({ courseRequestId: requestId, slotId: "slot1", sourcePacks: ORIGIN_PACKS, reusedLessonId: "origin-lesson" });
  }, APPROVED, undefined, undefined, { candidates: [candidate()], pick: (input) => input.candidates[0]!.lessonId });
  await started;
  assert.equal(fitInputs.length, 0);
  assert.equal(topics.length, 0);
  assert.equal(inputs[0]!.reuse!.originLessonId, "origin-lesson");
});

test("No Lesson is reused twice in one Course: slots are decided in Blueprint order, and a later one is researched", async () => {
  const approved: ApprovedBlueprint = {
    ...APPROVED,
    blueprint: {
      ...APPROVED.blueprint,
      modules: [{
        title: "The world tree",
        slots: [
          APPROVED.blueprint.modules[0]!.slots[0]!,
          { ...APPROVED.blueprint.modules[0]!.slots[0]!, id: "slot1b", title: "The roots" },
          { ...APPROVED.blueprint.modules[0]!.slots[1]!, assessesSlotIds: ["slot1", "slot1b"] },
        ],
      }],
    },
  };
  const { started, topics, inputs, fitInputs } = await run(null, undefined, originResearch, approved, undefined, undefined, {
    candidates: [candidate()], pick: (input) => input.candidates[0]!.lessonId,
  });
  await started;
  assert.deepEqual(fitInputs.map((input) => input.slot.id), ["slot1"], "With its one candidate taken, the second slot makes no fit call.");
  assert.equal(topics.length, 1);
  assert.match(topics[0]!, /^The roots/);
  assert.deepEqual(inputs.map((input) => [input.slot.id, input.reuse?.originLessonId ?? null]), [["slot1", "origin-lesson"], ["slot1b", null]]);
});

test("The reuse step's Pipeline Event records the candidates offered, the pick, and why", async () => {
  const { sink, detail } = eventSink();
  const uninstall = installUsageTracking({ sink, log: { error() {} } });
  try {
    const { started } = await run(null, undefined, originResearch, APPROVED, undefined, undefined, {
      candidates: [candidate()], pick: (input) => input.candidates[0]!.lessonId,
    });
    await started;
  } finally {
    uninstall();
  }
  assert.deepEqual(detail("reuse"), {
    slotId: "slot1", candidates: [{ lessonId: "origin-lesson", title: "Yggdrasil" }], chosen: "origin-lesson",
    reason: "Its objectives match the slot's.", modelId: "fixture/fit",
  });
  assert.deepEqual(detail("reading")!.lineage, { originLessonId: "origin-lesson", mode: "adapted" });
});
