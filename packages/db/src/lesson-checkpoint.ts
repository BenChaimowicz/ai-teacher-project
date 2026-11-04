import type { BlueprintSlot } from "./blueprint.ts";
import { GOAL_CHECK_MAX_ITEMS, GOAL_CHECK_METHOD_ID, GOAL_CHECK_MIN_ITEMS, parseGoalCheckBody, type GoalCheckBody } from "./goal-check.ts";
import { MAX_SLOT_VISUALS } from "./media.ts";
import type { LessonLineage } from "./lesson-reuse.ts";
import { parseQuizBody, QUIZ_MAX_ITEMS, QUIZ_MIN_ITEMS, QUIZ_OPTION_COUNT, type QuizBody } from "./quiz.ts";
import {
  MAX_READING_SECTIONS, MAX_READING_WORDS, mediaBlockFailures, proseBlocks, QUIZ_METHOD_ID, READING_METHOD_ID, readingWordCount,
  type MediaBlock, type NumberedSource, type ReadingBody,
} from "./reading-lesson.ts";

/**
 * One Source in a Lesson's stored source list (spec §5.3), numbered as its inline Citations are.
 * `publisher` is the Source's host until page extraction can read a real publisher. Vendor excerpts are not
 * verified page text, so every Source is used as a paraphrase and none carries `quotedText` (ADR 0005).
 */
export type LessonSource = {
  n: number;
  sourceId: string;
  url: string;
  title: string;
  publisher: string;
  retrievedAt: string;
  usedAs: "quote" | "paraphrase";
  quotedText?: string;
  license?: string;
  doi?: string;
};

/**
 * A finished reading Lesson before publication: the shared envelope plus the reading body.
 * `citations` is the numbered list Study shows; `sources` is the same list with Source IDs and provenance.
 * `lineage` is null for a Lesson written for this Course, and names the published Lesson a reused one was copied from.
 */
export type ReadingLessonDraft = {
  slotId: string;
  teachingMethod: typeof READING_METHOD_ID;
  title: string;
  lessonGoal: string;
  objectives: string[];
  topicTags: string[];
  lineage: LessonLineage | null;
  sources: LessonSource[];
  citations: NumberedSource[];
  body: ReadingBody;
};

/** An inline numbered Citation marker in reading prose, as Study renders it. */
const CITATION_MARKER = /\[(\d+)\]/g;

/** A Source ID marker the Generator wrote that was not resolved to a number. */
const SOURCE_ID_MARKER = /\[[^\]]*\bsrc_[^\]]*\]/;

/** Markdown or HTML in reading prose, which Study renders as plain text: image and link syntax, bold, tags, URLs, and a heading or list at a line start. */
const MARKUP = /!\[|\]\(|\*\*|__|<\/?[a-z][^>]*>|https?:\/\/\S+|^\s*(?:#{1,6}\s|[-*+]\s|\d+\.\s)/gim;

/** Media blocks one Reading may carry: one per visual its slot plans (SEN-121). */
export const MAX_MEDIA_BLOCKS = MAX_SLOT_VISUALS;

/**
 * Code checks for a reading Lesson before checkpoint (spec §6.3): envelope, reading-method shape, Citations that
 * resolve to this Lesson's retrieval set, and a hostable, well-formed descriptor behind every media block.
 * @param lesson - The finished Lesson
 * @param retrievalUrls - URLs of every Source in the Source packs retrieved for this Lesson
 * @returns Learner-invisible failure messages; empty when the Lesson passes
 */
export function readingCodeFailures(lesson: ReadingLessonDraft, retrievalUrls: ReadonlySet<string>): string[] {
  const failures: string[] = [];
  if (lesson.teachingMethod !== READING_METHOD_ID) failures.push("The Lesson must use the reading method.");
  if (!lesson.title.trim() || !lesson.lessonGoal.trim()) failures.push("The Lesson needs a title and a Lesson goal.");
  if (lesson.objectives.length === 0 || lesson.objectives.some((objective) => !objective.trim())) {
    failures.push("The Lesson needs non-empty objectives.");
  }

  const sections = lesson.body.sections;
  if (sections.length === 0) failures.push("A reading Lesson needs at least one reading section.");
  if (sections.some((section) => !section.heading.trim() || section.blocks.length === 0)) {
    failures.push("Every reading section needs a heading and at least one content block.");
  }
  const prose = sections.flatMap(proseBlocks).map((block) => block.text);
  if (sections.some((section) => proseBlocks(section).length === 0)) failures.push("Every reading section needs prose, not only media.");
  const media = sections.flatMap((section) => section.blocks).filter((block): block is MediaBlock => block.kind === "media");
  if (media.length > MAX_MEDIA_BLOCKS) failures.push(`A Reading carries at most ${MAX_MEDIA_BLOCKS} media blocks.`);
  if (new Set(media.map((block) => block.descriptor.id)).size !== media.length) failures.push("A Reading shows each media file once.");
  for (const block of media) failures.push(...mediaBlockFailures(block));
  if (prose.some((text) => !text.trim())) failures.push("Every content block needs text.");
  // A Reading explains and the Quiz checks (decision 2026-11-02): a question in it reads as a test the Learner cannot answer.
  const questions = [...sections.map((section) => section.heading), ...prose].flatMap((text) => text.match(/[^.!?]*\?/g) ?? []).map((text) => text.trim());
  if (questions.length) {
    failures.push(`A Reading asks the Learner no questions. Rewrite each question as the plain statement it was asking for: ${questions.map((text) => `"${text}"`).join("; ")}`);
  }
  // Prose is plain text (decision 2026-11-03): Study renders no Markdown, and a repair once "provided" an image the Judge
  // asked for by writing image syntax and a bold label into a paragraph. Images are blocks, never text.
  const markup = [...sections.map((section) => section.heading), ...prose].flatMap((text) => text.match(MARKUP) ?? []);
  if (markup.length) {
    failures.push(`Prose is plain text, not Markdown or HTML: ${[...new Set(markup)].map((hit) => `"${hit.trim()}"`).join(", ")}. Say it in words; an image, figure, link, or label does not belong in the text.`);
  }
  // A Reading is about one screen (decision 2026-11-03): a longer one is cut, never paged; the Blueprint plans more Lessons.
  const words = readingWordCount(lesson.body);
  if (words > MAX_READING_WORDS) {
    failures.push(`A Reading is about one screen: at most ${MAX_READING_WORDS} words of prose, not ${words}. Cut whole sentences no objective needs, Source ID markers included; do not compress by rewriting.`);
  }
  if (sections.length > MAX_READING_SECTIONS) {
    failures.push(`A Reading has at most ${MAX_READING_SECTIONS} sections, not ${sections.length}. Cut the sections an objective does not need, paragraph by paragraph.`);
  }
  if (prose.some((text) => SOURCE_ID_MARKER.test(text))) failures.push("A Citation points at a Source ID outside this Lesson's Source packs.");

  const numbers = lesson.citations.map((citation) => citation.n);
  if (numbers.length === 0) failures.push("A reading Lesson must cite at least one Source.");
  if (numbers.some((n, index) => n !== index + 1)) failures.push("Citations must be numbered 1, 2, 3… in order.");
  const outside = lesson.citations.filter((citation) => !retrievalUrls.has(citation.url));
  if (outside.length) failures.push(`Citation URLs are not in this Lesson's retrieval set: ${outside.map((citation) => citation.url).join(", ")}`);
  if (lesson.sources.length !== lesson.citations.length ||
      lesson.sources.some((source, index) => source.n !== lesson.citations[index]!.n || source.url !== lesson.citations[index]!.url)) {
    failures.push("The stored source list must match the numbered Citations.");
  }
  if (lesson.sources.some((source) => source.usedAs === "quote" && !source.quotedText?.trim())) {
    failures.push("A quoted Source must store its quoted text.");
  }

  const cited = new Set(prose.flatMap((text) => [...text.matchAll(CITATION_MARKER)].map((match) => Number(match[1]))));
  const known = new Set(numbers);
  if ([...cited].some((n) => !known.has(n))) failures.push("An inline Citation number has no Source in the source list.");
  if (numbers.some((n) => !cited.has(n))) failures.push("Every listed Source must be cited inline.");
  return failures;
}

/**
 * A finished Quiz Lesson before publication: the shared envelope plus the Quiz body. A Quiz cites nothing of its own;
 * its items rest on the Reading Lessons it assesses, so `sources` and `citations` are empty. Quizzes are never reused,
 * so `lineage` is always null.
 */
export type QuizLessonDraft = {
  slotId: string;
  teachingMethod: typeof QUIZ_METHOD_ID;
  title: string;
  lessonGoal: string;
  objectives: string[];
  topicTags: string[];
  lineage: null;
  sources: LessonSource[];
  citations: NumberedSource[];
  body: QuizBody;
};

/**
 * A finished Goal Check Lesson before publication (SEN-81): the shared envelope plus the Goal Check body. Like a Quiz it
 * cites nothing of its own and is never reused. Its `objectives` are the slot's goal objectives, the parts of the
 * Learning Goal, and every item names the one it checks.
 */
export type GoalCheckLessonDraft = {
  slotId: string;
  teachingMethod: typeof GOAL_CHECK_METHOD_ID;
  title: string;
  lessonGoal: string;
  objectives: string[];
  topicTags: string[];
  lineage: null;
  sources: LessonSource[];
  citations: NumberedSource[];
  body: GoalCheckBody;
};

/** Keys a Quiz body and a Quiz item may carry; anything else (reading sections, media) is not a Quiz. */
const QUIZ_BODY_KEYS = new Set(["items"]);
const QUIZ_ITEM_KEYS = new Set(["id", "prompt", "options", "correctOptionId", "explanations"]);

/** A Goal Check item also names its goal objective (SEN-81). */
const GOAL_CHECK_ITEM_KEYS = new Set([...QUIZ_ITEM_KEYS, "objective"]);

/**
 * An explanation pointing at an option by letter or position, which shuffling makes wrong: "option A", "(b)",
 * "the third option", "the first is wrong". A bare lowercase letter is English ("the answer a careful reader picks"),
 * and an ordinal on anything but an option ("the first root") is content.
 */
const OPTION_REFERENCE = [
  /\b(?:[Oo]ption|[Aa]nswer|[Cc]hoice)\s+[A-D]\b|\([A-Da-d]\)/,
  /\b(?:first|second|third|fourth|last)\s+(?:option|choice|answer|distractor)s?\b/i,
  /\b(?:first|second|third|fourth|last)(?:\s+one)?\s+(?:is|are|was|would)\b/i,
];

/** Option text a model left as a slot name rather than an answer: "option1", "Option B", "a", "answer". */
const PLACEHOLDER_OPTION = /^(?:(?:option|answer|choice|distractor)\s*[a-d1-4]?|[a-d1-4])[.)]?$/;

/** What differs between the Quiz's and the Goal Check's Code checks; everything else they share. */
type AssessmentRules = {
  method: string;
  /** How a failure names the Lesson kind: "Quiz" or "Goal Check". */
  name: string;
  minItems: number;
  maxItems: number;
  itemKeys: ReadonlySet<string>;
  /** The plugin's own body parser, run last as the final word on shape. */
  parses: (body: unknown) => boolean;
};

/** The Quiz's Code-check rules (spec §6.4). */
const QUIZ_RULES: AssessmentRules = {
  method: QUIZ_METHOD_ID, name: "Quiz", minItems: QUIZ_MIN_ITEMS, maxItems: QUIZ_MAX_ITEMS, itemKeys: QUIZ_ITEM_KEYS,
  parses: (body) => parseQuizBody(body) !== null,
};

/** The Goal Check's Code-check rules (SEN-81). */
const GOAL_CHECK_RULES: AssessmentRules = {
  method: GOAL_CHECK_METHOD_ID, name: "Goal Check", minItems: GOAL_CHECK_MIN_ITEMS, maxItems: GOAL_CHECK_MAX_ITEMS,
  itemKeys: GOAL_CHECK_ITEM_KEYS, parses: (body) => parseGoalCheckBody(body) !== null,
};

/**
 * Code checks a Quiz and a Goal Check share: envelope, four-option single-correct items with a why on every option and
 * no letter or position references, the plugin's body parser, and the earlier checkpointed Readings the slot assesses.
 * @param lesson - The finished Lesson
 * @param slots - Every Blueprint slot, in Blueprint order
 * @param checkpointedSlotIds - Slots of this Course Request that already have a finalized checkpoint
 * @param rules - What differs by method
 * @returns Learner-invisible failure messages; empty when the Lesson passes
 */
function assessmentCodeFailures(
  lesson: QuizLessonDraft | GoalCheckLessonDraft,
  slots: readonly BlueprintSlot[],
  checkpointedSlotIds: ReadonlySet<string>,
  rules: AssessmentRules,
): string[] {
  const { name } = rules;
  const failures: string[] = [];
  if (lesson.teachingMethod !== rules.method) failures.push(`The Lesson must use the ${rules.method} method.`);
  if (!lesson.title.trim() || !lesson.lessonGoal.trim()) failures.push("The Lesson needs a title and a Lesson goal.");
  if (lesson.objectives.length === 0 || lesson.objectives.some((objective) => !objective.trim())) {
    failures.push("The Lesson needs non-empty objectives.");
  }
  if (lesson.lineage !== null) failures.push(`A ${name} is always generated, never reused.`);
  if (lesson.sources.length || lesson.citations.length) failures.push(`A ${name} carries no Sources or Citations of its own.`);

  const body = lesson.body as unknown as Record<string, unknown>;
  if (Object.keys(body).some((key) => !QUIZ_BODY_KEYS.has(key))) failures.push(`A ${name} has no reading sections or Demonstrative media.`);
  const items = Array.isArray(body.items) ? lesson.body.items : [];
  if (items.length < rules.minItems || items.length > rules.maxItems) {
    failures.push(`A ${name} has ${rules.minItems}–${rules.maxItems} items, not ${items.length}.`);
  }
  const itemContents = rules.itemKeys.has("objective")
    ? "a question, options, key, explanations, and its goal objective"
    : "a question, options, key, and explanations";
  for (const [index, item] of items.entries()) {
    const label = `Item ${index + 1}`;
    if (Object.keys(item).some((key) => !rules.itemKeys.has(key))) failures.push(`${label} carries something other than ${itemContents}.`);
    if (!item.prompt?.trim()) failures.push(`${label} has no question.`);
    const options = Array.isArray(item.options) ? item.options : [];
    if (options.length !== QUIZ_OPTION_COUNT) failures.push(`${label} needs exactly ${QUIZ_OPTION_COUNT} options.`);
    const texts = options.map((option) => option.text?.trim().toLowerCase() ?? "");
    if (texts.some((text) => !text) || new Set(texts).size !== texts.length) failures.push(`${label} needs ${QUIZ_OPTION_COUNT} different, non-empty options.`);
    if (texts.some((text) => PLACEHOLDER_OPTION.test(text))) failures.push(`${label} has a placeholder instead of an option.`);
    if (options.filter((option) => option.id === item.correctOptionId).length !== 1) failures.push(`${label} needs exactly one correct option.`);
    // Feedback per option (decision 2026-11-03): every option says in one sentence why it is right or wrong.
    if (options.some((option) => !option.why?.trim())) failures.push(`${label} needs a one-sentence "why" on every option.`);
    const feedback = [...Object.values(item.explanations ?? {}), ...options.map((option) => option.why ?? "")];
    if (feedback.some((text) => OPTION_REFERENCE.some((pattern) => pattern.test(text)))) {
      failures.push(`${label}'s explanation or an option's why names an option by letter or position; options are shuffled, so name it by its content.`);
    }
  }
  const prompts = items.map((item) => item.prompt?.trim().toLowerCase());
  if (new Set(prompts).size !== prompts.length) failures.push("Two items ask the same question.");
  if (failures.length === 0 && !rules.parses(lesson.body)) failures.push(`The ${name} body does not pass the ${name} plugin's validation.`);

  const position = slots.findIndex((slot) => slot.id === lesson.slotId);
  const slot = slots[position];
  if (!slot || slot.method !== rules.method) failures.push(`The ${name} has no ${name} slot in the Blueprint.`);
  else if (slot.assessesSlotIds.length === 0) failures.push(`The ${name} slot assesses no Lessons.`);
  for (const assessedId of slot?.assessesSlotIds ?? []) {
    const index = slots.findIndex((candidate) => candidate.id === assessedId);
    const assessed = slots[index];
    if (!assessed) failures.push(`Assessed slot ${assessedId} is not in the Blueprint.`);
    else if (assessed.method !== READING_METHOD_ID) failures.push(`Assessed slot ${assessedId} is not a Reading.`);
    else if (index > position) failures.push(`Assessed slot ${assessedId} does not precede the ${name}.`);
    else if (!checkpointedSlotIds.has(assessedId)) failures.push(`Assessed slot ${assessedId} has no checkpointed Lesson.`);
  }
  return failures;
}

/**
 * Code checks for a Quiz Lesson before checkpoint (spec §6.4): envelope, Quiz shape, and the Reading slots it assesses.
 * @param lesson - The finished Quiz
 * @param slots - Every Blueprint slot, in Blueprint order
 * @param checkpointedSlotIds - Slots of this Course Request that already have a finalized checkpoint
 * @returns Learner-invisible failure messages; empty when the Quiz passes
 */
export function quizCodeFailures(lesson: QuizLessonDraft, slots: readonly BlueprintSlot[], checkpointedSlotIds: ReadonlySet<string>): string[] {
  return assessmentCodeFailures(lesson, slots, checkpointedSlotIds, QUIZ_RULES);
}

/**
 * Code checks for a Goal Check Lesson before checkpoint (SEN-81): the Quiz's item checks with
 * {@link GOAL_CHECK_MIN_ITEMS}–{@link GOAL_CHECK_MAX_ITEMS} items, on the Blueprint's Goal Check slot, every assessed
 * Reading checkpointed, every item naming one of the slot's goal objectives, and every goal objective checked by at
 * least one item.
 * @param lesson - The finished Goal Check
 * @param slots - Every Blueprint slot, in Blueprint order
 * @param checkpointedSlotIds - Slots of this Course Request that already have a finalized checkpoint
 * @returns Learner-invisible failure messages; empty when the Goal Check passes
 */
export function goalCheckCodeFailures(lesson: GoalCheckLessonDraft, slots: readonly BlueprintSlot[], checkpointedSlotIds: ReadonlySet<string>): string[] {
  const failures = assessmentCodeFailures(lesson, slots, checkpointedSlotIds, GOAL_CHECK_RULES);
  const slot = slots.find((candidate) => candidate.id === lesson.slotId);
  if (!slot || slot.method !== GOAL_CHECK_METHOD_ID) return failures;
  const objectives = new Set(slot.objectives);
  const items = Array.isArray(lesson.body.items) ? lesson.body.items : [];
  for (const [index, item] of items.entries()) {
    const objective = typeof item.objective === "string" ? item.objective.trim() : "";
    if (!objective) failures.push(`Item ${index + 1} names no goal objective.`);
    else if (!objectives.has(objective)) failures.push(`Item ${index + 1} names “${objective}”, which is not one of the Goal Check's goal objectives.`);
  }
  const checked = new Set(items.map((item) => (typeof item.objective === "string" ? item.objective.trim() : "")));
  for (const objective of slot.objectives) {
    if (!checked.has(objective)) failures.push(`No item checks the goal objective “${objective}”.`);
  }
  return failures;
}
