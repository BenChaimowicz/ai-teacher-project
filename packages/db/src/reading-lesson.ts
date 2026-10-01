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

/** A prose chunk inside a reading section. Media is not used on this fixture. */
export type ProseBlock = {
  kind: "prose";
  text: string;
};

/** A chunk inside a reading section. */
export type ReadingContentBlock = ProseBlock;

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
 * Reads one prose content block. Invalid rows are dropped.
 * @param raw - One JSON row
 */
function parseBlock(raw: unknown): ReadingContentBlock | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as { kind?: unknown; text?: unknown };
  if (row.kind !== "prose" || !isNonEmptyString(row.text)) return null;
  return { kind: "prose", text: row.text };
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
