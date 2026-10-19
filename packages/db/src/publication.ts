import { randomUUID } from "node:crypto";
import { blueprintSlots, type ApprovedBlueprint } from "./blueprint.ts";
import type { QuizBody } from "./quiz.ts";
import { QUIZ_METHOD_ID, type ReadingBody } from "./reading-lesson.ts";
import type { publishedCourses, publishedLessons, publishedModules, unpublishedLessons } from "./schema.ts";

/** A stored unpublished Lesson checkpoint. */
export type LessonCheckpoint = typeof unpublishedLessons.$inferSelect;

/**
 * Whole-Course Code checks before atomic publish (spec §6.5): every approved slot has one checkpoint of its method
 * whose checks passed, and nothing is checkpointed off the approved Blueprint. No Demonstrative media is generated yet,
 * so there is no media check.
 * @param approved - The approved Blueprint
 * @param checkpoints - Every checkpoint saved for the Course Request
 * @returns Learner-invisible failure messages; empty when the Course may publish
 */
export function courseCodeFailures(approved: ApprovedBlueprint, checkpoints: readonly LessonCheckpoint[]): string[] {
  const failures: string[] = [];
  const slots = blueprintSlots(approved.blueprint);
  for (const [position, slot] of slots.entries()) {
    const saved = checkpoints.filter((checkpoint) => checkpoint.slotId === slot.id);
    if (saved.length !== 1) {
      failures.push(`Slot ${slot.id} has ${saved.length} checkpoints, not one.`);
      continue;
    }
    const checkpoint = saved[0]!;
    if (checkpoint.teachingMethod !== slot.method) failures.push(`Slot ${slot.id} is a ${slot.method} but its checkpoint is a ${checkpoint.teachingMethod}.`);
    if (checkpoint.position !== position) failures.push(`Slot ${slot.id} is at position ${position} but its checkpoint is at ${checkpoint.position}.`);
    if (!checkpoint.judge.pass) failures.push(`Slot ${slot.id}'s checkpoint did not pass its Judge.`);
  }
  const slotIds = new Set(slots.map((slot) => slot.id));
  for (const checkpoint of checkpoints) {
    if (!slotIds.has(checkpoint.slotId)) failures.push(`Checkpoint for slot ${checkpoint.slotId} is not on the approved Blueprint.`);
  }
  return failures;
}

/**
 * The short commitments one Lesson makes to the rest of the Course, for the whole-Course Judge: a Reading's section
 * headings, or a Quiz's objectives. Derived from what the checkpoint already stores; no Lesson body is re-read.
 * @param checkpoint - A finalized checkpoint
 */
export function lessonCommitments(checkpoint: Pick<LessonCheckpoint, "teachingMethod" | "objectives" | "body">): string[] {
  if (checkpoint.teachingMethod === QUIZ_METHOD_ID) return checkpoint.objectives;
  return (checkpoint.body as ReadingBody).sections.map((section) => section.heading);
}

/** What one Course Request publishes from. */
export type PublicationInput = {
  learnerId: string;
  courseRequestId: string;
  subject: string;
  learningGoal: string;
  approved: ApprovedBlueprint;
  /** Checkpoints that passed `courseCodeFailures`. */
  checkpoints: readonly LessonCheckpoint[];
  /** New row ids; tests pass a deterministic one. */
  newId?: () => string;
};

/** The published snapshot rows for one Course, ready to insert together. */
export type PublicationRows = {
  course: typeof publishedCourses.$inferInsert;
  modules: (typeof publishedModules.$inferInsert)[];
  lessons: (typeof publishedLessons.$inferInsert)[];
};

/**
 * Builds the published Course snapshot from the approved Blueprint and its checkpoints: Blueprint Modules become
 * published Modules, each slot's checkpoint becomes a published Lesson at the same position, and a Quiz's assessed
 * slots become the published Lesson ids it assesses.
 * @param input - Request fields, the approved Blueprint, and its checkpoints
 */
export function publicationRows(input: PublicationInput): PublicationRows {
  const newId = input.newId ?? randomUUID;
  const courseId = newId();
  const bySlot = new Map(input.checkpoints.map((checkpoint) => [checkpoint.slotId, checkpoint]));
  const lessonIds = new Map(blueprintSlots(input.approved.blueprint).map((slot) => [slot.id, newId()]));

  const modules: PublicationRows["modules"] = [];
  const lessons: PublicationRows["lessons"] = [];
  for (const [modulePosition, module] of input.approved.blueprint.modules.entries()) {
    const moduleId = newId();
    modules.push({ id: moduleId, publishedCourseId: courseId, title: module.title, position: modulePosition });
    for (const slot of module.slots) {
      const checkpoint = bySlot.get(slot.id);
      if (!checkpoint) throw new Error(`[publication: publicationRows] Slot has no checkpoint || slotId=${slot.id}`);
      lessons.push({
        id: lessonIds.get(slot.id)!,
        publishedCourseId: courseId,
        moduleId,
        position: checkpoint.position,
        teachingMethod: checkpoint.teachingMethod,
        title: checkpoint.title,
        lessonGoal: checkpoint.lessonGoal,
        objectives: checkpoint.objectives,
        topicTags: checkpoint.topicTags,
        assessedLessonIds: slot.assessesSlotIds.map((slotId) => lessonIds.get(slotId)!),
        lineage: checkpoint.lineage,
        sources: checkpoint.sources,
        citations: checkpoint.citations,
        body: checkpoint.body as ReadingBody | QuizBody,
      });
    }
  }

  return {
    course: {
      id: courseId,
      learnerId: input.learnerId,
      courseRequestId: input.courseRequestId,
      title: input.approved.blueprint.courseTitle,
      subject: input.subject,
      learningGoal: input.learningGoal,
      sequenceMode: input.approved.sequenceMode,
    },
    modules,
    lessons,
  };
}
