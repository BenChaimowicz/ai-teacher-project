import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlueprintSlot } from "@senoy/db/blueprint";
import type { ReuseCandidate } from "@senoy/db";
import { createReuseFit, reuseSeed } from "./lesson-reuse.ts";
import { loadModelConfig } from "./model-config.ts";
import type { Generator, ModelReply, StructuredRequest } from "./model-ports.ts";
import { ModelError } from "./openrouter.ts";

const SLOT: BlueprintSlot = {
  id: "slot1", method: "reading", title: "The World Tree", lessonGoal: "Describe how Yggdrasil connects the Nine Worlds.",
  objectives: ["Describe Yggdrasil"], topicTags: ["yggdrasil"], assessesSlotIds: [],
};

/**
 * A published Reading on the subject.
 * @param overrides - Fields to change
 */
function candidate(overrides: Partial<ReuseCandidate> = {}): ReuseCandidate {
  return {
    lessonId: "lesson1", title: "Yggdrasil", lessonGoal: "Describe the world tree.", objectives: ["Describe Yggdrasil", "Name its roots"],
    topicTags: ["yggdrasil"], lineage: null,
    body: { sections: [{ heading: "The tree", blocks: [{ kind: "prose", text: "It is a tree [1]. It has roots [2][1]." }] }] },
    sources: [
      { n: 1, sourceId: "src_aaaaaaaaaa", url: "https://a.example", title: "A", publisher: "a.example", retrievedAt: "2026-10-08T00:00:00.000Z", usedAs: "paraphrase" },
      { n: 2, sourceId: "src_bbbbbbbbbb", url: "https://b.example", title: "B", publisher: "b.example", retrievedAt: "2026-10-08T00:00:00.000Z", usedAs: "paraphrase" },
    ],
    origin: { courseRequestId: "request1", slotId: "slot9" }, authorModelIds: ["fixture/author"], rejectedSources: [],
    writtenFor: { instructionLanguage: "en", requiredReadingSupports: [], contentScope: "standard", explanationOrder: "topic_appropriate" },
    ...overrides,
  };
}

/**
 * Generator returning one fixed reply, recording what it was asked.
 * @param reply - The raw reply
 */
function scripted(reply: unknown) {
  const calls: StructuredRequest<unknown>[] = [];
  const generator: Generator = {
    modelId: "fixture/generator",
    async generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
      calls.push(request as StructuredRequest<unknown>);
      return { value: request.parse(reply), modelId: "fixture/generator" };
    },
  };
  return { generator, calls };
}

test("The fit call compares the slot's objectives with each candidate's, and never sees a body or a tag", async () => {
  const { generator, calls } = scripted({ lessonId: "lesson1", reason: "Same capability." });
  const choice = await createReuseFit({ generator }).choose({ learningGoal: "Explain the Norse world", scope: null, slot: SLOT, candidates: [candidate()] });
  assert.deepEqual(choice, { lessonId: "lesson1", reason: "Same capability.", modelId: "fixture/generator" });
  assert.deepEqual(calls[0]!.input, {
    learningGoal: "Explain the Norse world",
    slot: { title: SLOT.title, lessonGoal: SLOT.lessonGoal, objectives: SLOT.objectives },
    candidates: [{ lessonId: "lesson1", title: "Yggdrasil", lessonGoal: "Describe the world tree.", objectives: ["Describe Yggdrasil", "Name its roots"] }],
  });
  assert.doesNotMatch(calls[0]!.systemPrompt, /"scope"/, "An unfocused goal gets no scope rule.");
});

test("The fit call's \"none\" picks nothing, and a Lesson id it was not offered is invalid output", async () => {
  const none = await createReuseFit({ generator: scripted({ lessonId: "none", reason: "Different capability." }).generator })
    .choose({ learningGoal: "Goal", scope: null, slot: SLOT, candidates: [candidate()] });
  assert.equal(none.lessonId, null);
  await assert.rejects(createReuseFit({ generator: scripted({ lessonId: "lesson2", reason: "?" }).generator })
    .choose({ learningGoal: "Goal", scope: null, slot: SLOT, candidates: [candidate()] }), ModelError);
});

test("With a scope, the fit call sees it and gets the scope rule", async () => {
  const { generator, calls } = scripted({ lessonId: "none", reason: "Out of scope." });
  const scope = { inScope: ["the cosmos"], outOfScope: ["the gods"] };
  await createReuseFit({ generator }).choose({ learningGoal: "Goal", scope, slot: SLOT, candidates: [candidate()] });
  assert.deepEqual((calls[0]!.input as { scope: unknown }).scope, scope);
  assert.match(calls[0]!.systemPrompt, /scope\.outOfScope/);
});

test("A reuse seed carries the body back in Source ID markers, and verbatim only for the same write-time values", () => {
  const profile = { instructionLanguage: "en", requiredReadingSupports: [], contentScope: "standard" as const, explanationOrder: "topic_appropriate" };
  const seed = reuseSeed(candidate(), profile);
  assert.deepEqual(seed.sections, [{ heading: "The tree", paragraphs: ["It is a tree [src_aaaaaaaaaa]. It has roots [src_bbbbbbbbbb][src_aaaaaaaaaa]."] }]);
  assert.equal(seed.originLessonId, "lesson1");
  assert.equal(seed.verbatimAllowed, true);
  assert.equal(reuseSeed(candidate(), { ...profile, contentScope: "compact" }).verbatimAllowed, false);
});

test("A reused Lesson from before SEN-57 names no author, so the primary Generator is its author", () => {
  const profile = { instructionLanguage: "en", requiredReadingSupports: [], contentScope: "standard" as const, explanationOrder: "topic_appropriate" };
  assert.deepEqual(reuseSeed(candidate({ authorModelIds: [] }), profile).authorModelIds, [loadModelConfig().generatorModel]);
});
