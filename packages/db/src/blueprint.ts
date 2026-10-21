import { QUIZ_METHOD_ID, READING_METHOD_ID } from "./reading-lesson.ts";
import type { SequenceMode } from "./sequence-mode.ts";
import type { QuizCadence } from "./teaching-profile.ts";

/** Teaching methods a Blueprint slot may name. */
export const REGISTERED_METHODS = [READING_METHOD_ID, QUIZ_METHOD_ID] as const;

/** A registered Teaching method id. */
export type BlueprintMethod = (typeof REGISTERED_METHODS)[number];

/** Topic tags per slot (spec §4.4). */
export const MIN_TOPIC_TAGS = 2;
export const MAX_TOPIC_TAGS = 5;

/** Objectives a Quiz slot may list (spec §6.2); more is structural. */
export const MAX_QUIZ_OBJECTIVES = 10;

/** Lessons a Course may hold. The cap keeps one generation run to about half an hour (SEN-82). */
export const MIN_COURSE_LESSONS = 3;
export const MAX_COURSE_LESSONS = 6;

/** How many Readings each Quiz cadence puts before a Quiz, within one Module (spec §4.1 Q6). */
export const CADENCE_READINGS: Record<QuizCadence, { min: number; max: number } | "module"> = {
  every_reading: { min: 1, max: 1 },
  every_2_to_3_readings: { min: 2, max: 3 },
  module_end: "module",
};

/**
 * One Lesson-to-be. `assessesSlotIds` is empty except on a Quiz, where it names the Reading slots it assesses.
 */
export type BlueprintSlot = {
  id: string;
  method: BlueprintMethod;
  title: string;
  lessonGoal: string;
  objectives: string[];
  topicTags: string[];
  assessesSlotIds: string[];
};

/** A named grouping of slots. */
export type BlueprintModule = {
  title: string;
  slots: BlueprintSlot[];
};

/** The Module and Lesson sequence for the remaining gap alone. */
export type CourseBlueprint = {
  courseTitle: string;
  modules: BlueprintModule[];
};

/** The binary verdict of a Judge check (spec §6.1). */
export type JudgeResult = {
  pass: boolean;
  failedChecks: string[];
  reasons: string[];
};

/** What the Learner approved: the Blueprint as reviewed and the Sequence mode chosen with it. */
export type ApprovedBlueprint = {
  blueprint: CourseBlueprint;
  sequenceMode: SequenceMode;
  approvedAt: string;
};

/** What Learner review shows of a slot: titles and Lesson goals only. */
export type LearnerBlueprintSlot = Pick<BlueprintSlot, "id" | "method" | "title" | "lessonGoal">;

/** What Learner review shows of a Blueprint. */
export type LearnerBlueprint = {
  courseTitle: string;
  modules: { title: string; slots: LearnerBlueprintSlot[] }[];
};

/**
 * Strips objectives, Topic tags, and assessed slots; review is for relevance, not structure.
 * @param blueprint - Stored Blueprint
 */
export function learnerBlueprint(blueprint: CourseBlueprint): LearnerBlueprint {
  return {
    courseTitle: blueprint.courseTitle,
    modules: blueprint.modules.map((module) => ({
      title: module.title,
      slots: module.slots.map(({ id, method, title, lessonGoal }) => ({ id, method, title, lessonGoal })),
    })),
  };
}

/** Every slot in Course order. */
export function blueprintSlots(blueprint: CourseBlueprint): BlueprintSlot[] {
  return blueprint.modules.flatMap((module) => module.slots);
}

const TOPIC_TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Quiz-placement problems: every Module ends on a Quiz, every Reading is assessed by the next Quiz after it, and the
 * Readings before each Quiz follow the Learner's Quiz cadence.
 * @param blueprint - Blueprint to check
 * @param cadence - The Learner's resolved Quiz cadence
 */
function cadenceFailures(blueprint: CourseBlueprint, cadence: QuizCadence): string[] {
  const failures: string[] = [];
  const rule = CADENCE_READINGS[cadence];
  for (const [moduleIndex, module] of blueprint.modules.entries()) {
    const label = `Module ${moduleIndex + 1}`;
    if (module.slots.at(-1)?.method !== QUIZ_METHOD_ID) failures.push(`${label} must end with a Quiz so every Reading is assessed.`);
    let readings: BlueprintSlot[] = [];
    let quizzes = 0;
    for (const slot of module.slots) {
      if (slot.method === READING_METHOD_ID) {
        readings.push(slot);
        continue;
      }
      if (slot.method !== QUIZ_METHOD_ID) continue;
      quizzes += 1;
      const unassessed = readings.filter((reading) => !slot.assessesSlotIds.includes(reading.id));
      if (unassessed.length) failures.push(`“${slot.title}” must assess every Reading since the previous Quiz.`);
      if (rule !== "module" && (readings.length < rule.min || readings.length > rule.max)) {
        const span = rule.min === rule.max ? `${rule.min}` : `${rule.min}–${rule.max}`;
        failures.push(`“${slot.title}” follows ${readings.length} Readings; the Quiz cadence asks for ${span}.`);
      }
      readings = [];
    }
    if (rule === "module" && quizzes !== 1) failures.push(`${label} has ${quizzes} Quizzes; the Quiz cadence asks for one, at Module end.`);
  }
  return failures;
}

/**
 * Deterministic Blueprint checks (spec §6.2 Code), plus this prototype's shape: 3–6 Lessons with Quizzes placed by the
 * Learner's Quiz cadence.
 * @param blueprint - Blueprint to check
 * @param cadence - The Learner's resolved Quiz cadence
 * @returns Each problem found; empty when the Blueprint passes
 */
export function blueprintCodeFailures(blueprint: CourseBlueprint, cadence: QuizCadence): string[] {
  const failures: string[] = [];
  const slots = blueprintSlots(blueprint);
  if (!blueprint.courseTitle.trim()) failures.push("The Course needs a title.");
  if (blueprint.modules.some((module) => !module.title.trim() || module.slots.length === 0)) {
    failures.push("Every Module needs a title and at least one slot.");
  }
  if (new Set(slots.map((slot) => slot.id)).size !== slots.length) failures.push("Slot ids must be unique.");
  if (slots.length < MIN_COURSE_LESSONS || slots.length > MAX_COURSE_LESSONS) {
    failures.push(`A Course has ${MIN_COURSE_LESSONS}–${MAX_COURSE_LESSONS} Lessons, not ${slots.length}.`);
  }

  slots.forEach((slot, index) => {
    const label = `Slot ${index + 1}`;
    if (!slot.title.trim()) failures.push(`${label} needs a title.`);
    if (!slot.lessonGoal.trim()) failures.push(`${label} needs a Lesson goal.`);
    if (slot.objectives.length === 0 || slot.objectives.some((objective) => !objective.trim())) {
      failures.push(`${label} needs non-empty objectives.`);
    }
    if (!(REGISTERED_METHODS as readonly string[]).includes(slot.method)) failures.push(`${label} names an unregistered teaching method.`);
    if (slot.topicTags.length < MIN_TOPIC_TAGS || slot.topicTags.length > MAX_TOPIC_TAGS) {
      failures.push(`${label} needs ${MIN_TOPIC_TAGS}–${MAX_TOPIC_TAGS} Topic tags.`);
    }
    if (slot.topicTags.some((tag) => !TOPIC_TAG.test(tag))) failures.push(`${label} Topic tags must be lowercase slugs.`);
    if (new Set(slot.topicTags).size !== slot.topicTags.length) failures.push(`${label} repeats a Topic tag.`);

    if (slot.method === QUIZ_METHOD_ID) {
      if (slot.objectives.length > MAX_QUIZ_OBJECTIVES) failures.push(`${label} is a Quiz with more than ${MAX_QUIZ_OBJECTIVES} objectives.`);
      if (slot.assessesSlotIds.length === 0) failures.push(`${label} is a Quiz that assesses no Lessons.`);
      for (const assessedId of slot.assessesSlotIds) {
        const assessedIndex = slots.findIndex((candidate) => candidate.id === assessedId);
        if (assessedIndex === -1) failures.push(`${label} assesses a slot that does not exist.`);
        else if (assessedIndex >= index) failures.push(`${label} assesses a slot that does not precede it.`);
        else if (slots[assessedIndex]!.method !== READING_METHOD_ID) failures.push(`${label} assesses a slot that is not a Reading.`);
      }
    } else if (slot.assessesSlotIds.length > 0) {
      failures.push(`${label} is not a Quiz and must not assess other slots.`);
    }
  });

  const goals = slots.map((slot) => slot.lessonGoal.trim().toLowerCase());
  if (new Set(goals).size !== goals.length) failures.push("No two slots may share a Lesson goal.");
  if (!slots.some((slot) => slot.method === READING_METHOD_ID) || !slots.some((slot) => slot.method === QUIZ_METHOD_ID)) {
    failures.push("The Blueprint needs at least one Reading and one Quiz.");
  }
  failures.push(...cadenceFailures(blueprint, cadence));
  return failures;
}
