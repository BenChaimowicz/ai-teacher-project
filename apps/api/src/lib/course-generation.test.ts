import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  courseRequests,
  learners,
  parseTeachingProfileAnswers,
  publishedLessons,
  TEACHING_PROFILE_VERSION,
  unpublishedLessons,
  type ApprovedBlueprint,
  type Database,
} from "@senoy/db";
import type { SourcePack } from "@senoy/research";
import { fakeDb } from "../routes/fake-db.ts";
import { createCourseGeneration } from "./course-generation.ts";
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

/** Runs generation for one approved Request on in-memory storage. */
async function run(fail: "reading" | "quiz" | null = null) {
  const { db, rows } = fakeDb([courseRequests, learners, unpublishedLessons, publishedLessons]);
  const [learner] = await db.insert(learners).values({
    id: randomUUID(), teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers({ contentScope: { status: "selected", value: "compact" } }),
  }).returning();
  const [request] = await db.insert(courseRequests).values({
    learnerId: learner!.id, subject: "Norse mythology", learningGoal: "Explain the Norse picture of the world", status: "generating",
  }).returning();
  const topics: string[] = [];
  const { readingGenerator, inputs } = recordingGenerator(fail === "reading");
  const { quizGenerator, inputs: quizInputs } = recordingQuizGenerator(fail === "quiz");
  const generation = createCourseGeneration({ readingGenerator, quizGenerator, research: async (topic) => { topics.push(topic); return PACKS; } });
  const started = generation.start({ db: db as unknown as Database, courseRequestId: request!.id, learnerId: learner!.id, approved: APPROVED });
  return { started, rows, topics, inputs, quizInputs, requestId: request!.id };
}

test("The approved Reading slot is researched, generated, and saved as one unpublished checkpoint", async () => {
  const { started, rows, topics, inputs, requestId } = await run();
  await started;

  assert.equal(topics.length, 1, "The Quiz slot is not researched.");
  assert.match(topics[0]!, /The World Tree \(Norse mythology\)\. Describe how Yggdrasil connects the Nine Worlds\./);
  assert.equal(inputs[0]!.slot.id, "slot1");
  assert.equal(inputs[0]!.courseTitle, "Norse cosmology");
  assert.equal(inputs[0]!.packs, PACKS);
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
  assert.deepEqual(saved[0]!.sourcePacks, PACKS);
  assert.equal(saved[0]!.rejectedSources[0]!.reason, "A shop's blog.");
  assert.equal(saved[0]!.judge.pass, true);
  assert.equal(rows.get(publishedLessons)!.length, 0, "A checkpoint is not playable before atomic publication.");
});

test("A Lesson that fails its checks is not saved, and no Quiz is generated without its Reading", async () => {
  const { started, rows, quizInputs } = await run("reading");
  await assert.rejects(started, ReadingFailedError);
  assert.equal(rows.get(unpublishedLessons)!.length, 0);
  assert.equal(quizInputs.length, 0);
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
  assert.deepEqual([quiz.sources, quiz.citations, quiz.sourcePacks, quiz.rejectedSources, quiz.lineage], [[], [], [], [], null]);
  assert.equal(quiz.judge.pass, true);
  assert.equal(rows.get(publishedLessons)!.length, 0, "A checkpoint is not playable before atomic publication.");
});

test("A Quiz that fails its checks is not saved; the Reading checkpoint stays", async () => {
  const { started, rows } = await run("quiz");
  await assert.rejects(started, QuizFailedError);
  assert.deepEqual((rows.get(unpublishedLessons)! as (typeof unpublishedLessons.$inferSelect)[]).map((row) => row.slotId), ["slot1"]);
});
