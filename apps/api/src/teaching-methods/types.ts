import type { ResolvedTeachingProfile } from "@senoy/db";
import type { LessonRow, StudyStore } from "../lib/study-store.ts";

/** A Teaching Profile field a plugin reads. */
export type ProfileField = keyof ResolvedTeachingProfile;

/** Outcome of a plugin `complete`. */
export type CompleteOutcome = { ok: true } | { ok: false; status: 400; error: string };

/**
 * Server half of a Teaching-method plugin. Generate and validate are later tickets; `render` lives in the web app.
 */
export type TeachingMethodPlugin = {
  id: string;
  /** Teaching Profile fields consumed when a Lesson of this method is generated. */
  writeTimeFields: readonly ProfileField[];
  /** Teaching Profile fields consumed when a published Lesson of this method is shown. */
  showTimeFields: readonly ProfileField[];
  /**
   * The body as Study may send it to the browser.
   * @param raw - `published_lessons.body`
   */
  studyBody(raw: unknown): unknown;
  /**
   * Records Lesson completion when this method's rule is met. Idempotent; Progress never drops.
   * @param store - Study store
   * @param learnerId - Current Learner
   * @param lesson - Lesson to complete
   */
  complete(store: StudyStore, learnerId: string, lesson: LessonRow): Promise<CompleteOutcome>;
};
