import { GOAL_CHECK_METHOD_ID, MAX_GOAL_OBJECTIVES, MIN_GOAL_OBJECTIVES } from "./goal-check.ts";
import { MAX_SLOT_VISUALS, VISUAL_KINDS, type PlannedVisual } from "./media.ts";
import { QUIZ_METHOD_ID, READING_METHOD_ID } from "./reading-lesson.ts";
import type { SequenceMode } from "./sequence-mode.ts";
import type { QuizCadence } from "./teaching-profile.ts";

/** Teaching methods a Blueprint slot may name. */
export const REGISTERED_METHODS = [READING_METHOD_ID, QUIZ_METHOD_ID, GOAL_CHECK_METHOD_ID] as const;

/** A registered Teaching method id. */
export type BlueprintMethod = (typeof REGISTERED_METHODS)[number];

/** Topic tags per slot (spec §4.4). */
export const MIN_TOPIC_TAGS = 2;
export const MAX_TOPIC_TAGS = 5;

/** Objectives a Quiz slot may list (spec §6.2); more is structural. */
export const MAX_QUIZ_OBJECTIVES = 10;

/**
 * Lessons a Course may hold, not counting its Goal Check. Each Reading is about one screen (decision 2026-11-03), so a Course needs more of them than when
 * the cap was 6 to keep a run near half an hour (SEN-82); Lessons are still written one after another.
 */
export const MIN_COURSE_LESSONS = 3;
export const MAX_COURSE_LESSONS = 30;

/** Readings one Chapter holds: one topic, researched once and written in one author call (decision 2026-11-03). */
export const MAX_CHAPTER_LESSONS = 4;

/** Chapters a Course may hold. This, not the Lesson cap, is what keeps one generation run near half an hour. */
export const MAX_COURSE_CHAPTERS = 6;

/**
 * How many Chapters each Quiz cadence puts before a Quiz, within one Module (spec §4.1 Q6). The cadence counted
 * Readings until each Reading became one screen; a Chapter is what a Reading was then (decision 2026-11-03).
 */
export const CADENCE_READINGS: Record<QuizCadence, { min: number; max: number } | "module"> = {
  every_reading: { min: 1, max: 1 },
  every_2_to_3_readings: { min: 2, max: 3 },
  module_end: "module",
};

/**
 * One Lesson-to-be. `assessesSlotIds` is empty except on a Quiz, where it names the Reading slots it assesses.
 * `visuals` names what a Reading should show, the way a teacher plans what to draw on the board (SEN-121): each with
 * its kind and the intent behind it, at most {@link MAX_SLOT_VISUALS}. The Reading's writer turns each into a brief,
 * and a visual that cannot be made or found is dropped, never a defect. The Learner never sees it. Absent on a Quiz,
 * and on Blueprints written before it existed (those written before SEN-121 may carry a `requiredMedia` key, which
 * nothing reads). `chapter` names the Chapter a Reading belongs to (decision 2026-11-03): consecutive Readings with the
 * same chapter are researched once and written in one author call. Absent on a Quiz, and on Blueprints written before
 * Chapters existed.
 *
 * On the Goal Check slot (SEN-81), `objectives` are the parts of the Learning Goal, planned from the Learning Goal and
 * Starting Level rather than from the last Lessons. `objectiveSlotIds` names, for each of those objectives, the
 * Reading slots that teach it; its keys are exactly `objectives`, and `assessesSlotIds` is every slot it names. Absent
 * on every other slot.
 */
export type BlueprintSlot = {
  id: string;
  method: BlueprintMethod;
  title: string;
  lessonGoal: string;
  objectives: string[];
  topicTags: string[];
  assessesSlotIds: string[];
  visuals?: PlannedVisual[];
  chapter?: string;
  objectiveSlotIds?: Record<string, string[]>;
};

/** One Chapter: a run of consecutive Readings on one topic, researched once and written together (decision 2026-11-03). */
export type BlueprintChapter = { title: string; slots: BlueprintSlot[] };

/** A named grouping of slots. */
export type BlueprintModule = {
  title: string;
  slots: BlueprintSlot[];
};

/** Why the Learner marked plan Lessons as not relevant; the reason is optional (spec §4.4). */
export const IRRELEVANT_REASONS = ["already_know", "not_my_goal"] as const;

/** One reason for marking plan Lessons as not relevant. */
export type IrrelevantReason = (typeof IRRELEVANT_REASONS)[number];

/** The Learner's marks on a Blueprint under review. The next Blueprint run revises from them, then they are gone. */
export type BlueprintFeedback = { irrelevantSlotIds: string[]; reason: IrrelevantReason | null };

/**
 * Why a finished Course's sequence had to be planned again: the whole-Course Judge found that the written Lessons,
 * taken in order, do not reach the Learning Goal (spec §6.5). Carried on the draft so the structural return's
 * redesign knows what to avoid (SEN-85).
 */
export type SequenceFailure = { reasons: string[] };

/** The Module and Lesson sequence for the remaining gap alone. */
export type CourseBlueprint = {
  courseTitle: string;
  modules: BlueprintModule[];
  /** Set on a draft while its revision from the Learner's review is queued (SEN-87). */
  learnerFeedback?: BlueprintFeedback;
  /**
   * Set on a draft the structural return un-approved, while its redesign is queued (SEN-85). Never set together with
   * `learnerFeedback`: the return clears the Learner's marks, which belong to a plan that has already been generated.
   */
  sequenceFailure?: SequenceFailure;
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

/**
 * The Blueprint's Goal Check slot, or null on a Blueprint planned before SEN-81.
 * @param blueprint - Stored Blueprint
 */
export function goalCheckSlot(blueprint: CourseBlueprint): BlueprintSlot | null {
  return blueprintSlots(blueprint).find((slot) => slot.method === GOAL_CHECK_METHOD_ID) ?? null;
}

/** Every slot in Course order. */
export function blueprintSlots(blueprint: CourseBlueprint): BlueprintSlot[] {
  return blueprint.modules.flatMap((module) => module.slots);
}

/**
 * The key two Readings share when they are in the same Chapter. A Reading planned before Chapters existed is a Chapter
 * of its own.
 * @param slot - A Reading slot
 */
export function chapterKey(slot: BlueprintSlot): string {
  return slot.chapter?.trim().toLowerCase() || `slot:${slot.id}`;
}

/**
 * The Chapters of a Blueprint in Course order: each run of consecutive Readings with the same chapter, Quizzes left
 * out. A Quiz between two Readings of one chapter splits it into two runs here, which the Code checks fail.
 * @param blueprint - Stored Blueprint
 */
export function blueprintChapters(blueprint: CourseBlueprint): BlueprintChapter[] {
  const chapters: BlueprintChapter[] = [];
  let last: { key: string; chapter: BlueprintChapter } | null = null;
  for (const slot of blueprintSlots(blueprint)) {
    if (slot.method !== READING_METHOD_ID) {
      last = null;
      continue;
    }
    const key = chapterKey(slot);
    if (last && last.key === key) {
      last.chapter.slots.push(slot);
      continue;
    }
    last = { key, chapter: { title: slot.chapter?.trim() || slot.title, slots: [slot] } };
    chapters.push(last.chapter);
  }
  return chapters;
}

/**
 * Chapter problems (decision 2026-11-03): every Reading names its Chapter, a Chapter's Readings sit together with no
 * other Reading or Quiz between them, a Chapter holds at most {@link MAX_CHAPTER_LESSONS} Readings, and a Course at most
 * {@link MAX_COURSE_CHAPTERS} Chapters.
 * @param blueprint - Blueprint to check
 */
function chapterFailures(blueprint: CourseBlueprint): string[] {
  const failures: string[] = [];
  blueprintSlots(blueprint).forEach((slot, index) => {
    if (slot.method === READING_METHOD_ID && !slot.chapter?.trim()) failures.push(`Slot ${index + 1} is a Reading that names no chapter.`);
  });
  const seen = new Set<string>();
  for (const chapter of blueprintChapters(blueprint)) {
    const key = chapterKey(chapter.slots[0]!);
    if (seen.has(key)) failures.push(`Chapter “${chapter.title}” is split: its Readings must sit together, with no other Reading or Quiz between them.`);
    seen.add(key);
    if (chapter.slots.length > MAX_CHAPTER_LESSONS) {
      failures.push(`Chapter “${chapter.title}” has ${chapter.slots.length} Readings; a Chapter holds at most ${MAX_CHAPTER_LESSONS}.`);
    }
  }
  if (seen.size > MAX_COURSE_CHAPTERS) failures.push(`A Course has at most ${MAX_COURSE_CHAPTERS} Chapters, not ${seen.size}.`);
  return failures;
}

const TOPIC_TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Quiz-placement problems: every Module ends on a Quiz, every Reading is assessed by the next Quiz after it, and the
 * Chapters before each Quiz follow the Learner's Quiz cadence.
 * @param blueprint - Blueprint to check
 * @param cadence - The Learner's resolved Quiz cadence
 */
function cadenceFailures(blueprint: CourseBlueprint, cadence: QuizCadence): string[] {
  const failures: string[] = [];
  const rule = CADENCE_READINGS[cadence];
  for (const [moduleIndex, module] of blueprint.modules.entries()) {
    const label = `Module ${moduleIndex + 1}`;
    const taught = module.slots.filter((slot) => slot.method !== GOAL_CHECK_METHOD_ID);
    if (taught.at(-1)?.method !== QUIZ_METHOD_ID) failures.push(`${label} must end with a Quiz so every Reading is assessed.`);
    let readings: BlueprintSlot[] = [];
    let quizzes = 0;
    for (const slot of taught) {
      if (slot.method === READING_METHOD_ID) {
        readings.push(slot);
        continue;
      }
      if (slot.method !== QUIZ_METHOD_ID) continue;
      quizzes += 1;
      const unassessed = readings.filter((reading) => !slot.assessesSlotIds.includes(reading.id));
      if (unassessed.length) failures.push(`“${slot.title}” must assess every Reading since the previous Quiz.`);
      const chapters = new Set(readings.map(chapterKey)).size;
      if (rule !== "module" && (chapters < rule.min || chapters > rule.max)) {
        const span = rule.min === rule.max ? `${rule.min}` : `${rule.min}–${rule.max}`;
        failures.push(`“${slot.title}” follows ${chapters} Chapters; the Quiz cadence asks for ${span}.`);
      }
      readings = [];
    }
    if (rule === "module" && quizzes !== 1) failures.push(`${label} has ${quizzes} Quizzes; the Quiz cadence asks for one, at Module end.`);
  }
  return failures;
}

/**
 * Goal Check problems (SEN-81): exactly one Goal Check, as the Course's very last slot, with
 * {@link MIN_GOAL_OBJECTIVES}–{@link MAX_GOAL_OBJECTIVES} goal objectives, each taught by at least one earlier
 * Reading, and assessing exactly the Readings its objectives name.
 * @param blueprint - Blueprint to check
 */
function goalCheckFailures(blueprint: CourseBlueprint): string[] {
  const failures: string[] = [];
  const slots = blueprintSlots(blueprint);
  const checks = slots.filter((slot) => slot.method === GOAL_CHECK_METHOD_ID);
  if (checks.length !== 1) return [`A Course ends with exactly one Goal Check, not ${checks.length}.`];
  const slot = checks[0]!;
  if (slots.at(-1) !== slot) failures.push("The Goal Check must be the Course's last Lesson.");
  if (slot.objectives.length < MIN_GOAL_OBJECTIVES || slot.objectives.length > MAX_GOAL_OBJECTIVES) {
    failures.push(`The Goal Check lists ${MIN_GOAL_OBJECTIVES}–${MAX_GOAL_OBJECTIVES} goal objectives, not ${slot.objectives.length}.`);
  }
  if (new Set(slot.objectives.map((objective) => objective.trim().toLowerCase())).size !== slot.objectives.length) {
    failures.push("The Goal Check repeats a goal objective.");
  }
  const map = slot.objectiveSlotIds ?? {};
  const keys = Object.keys(map);
  if (keys.length !== slot.objectives.length || slot.objectives.some((objective) => !(objective in map))) {
    failures.push("The Goal Check must name the teaching Readings for each of its goal objectives, and nothing else.");
  }
  const position = slots.indexOf(slot);
  const named = new Set<string>();
  for (const objective of slot.objectives) {
    const ids = map[objective] ?? [];
    if (ids.length === 0) failures.push(`Goal objective “${objective}” is taught by no Reading.`);
    for (const id of ids) {
      const index = slots.findIndex((candidate) => candidate.id === id);
      if (index === -1 || index > position || slots[index]!.method !== READING_METHOD_ID) {
        failures.push(`Goal objective “${objective}” names ${id}, which is not an earlier Reading.`);
      }
      named.add(id);
    }
  }
  const assessed = new Set(slot.assessesSlotIds);
  if (assessed.size !== named.size || [...named].some((id) => !assessed.has(id))) {
    failures.push("The Goal Check must assess exactly the Readings its goal objectives name.");
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
  const lessons = slots.filter((slot) => slot.method !== GOAL_CHECK_METHOD_ID);
  if (!blueprint.courseTitle.trim()) failures.push("The Course needs a title.");
  if (blueprint.modules.some((module) => !module.title.trim() || module.slots.length === 0)) {
    failures.push("Every Module needs a title and at least one slot.");
  }
  if (new Set(slots.map((slot) => slot.id)).size !== slots.length) failures.push("Slot ids must be unique.");
  if (lessons.length < MIN_COURSE_LESSONS || lessons.length > MAX_COURSE_LESSONS) {
    failures.push(`A Course has ${MIN_COURSE_LESSONS}–${MAX_COURSE_LESSONS} Lessons before its Goal Check, not ${lessons.length}.`);
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
    } else if (slot.method !== GOAL_CHECK_METHOD_ID && slot.assessesSlotIds.length > 0) {
      failures.push(`${label} is not a Quiz and must not assess other slots.`);
    }
    if (slot.method !== GOAL_CHECK_METHOD_ID && slot.objectiveSlotIds) failures.push(`${label} is not the Goal Check and must not map goal objectives.`);

    const visuals = slot.visuals ?? [];
    if (visuals.length && slot.method !== READING_METHOD_ID) failures.push(`${label} is not a Reading and must not plan visuals.`);
    if (visuals.length > MAX_SLOT_VISUALS) failures.push(`${label} plans ${visuals.length} visuals; a Reading shows at most ${MAX_SLOT_VISUALS}.`);
    for (const visual of visuals) {
      if (!(VISUAL_KINDS as readonly string[]).includes(visual.kind)) failures.push(`${label} plans a visual of an unknown kind, "${visual.kind}".`);
      if (!visual.intent.trim()) failures.push(`${label} plans a visual with no intent.`);
    }
  });

  const goals = slots.map((slot) => slot.lessonGoal.trim().toLowerCase());
  if (new Set(goals).size !== goals.length) failures.push("No two slots may share a Lesson goal.");
  if (!slots.some((slot) => slot.method === READING_METHOD_ID) || !slots.some((slot) => slot.method === QUIZ_METHOD_ID)) {
    failures.push("The Blueprint needs at least one Reading and one Quiz.");
  }
  failures.push(...chapterFailures(blueprint));
  failures.push(...goalCheckFailures(blueprint));
  failures.push(...cadenceFailures(blueprint, cadence));
  return failures;
}
