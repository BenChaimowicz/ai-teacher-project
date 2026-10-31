import type { BlueprintSlot } from "./blueprint.ts";
import type { LessonSource } from "./lesson-checkpoint.ts";
import type { ReadingBody } from "./reading-lesson.ts";
import type { ContentScope } from "./teaching-profile.ts";

/** How a reused Lesson was copied into its new Course (spec §5.8). */
export type ReuseMode = "verbatim" | "adapted";

/**
 * Lesson lineage (spec §5.8): the published Lesson a copy came from, and whether it was copied verbatim or adapted to its
 * new slot. Null on a Lesson written for its own Course; a Quiz's is always null.
 */
export type LessonLineage = { originLessonId: string; mode: ReuseMode };

/** The four write-time Teaching Profile values a Reading is written for (spec §5.5), as its checkpoint records them. */
export type ReadingProfile = {
  instructionLanguage: string;
  requiredReadingSupports: string[];
  contentScope: ContentScope;
  explanationOrder: string;
};

/**
 * A published Reading another Course could reuse, with what its own Course's checkpoint recorded about how it was
 * written. Only a Reading whose checkpoint and retrieval set are still stored is a candidate, because a reused Lesson is
 * checked against the Sources it was written from.
 */
export type ReuseCandidate = {
  /** The published Lesson's id, which lineage names. */
  lessonId: string;
  title: string;
  lessonGoal: string;
  /** The objectives it was written and judged against, after grounding (ADR 0022). */
  objectives: string[];
  topicTags: string[];
  lineage: LessonLineage | null;
  body: ReadingBody;
  sources: LessonSource[];
  /** The Course Request and slot whose `lesson_research` row is its retrieval set. */
  origin: { courseRequestId: string; slotId: string };
  /** Every model that wrote a draft of it; empty before SEN-57, when the primary Generator wrote every Lesson. */
  authorModelIds: string[];
  /** Sources vetting kept out of its evidence. */
  rejectedSources: { sourceId: string; url: string; reason: string }[];
  /** The write-time Teaching Profile values it was written for; null before SEN-46. */
  writtenFor: Record<string, unknown> | null;
};

/** Content scopes from shortest to longest. */
const CONTENT_SCOPES: readonly ContentScope[] = ["compact", "standard", "extended"];

/**
 * Reads the write-time values a Reading was written for.
 * @param raw - A checkpoint's `writeTimeProfile`, or a run's write-time profile
 * @returns The four values, or null when they were never recorded or are incomplete
 */
export function readingProfile(raw: unknown): ReadingProfile | null {
  const row = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
  if (!row) return null;
  const { instructionLanguage, requiredReadingSupports, contentScope, explanationOrder } = row;
  if (typeof instructionLanguage !== "string" || typeof explanationOrder !== "string" ||
      !Array.isArray(requiredReadingSupports) || requiredReadingSupports.some((support) => typeof support !== "string") ||
      !CONTENT_SCOPES.includes(contentScope as ContentScope)) return null;
  return { instructionLanguage, requiredReadingSupports, contentScope: contentScope as ContentScope, explanationOrder };
}

/** A Topic tag as retrieval compares it. */
function tagKey(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * Whether a candidate is retrieved for a Reading slot (spec §5.8). The lookup already matched subject and teaching
 * method; this adds at least one overlapping Topic tag, the same instruction language (a Lesson can't be adapted into
 * another language), and a contentScope no shorter than this Learner's, because an adapt pass may trim a Lesson but
 * never grow it. A verbatim copy is left out, since its origin is in the pool with the same body. Tags retrieve; they do
 * not judge fit.
 * @param slot - The Blueprint slot looking for a Lesson
 * @param candidate - A published Reading on the same subject
 * @param profile - The write-time values this Learner's Lessons are written for
 */
export function retrievable(slot: Pick<BlueprintSlot, "topicTags">, candidate: ReuseCandidate, profile: ReadingProfile): boolean {
  if (candidate.lineage?.mode === "verbatim") return false;
  const tags = new Set(slot.topicTags.map(tagKey));
  if (!candidate.topicTags.some((tag) => tags.has(tagKey(tag)))) return false;
  const writtenFor = readingProfile(candidate.writtenFor);
  // Every profile resolved to English before checkpoints recorded one, so an unrecorded Lesson is English.
  if ((writtenFor?.instructionLanguage ?? "en") !== profile.instructionLanguage) return false;
  if (writtenFor && CONTENT_SCOPES.indexOf(writtenFor.contentScope) < CONTENT_SCOPES.indexOf(profile.contentScope)) return false;
  return true;
}

/**
 * Whether a candidate may be reused verbatim: it was written for exactly this Learner's four write-time values. Any
 * difference, or values never recorded, makes it adapt at most.
 * @param candidate - A retrieved candidate
 * @param profile - The write-time values this Learner's Lessons are written for
 */
export function verbatimAllowed(candidate: Pick<ReuseCandidate, "writtenFor">, profile: ReadingProfile): boolean {
  const writtenFor = readingProfile(candidate.writtenFor);
  if (!writtenFor) return false;
  const supports = (values: string[]) => [...new Set(values)].sort().join(",");
  return writtenFor.instructionLanguage === profile.instructionLanguage &&
    supports(writtenFor.requiredReadingSupports) === supports(profile.requiredReadingSupports) &&
    writtenFor.contentScope === profile.contentScope &&
    writtenFor.explanationOrder === profile.explanationOrder;
}
