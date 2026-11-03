// Relative imports on purpose: the node:test run (`tsx --test` from packages/db) has no `@/` alias.
import { parseReadingBody, READING_METHOD_ID } from "@senoy/db/reading-lesson";
import { termKey } from "./glossary-marks.ts";
import type { StudyPayload } from "../../lib/study-types.ts";

/** One word a Reading stopped to explain, with its one meaning in the Course. */
export type CourseWord = { term: string; definition: string };

/** The Lesson that introduced a word: its id, title, and 1-based number in Course order (Quizzes count). */
export type WordLesson = { id: string; title: string; number: number };

/** The words one Lesson introduced, in the order its glossary lists them. */
export type CourseWordGroup = { lesson: WordLesson; words: CourseWord[] };

/** Every open word of a Course, grouped by the Lesson that introduced it. */
export type CourseWords = {
  /** In Course order; only Lessons that introduced at least one open word. */
  groups: CourseWordGroup[];
  /** How many words `groups` hold. */
  count: number;
  /** Words so far defined only by a locked Lesson; the Words page does not list them yet. */
  hidden: number;
};

/**
 * Gathers a Course's words from its Readings' glossaries, in Course order. A term (ignoring case and spacing) keeps
 * the first definition and the first Lesson that gave it; a later Lesson's copy is not listed again. A word a locked
 * Lesson introduced is counted in `hidden`, not listed, so the page never shows a Lesson the Learner cannot open yet.
 * @param payload - The Study payload, which carries every Lesson's body
 */
export function collectCourseWords(payload: StudyPayload): CourseWords {
  const seen = new Set<string>();
  const groups: CourseWordGroup[] = [];
  let count = 0;
  let hidden = 0;
  let number = 0;
  for (const module of payload.modules) {
    for (const lesson of module.lessons) {
      number += 1;
      if (lesson.teachingMethod !== READING_METHOD_ID) continue;
      const words: CourseWord[] = [];
      for (const entry of parseReadingBody(lesson.body)?.glossary ?? []) {
        const key = termKey(entry.term);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        if (lesson.locked) {
          hidden += 1;
          continue;
        }
        words.push({ term: entry.term, definition: entry.definition });
      }
      if (words.length === 0) continue;
      groups.push({ lesson: { id: lesson.id, title: lesson.title, number }, words });
      count += words.length;
    }
  }
  return { groups, count, hidden };
}

/**
 * The groups whose words match a search, by term or definition text, ignoring case; every group when the search is
 * blank. Groups left with no words are dropped.
 * @param words - The Course's words
 * @param query - What the Learner typed
 */
export function filterCourseWords(words: CourseWords, query: string): CourseWordGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return words.groups;
  return words.groups
    .map((group) => ({ ...group, words: group.words.filter((word) => word.term.toLowerCase().includes(q) || word.definition.toLowerCase().includes(q)) }))
    .filter((group) => group.words.length > 0);
}
