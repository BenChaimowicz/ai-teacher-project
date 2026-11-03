import { ATTACHABLE_MIME_TYPES, mediaDescriptorFailures, parseMediaDescriptorFields, type MediaDescriptorFields } from "./media.ts";

/** Teaching-method id for reading Lessons. */
export const READING_METHOD_ID = "reading" as const;

/** Teaching-method id for Quiz Lessons. */
export const QUIZ_METHOD_ID = "quiz" as const;

/** One numbered Source in a Lesson's source list. */
export type NumberedSource = {
  n: number;
  title: string;
  url: string;
};

/** A prose chunk inside a reading section. */
export type ProseBlock = {
  kind: "prose";
  text: string;
};

/**
 * One piece of Demonstrative media inside a reading section (spec §5.6). `caption` and `alt` are what the Reading's
 * writer said the file shows, checked against the file by the vision Judge. `descriptor` is a copy of the library Media
 * descriptor as it was when the Lesson attached it, so a later catalog edit cannot change a shipped Lesson. Study serves
 * the file from `descriptor.storageKey` through `/media/…`; no URL is stored.
 */
export type MediaBlock = {
  kind: "media";
  caption: string;
  alt: string;
  descriptor: MediaDescriptorFields;
};

/** A chunk inside a reading section. */
export type ReadingContentBlock = ProseBlock | MediaBlock;

/** A headed stretch of a reading Lesson. */
export type ReadingSection = {
  heading: string;
  blocks: ReadingContentBlock[];
};

/**
 * One word of a Reading the Learner may not know, with a plain-words definition Study shows on hover, tap, and on the
 * Course's Words page (SEN-48). `term` appears in the Lesson's prose as written. The definition says what the thing is,
 * in the word's ordinary meaning, carries no Citation, and contradicts nothing the Lesson or its excerpts state, which
 * the glossary Judge checked. The Course keeps one meaning per word (decision 2026-11-03): a word an earlier Lesson
 * defined keeps that definition here.
 */
export type GlossaryEntry = {
  term: string;
  definition: string;
};

/** The most words one Reading's glossary holds. */
export const MAX_GLOSSARY_TERMS = 12;

/**
 * A Reading is about one screen (decision 2026-11-03): about this many words of prose, Citation markers aside. A little
 * scrolling is fine, since Lessons carry images; a wall of text is not. An idea that needs more gets another Lesson from
 * the Blueprint, not a longer one.
 */
export const READING_WORD_TARGET = { low: 150, high: 250 } as const;

/** The most words of prose one Reading holds; the Code check fails a longer one, and the repair cuts toward it. */
export const MAX_READING_WORDS = 320;

/** The most sections one Reading holds; Study shows each as a paper note. */
export const MAX_READING_SECTIONS = 4;

/** Method-private body of a reading Lesson. `glossary` is absent on a Lesson written before SEN-48 or with no hard words. */
export type ReadingBody = {
  sections: ReadingSection[];
  glossary?: GlossaryEntry[];
};

/**
 * Words of prose in a Reading, Citation markers (`[n]` or `[src_…]`) aside, as the one-screen cap counts them.
 * @param body - The Reading's body, or a draft's sections
 */
export function readingWordCount(body: Pick<ReadingBody, "sections">): number {
  // A token with no letter or digit, like the "." left after a sentence-final marker, is not a word.
  return body.sections.flatMap(proseBlocks)
    .reduce((count, block) => count + block.text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length, 0);
}

/**
 * Whether `term` appears in `text` as a whole word or phrase, ignoring case.
 * @param text - Prose to look in
 * @param term - The glossary term
 */
export function mentionsTerm(text: string, term: string): boolean {
  const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.length > 0 && new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(text);
}

/**
 * Reads a glossary: entries with a term and definition, each term once ignoring case, at most
 * {@link MAX_GLOSSARY_TERMS}. Invalid rows are dropped; anything that is not a list becomes [].
 * @param raw - The body's `glossary` field
 */
export function parseGlossary(raw: unknown): GlossaryEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const entries: GlossaryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as { term?: unknown; definition?: unknown };
    if (!isNonEmptyString(row.term) || !isNonEmptyString(row.definition)) continue;
    const term = row.term.trim();
    if (seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    entries.push({ term, definition: row.definition.trim() });
  }
  return entries.slice(0, MAX_GLOSSARY_TERMS);
}

/**
 * True when `value` is a non-empty string.
 * @param value - Unknown JSON field
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Reads one numbered Source. Invalid rows are dropped.
 * @param raw - One JSON row
 */
function parseNumberedSource(raw: unknown): NumberedSource | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { n?: unknown; title?: unknown; url?: unknown };
  if (typeof row.n !== "number" || !Number.isInteger(row.n) || row.n < 1) return null;
  if (!isNonEmptyString(row.title) || !isNonEmptyString(row.url)) return null;
  return { n: row.n, title: row.title.trim(), url: row.url.trim() };
}

/**
 * Reads the Lesson's numbered source list. Missing or invalid JSON becomes [].
 * @param raw - `published_lessons.citations` or `.sources`
 */
export function parseNumberedSources(raw: unknown): NumberedSource[] {
  if (!Array.isArray(raw)) return [];
  const rows: NumberedSource[] = [];
  for (const item of raw) {
    const parsed = parseNumberedSource(item);
    if (parsed) rows.push(parsed);
  }
  return rows.sort((a, b) => a.n - b.n);
}

/**
 * Why a media block may not be shown: an empty caption or alt, a descriptor that breaks the catalog's rules (an
 * unhostable licence, missing attribution, a malformed storage key), or a file type the Reading cannot attach yet.
 * @param block - The media block
 * @returns Every problem, in plain language; empty when the block may be shown
 */
export function mediaBlockFailures(block: MediaBlock): string[] {
  const failures: string[] = [];
  if (!block.caption.trim()) failures.push("A media block needs a caption.");
  if (!block.alt.trim()) failures.push("A media block needs alt text.");
  failures.push(...mediaDescriptorFailures(block.descriptor));
  if (block.descriptor.kind !== "image" || !(ATTACHABLE_MIME_TYPES as readonly string[]).includes(block.descriptor.mimeType)) {
    failures.push(`Media of type ${block.descriptor.mimeType} cannot be attached to a Reading yet.`);
  }
  return failures;
}

/**
 * Reads one content block: prose with text, or media whose block passes {@link mediaBlockFailures}. Invalid rows are
 * dropped, so a Learner never sees a figure the checks would have rejected.
 * @param raw - One JSON row
 */
function parseBlock(raw: unknown): ReadingContentBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { kind?: unknown; text?: unknown; caption?: unknown; alt?: unknown; descriptor?: unknown };
  if (row.kind === "prose") return isNonEmptyString(row.text) ? { kind: "prose", text: row.text } : null;
  if (row.kind !== "media" || typeof row.caption !== "string" || typeof row.alt !== "string") return null;
  const descriptor = parseMediaDescriptorFields(row.descriptor);
  if (!descriptor) return null;
  const block: MediaBlock = { kind: "media", caption: row.caption.trim(), alt: row.alt.trim(), descriptor };
  return mediaBlockFailures(block).length ? null : block;
}

/**
 * The prose blocks of a section, which carry the Reading's text and Citations; media blocks carry neither.
 * @param section - A reading section
 */
export function proseBlocks(section: ReadingSection): ProseBlock[] {
  return section.blocks.filter((block): block is ProseBlock => block.kind === "prose");
}

/**
 * Every media block of a body, in reading order.
 * @param body - A reading body
 */
export function mediaBlocksOf(body: ReadingBody): MediaBlock[] {
  return body.sections.flatMap((section) => section.blocks).filter((block): block is MediaBlock => block.kind === "media");
}

/**
 * Reads one reading section. Invalid sections are dropped.
 * @param raw - One JSON row
 */
function parseSection(raw: unknown): ReadingSection | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { heading?: unknown; blocks?: unknown };
  if (!isNonEmptyString(row.heading) || !Array.isArray(row.blocks)) return null;
  const blocks = row.blocks
    .map((block) => parseBlock(block))
    .filter((block): block is ReadingContentBlock => block != null);
  if (blocks.length === 0) return null;
  return { heading: row.heading.trim(), blocks };
}

/**
 * Reads a reading Lesson body. Invalid or empty JSON is null.
 * @param raw - `published_lessons.body`
 */
export function parseReadingBody(raw: unknown): ReadingBody | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as { sections?: unknown; glossary?: unknown };
    if (!Array.isArray(row.sections)) return null;
    const sections = row.sections
      .map((section) => parseSection(section))
      .filter((section): section is ReadingSection => section != null);
    if (sections.length === 0) return null;
    const glossary = parseGlossary(row.glossary);
    return glossary.length ? { sections, glossary } : { sections };
  } catch {
    return null;
  }
}
