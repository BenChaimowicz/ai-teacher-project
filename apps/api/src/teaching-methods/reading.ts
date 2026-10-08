import { READING_METHOD_ID } from "@senoy/db";
import type { TeachingMethodPlugin } from "./types.ts";

/** Reading plugin: completes when the Learner reaches the end and marks it complete. */
export const readingPlugin: TeachingMethodPlugin = {
  id: READING_METHOD_ID,
  writeTimeFields: ["instructionLanguage", "requiredReadingSupports", "contentScope", "explanationOrder"],
  showTimeFields: ["sectionAdvance"],
  studyBody: (raw) => raw,
  async complete(store, learnerId, lesson) {
    await store.insertCompletion(learnerId, lesson.id);
    return { ok: true };
  },
};
