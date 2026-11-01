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

/** Method-private body of a reading Lesson. */
export type ReadingBody = {
  sections: ReadingSection[];
};

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
    const row = raw as { sections?: unknown };
    if (!Array.isArray(row.sections)) return null;
    const sections = row.sections
      .map((section) => parseSection(section))
      .filter((section): section is ReadingSection => section != null);
    if (sections.length === 0) return null;
    return { sections };
  } catch {
    return null;
  }
}
