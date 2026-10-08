import { sql } from "drizzle-orm";
import { createDb, learners, SEEDED_QUIZ_BODY, TEACHING_PROFILE_VERSION } from "@senoy/db";
import { seedLearner, seedPublishedCourse } from "@senoy/db/seed-fixture";
import { parseTeachingProfileAnswers } from "@senoy/db/teaching-profile";
import type { Page } from "@playwright/test";

const db = createDb(process.env.DATABASE_URL!, { max: 1 });

/**
 * Wipes the throwaway database and seeds a fresh fixture Course plus a saved Teaching Profile.
 * @param answers - Teaching Profile answers; unset items are skipped
 */
export async function resetFixture(answers: Record<string, unknown> = {}) {
  await db.execute(
    sql`truncate starting_level_diagnostics, quiz_attempts, lesson_completions, published_lessons, published_modules, published_courses, course_requests, learners cascade`,
  );
  const learner = await seedLearner(db);
  await seedPublishedCourse(db);
  await db
    .update(learners)
    .set({
      teachingProfileVersion: TEACHING_PROFILE_VERSION,
      teachingProfileAnswers: parseTeachingProfileAnswers(answers),
      teachingProfileAssessedAt: new Date(),
      teachingProfileUpdatedAt: new Date(),
    })
    .where(sql`${learners.id} = ${learner.id}`);
}

/**
 * The fieldset of the n-th Quiz item (0-based).
 * @param page - Playwright page
 * @param index - Item index
 */
export function quizItem(page: Page, index: number) {
  const item = SEEDED_QUIZ_BODY.items[index]!;
  return page.getByRole("group", { name: `${index + 1}. ${item.prompt}` });
}

/**
 * Picks an option on the n-th item: its correct option, or the first wrong one.
 * @param page - Playwright page
 * @param index - Item index
 * @param correct - Pick the right answer
 */
export async function pickOption(page: Page, index: number, correct: boolean) {
  const item = SEEDED_QUIZ_BODY.items[index]!;
  const option = correct
    ? item.options.find((row) => row.id === item.correctOptionId)!
    : item.options.find((row) => row.id !== item.correctOptionId)!;
  await quizItem(page, index).getByRole("radio", { name: option.text }).check();
  return option;
}

/**
 * Answers every item, the first `correct` of them right; with `check`, presses Check after each.
 * @param page - Playwright page
 * @param correct - How many to get right
 * @param check - Per-item timing
 */
export async function answerAll(page: Page, correct: number, check: boolean) {
  for (let index = 0; index < SEEDED_QUIZ_BODY.items.length; index += 1) {
    await pickOption(page, index, index < correct);
    if (check) {
      const item = quizItem(page, index);
      await item.getByRole("button", { name: "Check" }).click();
      await item.getByText(index < correct ? "✓ Correct" : "✗ Not quite").waitFor();
    }
  }
}
