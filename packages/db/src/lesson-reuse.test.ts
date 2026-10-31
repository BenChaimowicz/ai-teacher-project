import assert from "node:assert/strict";
import { test } from "node:test";
import { readingProfile, retrievable, verbatimAllowed, type ReadingProfile, type ReuseCandidate } from "./lesson-reuse.ts";

/** A standard-length, English Learner with no reading supports. */
const PROFILE: ReadingProfile = { instructionLanguage: "en", requiredReadingSupports: [], contentScope: "standard", explanationOrder: "topic_appropriate" };

/**
 * A published Reading written for PROFILE, tagged for the World Tree.
 * @param overrides - Fields to change
 */
function candidate(overrides: Partial<ReuseCandidate> = {}): ReuseCandidate {
  return {
    lessonId: "lesson1", title: "Yggdrasil", lessonGoal: "Describe the world tree.", objectives: ["Describe Yggdrasil"],
    topicTags: ["yggdrasil", "cosmology"], lineage: null, body: { sections: [] }, sources: [],
    origin: { courseRequestId: "request1", slotId: "slot1" }, authorModelIds: ["fixture/author"], rejectedSources: [],
    writtenFor: { ...PROFILE }, ...overrides,
  };
}

const SLOT = { topicTags: ["Yggdrasil", "nine-worlds"] };

test("A candidate is retrieved when it shares one Topic tag with the slot, whatever the case or spacing", () => {
  assert.equal(retrievable(SLOT, candidate(), PROFILE), true);
  assert.equal(retrievable(SLOT, candidate({ topicTags: [" YGGDRASIL"] }), PROFILE), true);
  assert.equal(retrievable(SLOT, candidate({ topicTags: ["thor", "asgard"] }), PROFILE), false);
});

test("A candidate in another instruction language is never retrieved; one with no recorded profile counts as English", () => {
  assert.equal(retrievable(SLOT, candidate({ writtenFor: { ...PROFILE, instructionLanguage: "he" } }), PROFILE), false);
  assert.equal(retrievable(SLOT, candidate({ writtenFor: null }), PROFILE), true);
  assert.equal(retrievable(SLOT, candidate({ writtenFor: null }), { ...PROFILE, instructionLanguage: "he" }), false);
});

test("Adapt trims but never grows: a candidate shorter than this Learner's contentScope is not retrieved", () => {
  assert.equal(retrievable(SLOT, candidate({ writtenFor: { ...PROFILE, contentScope: "compact" } }), PROFILE), false);
  assert.equal(retrievable(SLOT, candidate({ writtenFor: { ...PROFILE, contentScope: "extended" } }), PROFILE), true);
  assert.equal(retrievable(SLOT, candidate({ writtenFor: { ...PROFILE, contentScope: "standard" } }), { ...PROFILE, contentScope: "extended" }), false);
  assert.equal(retrievable(SLOT, candidate({ writtenFor: null }), { ...PROFILE, contentScope: "extended" }), true, "Unknown length is left to the adapt pass.");
});

test("A different explanationOrder still retrieves: the adapt pass may reorder it", () => {
  assert.equal(retrievable(SLOT, candidate({ writtenFor: { ...PROFILE, explanationOrder: "principle_first" } }), { ...PROFILE, explanationOrder: "example_first" }), true);
});

test("A verbatim copy is not retrieved, since its origin is in the pool with the same body; an adapted one is", () => {
  assert.equal(retrievable(SLOT, candidate({ lineage: { originLessonId: "lesson0", mode: "verbatim" } }), PROFILE), false);
  assert.equal(retrievable(SLOT, candidate({ lineage: { originLessonId: "lesson0", mode: "adapted" } }), PROFILE), true);
});

test("Verbatim is allowed only when all four write-time values match; supports compare as a set", () => {
  assert.equal(verbatimAllowed(candidate(), PROFILE), true);
  const supports: ReadingProfile = { ...PROFILE, requiredReadingSupports: ["plain_language", "inline_definitions"] };
  assert.equal(verbatimAllowed(candidate({ writtenFor: { ...PROFILE, requiredReadingSupports: ["inline_definitions", "plain_language"] } }), supports), true);
  assert.equal(verbatimAllowed(candidate(), supports), false);
  assert.equal(verbatimAllowed(candidate({ writtenFor: { ...PROFILE, contentScope: "extended" } }), PROFILE), false);
  assert.equal(verbatimAllowed(candidate({ writtenFor: { ...PROFILE, explanationOrder: "example_first" } }), PROFILE), false);
  assert.equal(verbatimAllowed(candidate({ writtenFor: { ...PROFILE, instructionLanguage: "he" } }), PROFILE), false);
});

test("A Lesson whose profile was never recorded, or is incomplete, is adapt at most", () => {
  assert.equal(verbatimAllowed(candidate({ writtenFor: null }), PROFILE), false);
  assert.equal(readingProfile({ instructionLanguage: "en" }), null, "A Quiz records only its language.");
  assert.equal(readingProfile({ ...PROFILE, contentScope: "huge" }), null);
  assert.deepEqual(readingProfile({ ...PROFILE }), PROFILE);
});
