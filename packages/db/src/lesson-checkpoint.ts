import { READING_METHOD_ID, type NumberedSource, type ReadingBody } from "./reading-lesson.ts";

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
 * `lineage` is null for a freshly generated Lesson; reuse fills it later.
 */
export type ReadingLessonDraft = {
  slotId: string;
  teachingMethod: typeof READING_METHOD_ID;
  title: string;
  lessonGoal: string;
  objectives: string[];
  topicTags: string[];
  lineage: null;
  sources: LessonSource[];
  citations: NumberedSource[];
  body: ReadingBody;
};

/** An inline numbered Citation marker in reading prose, as Study renders it. */
const CITATION_MARKER = /\[(\d+)\]/g;

/** A Source ID marker the Generator wrote that was not resolved to a number. */
const SOURCE_ID_MARKER = /\[[^\]]*\bsrc_[^\]]*\]/;

/**
 * Code checks for a reading Lesson before checkpoint (spec §6.3): envelope, reading-method shape, and Citations
 * that resolve to this Lesson's retrieval set. No Demonstrative media is generated yet, so there is no media check.
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
  const prose = sections.flatMap((section) => section.blocks).map((block) => block.text);
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
