import type { BlueprintSlot } from "./blueprint.ts";
import type { LessonLineage } from "./lesson-reuse.ts";
import { parseQuizBody, QUIZ_MAX_ITEMS, QUIZ_MIN_ITEMS, QUIZ_OPTION_COUNT, type QuizBody } from "./quiz.ts";
import {
  mediaBlockFailures, proseBlocks, QUIZ_METHOD_ID, READING_METHOD_ID, type MediaBlock, type NumberedSource, type ReadingBody,
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

/** Media blocks one Reading may carry: a single optional figure until required media lands (SEN-115). */
export const MAX_MEDIA_BLOCKS = 1;

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
  if (media.length > MAX_MEDIA_BLOCKS) failures.push(`A Reading carries at most ${MAX_MEDIA_BLOCKS} media block.`);
  for (const block of media) failures.push(...mediaBlockFailures(block));
  if (prose.some((text) => !text.trim())) failures.push("Every content block needs text.");
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

/** Keys a Quiz body and a Quiz item may carry; anything else (reading sections, media) is not a Quiz. */
const QUIZ_BODY_KEYS = new Set(["items"]);
const QUIZ_ITEM_KEYS = new Set(["id", "prompt", "options", "correctOptionId", "explanations"]);

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

/**
 * Code checks for a Quiz Lesson before checkpoint (spec §6.4): envelope, Quiz shape, and the Reading slots it assesses.
 * @param lesson - The finished Quiz
 * @param slots - Every Blueprint slot, in Blueprint order
 * @param checkpointedSlotIds - Slots of this Course Request that already have a finalized checkpoint
 * @returns Learner-invisible failure messages; empty when the Quiz passes
 */
export function quizCodeFailures(lesson: QuizLessonDraft, slots: readonly BlueprintSlot[], checkpointedSlotIds: ReadonlySet<string>): string[] {
  const failures: string[] = [];
  if (lesson.teachingMethod !== QUIZ_METHOD_ID) failures.push("The Lesson must use the quiz method.");
  if (!lesson.title.trim() || !lesson.lessonGoal.trim()) failures.push("The Lesson needs a title and a Lesson goal.");
  if (lesson.objectives.length === 0 || lesson.objectives.some((objective) => !objective.trim())) {
    failures.push("The Lesson needs non-empty objectives.");
  }
  if (lesson.lineage !== null) failures.push("A Quiz is always generated, never reused.");
  if (lesson.sources.length || lesson.citations.length) failures.push("A Quiz carries no Sources or Citations of its own.");

  const body = lesson.body as unknown as Record<string, unknown>;
  if (Object.keys(body).some((key) => !QUIZ_BODY_KEYS.has(key))) failures.push("A Quiz has no reading sections or Demonstrative media.");
  const items = Array.isArray(body.items) ? lesson.body.items : [];
  if (items.length < QUIZ_MIN_ITEMS || items.length > QUIZ_MAX_ITEMS) {
    failures.push(`A Quiz has ${QUIZ_MIN_ITEMS}–${QUIZ_MAX_ITEMS} items, not ${items.length}.`);
  }
  for (const [index, item] of items.entries()) {
    const label = `Item ${index + 1}`;
    if (Object.keys(item).some((key) => !QUIZ_ITEM_KEYS.has(key))) failures.push(`${label} carries something other than a question, options, key, and explanations.`);
    if (!item.prompt?.trim()) failures.push(`${label} has no question.`);
    const options = Array.isArray(item.options) ? item.options : [];
    if (options.length !== QUIZ_OPTION_COUNT) failures.push(`${label} needs exactly ${QUIZ_OPTION_COUNT} options.`);
    const texts = options.map((option) => option.text?.trim().toLowerCase() ?? "");
    if (texts.some((text) => !text) || new Set(texts).size !== texts.length) failures.push(`${label} needs ${QUIZ_OPTION_COUNT} different, non-empty options.`);
    if (texts.some((text) => PLACEHOLDER_OPTION.test(text))) failures.push(`${label} has a placeholder instead of an option.`);
    if (options.filter((option) => option.id === item.correctOptionId).length !== 1) failures.push(`${label} needs exactly one correct option.`);
    if (Object.values(item.explanations ?? {}).some((text) => OPTION_REFERENCE.some((pattern) => pattern.test(text)))) {
      failures.push(`${label}'s explanation names an option by letter or position; options are shuffled, so name it by its content.`);
    }
  }
  const prompts = items.map((item) => item.prompt?.trim().toLowerCase());
  if (new Set(prompts).size !== prompts.length) failures.push("Two items ask the same question.");
  if (failures.length === 0 && !parseQuizBody(lesson.body)) failures.push("The Quiz body does not pass the Quiz plugin's validation.");

  const position = slots.findIndex((slot) => slot.id === lesson.slotId);
  const slot = slots[position];
  if (!slot || slot.method !== QUIZ_METHOD_ID) failures.push("The Quiz has no Quiz slot in the Blueprint.");
  else if (slot.assessesSlotIds.length === 0) failures.push("The Quiz slot assesses no Lessons.");
  for (const assessedId of slot?.assessesSlotIds ?? []) {
    const index = slots.findIndex((candidate) => candidate.id === assessedId);
    const assessed = slots[index];
    if (!assessed) failures.push(`Assessed slot ${assessedId} is not in the Blueprint.`);
    else if (assessed.method !== READING_METHOD_ID) failures.push(`Assessed slot ${assessedId} is not a Reading.`);
    else if (index > position) failures.push(`Assessed slot ${assessedId} does not precede the Quiz.`);
    else if (!checkpointedSlotIds.has(assessedId)) failures.push(`Assessed slot ${assessedId} has no checkpointed Lesson.`);
  }
  return failures;
}
