import { proseBlocks, type NumberedSource, type ReadingBody } from "@senoy/db/reading-lesson";

/** An inline Citation marker, `[n]`, as a Reading's prose writes it. */
const MARKER = /\[(\d+)\]/g;

/**
 * How often each Source is cited in a Reading's prose: `[n]` markers per n, counted over every prose block (a figure's
 * caption and credit are not prose and carry no Citations).
 * @param body - The Reading's body
 */
function citationCounts(body: Pick<ReadingBody, "sections">): Map<number, number> {
  const counts = new Map<number, number>();
  for (const section of body.sections) {
    for (const block of proseBlocks(section)) {
      for (const match of block.text.matchAll(MARKER)) {
        const n = Number(match[1]);
        counts.set(n, (counts.get(n) ?? 0) + 1);
      }
    }
  }
  return counts;
}

/**
 * The Source a Reading leans on most: the one its prose cites most often. Ties go to the lowest n, so the pick is
 * stable across renders. Null when the Lesson lists no Sources, or when its prose cites none of them (a marker whose n
 * has no Source in the list does not count).
 * @param body - The Reading's body
 * @param citations - The Lesson's numbered source list
 */
export function mostCitedSource(body: Pick<ReadingBody, "sections">, citations: NumberedSource[]): NumberedSource | null {
  const counts = citationCounts(body);
  let best: NumberedSource | null = null;
  let bestCount = 0;
  for (const source of [...citations].sort((a, b) => a.n - b.n)) {
    const count = counts.get(source.n) ?? 0;
    if (count > bestCount) {
      best = source;
      bestCount = count;
    }
  }
  return best;
}
