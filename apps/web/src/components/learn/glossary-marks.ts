import type { GlossaryEntry } from "@senoy/db/reading-lesson";

/**
 * A run of Reading prose: plain text, or one glossary term as the prose spells it, with the entry it stands for.
 */
export type TermSegment = { text: string; entry?: GlossaryEntry };

/**
 * Finds glossary terms in prose. Built once per Lesson from its glossary.
 */
export type GlossaryMatcher = {
  /**
   * Splits `text` into plain runs and marked terms. A term is marked only the first time it shows in a section:
   * `seen` holds the terms already marked there, and gains each one this call marks.
   * @param text - Prose with no citation markers in it
   * @param seen - Keys of terms already marked in this section (see {@link termKey}); updated in place
   */
  mark: (text: string, seen: Set<string>) => TermSegment[];
};

/**
 * The key one glossary term goes by: trimmed, lower case, inner spaces collapsed. "Cell  Wall" and "cell wall" share one.
 * @param term - A term as the glossary or the prose spells it
 */
export function termKey(term: string): string {
  return term.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Builds a matcher for a Lesson's glossary, or null when it has no terms. Matching is whole word or phrase and ignores
 * case, the same rule as `mentionsTerm` in `@senoy/db/reading-lesson`; a space in a term matches any run of spaces.
 * Where terms overlap ("cell" and "cell wall") the longer one wins, even when it was already marked earlier in the
 * section, so a later "cell wall" never marks its "cell".
 * @param glossary - The Lesson's glossary
 */
export function createGlossaryMatcher(glossary: GlossaryEntry[] | undefined): GlossaryMatcher | null {
  const byKey = new Map<string, GlossaryEntry>();
  for (const entry of glossary ?? []) {
    const key = termKey(entry.term);
    if (key && !byKey.has(key)) byKey.set(key, entry);
  }
  if (byKey.size === 0) return null;
  const alternatives = [...byKey.keys()]
    .sort((a, b) => b.length - a.length)
    .map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}])`, "giu");

  return {
    mark(text, seen) {
      const segments: TermSegment[] = [];
      let plain = "";
      let last = 0;
      for (const match of text.matchAll(pattern)) {
        const key = termKey(match[0]);
        const entry = byKey.get(key);
        if (!entry || seen.has(key)) continue;
        seen.add(key);
        plain += text.slice(last, match.index);
        if (plain) segments.push({ text: plain });
        plain = "";
        segments.push({ text: match[0], entry });
        last = match.index + match[0].length;
      }
      plain += text.slice(last);
      if (plain || segments.length === 0) segments.push({ text: plain });
      return segments;
    },
  };
}

/** A `[n]` citation marker, alone. */
const CITE_PART = /^\[(\d+)\]$/;

/**
 * Splits prose at its `[n]` citation markers, dropping the space before each marker. Odd entries are the markers;
 * an empty entry between two markers is where a separator goes.
 * @param text - A prose block's text
 */
export function proseParts(text: string): string[] {
  return text.replace(/\s+(?=\[\d+\])/g, "").split(/(\[\d+\])/g);
}

/**
 * The citation number a prose part stands for, or null when it is text.
 * @param part - One entry of {@link proseParts}
 */
export function citationNumber(part: string): number | null {
  const match = CITE_PART.exec(part);
  return match ? Number(match[1]) : null;
}

/**
 * Marks glossary terms in each text part of a prose block, leaving citation markers alone. Returns one entry per
 * {@link proseParts} entry: the segments for a text part, null for a citation marker.
 * @param text - A prose block's text
 * @param matcher - The Lesson's glossary matcher
 * @param seen - Terms already marked in this section; updated in place
 */
export function markProse(text: string, matcher: GlossaryMatcher, seen: Set<string>): (TermSegment[] | null)[] {
  return proseParts(text).map((part) => (citationNumber(part) == null ? matcher.mark(part, seen) : null));
}
