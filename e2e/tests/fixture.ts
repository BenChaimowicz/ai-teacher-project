import { sql } from "drizzle-orm";
import {
  courseRequests,
  createDb,
  learners,
  lessonCompletions,
  SEEDED_LEARNER_ID,
  SEEDED_QUIZ_BODY,
  startingLevelDiagnostics,
  type QuizBody,
  TEACHING_PROFILE_VERSION,
  type StartingLevel,
} from "@senoy/db";
import { seedLearner, seedPublishedCourse } from "@senoy/db/seed-fixture";
import { parseTeachingProfileAnswers } from "@senoy/db/teaching-profile";
import type { Page } from "@playwright/test";
import { testAccounts } from "../accounts.ts";

const db = createDb(process.env.DATABASE_URL!, { max: 1 });

/**
 * Wipes the throwaway database and seeds a fresh fixture Course plus a saved Teaching Profile, owned by test account `a`.
 * @param answers - Teaching Profile answers; unset items are skipped
 * @param read - Lessons to start already completed, e.g. the Reading a Quiz covers, so the Quiz opens in linear order
 */
export async function resetFixture(answers: Record<string, unknown> = {}, read: readonly string[] = []) {
  await db.execute(
    sql`truncate generation_jobs, unpublished_lessons, course_blueprints, starting_level_diagnostics, quiz_attempts, goal_check_feedback, lesson_completions, course_completions, published_lessons, published_modules, published_courses, course_requests, learners cascade`,
  );
  const learner = await seedLearner(db, testAccounts().a.id);
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
  if (read.length) await db.insert(lessonCompletions).values(read.map((lessonId) => ({ learnerId: learner.id, lessonId })));
}

/** Capabilities 1–3 evidenced; the gap starts at Fixture capability 4. */
const startingLevel: StartingLevel = {
  learningGoal: "Play Iris by the Goo Goo Dolls",
  probedCapabilities: Array.from({ length: 8 }, (_, i) => ({
    id: `cap${i + 1}`, statement: `Fixture capability ${i + 1}`, itemId: `item${i + 1}`, span: i + 1,
    status: i < 3 ? "correct" as const : "dont_know" as const, expandedByLearner: false,
  })),
  remainingGapStatement: "Your Course would start at Fixture capability 4.",
  coverageNote: "Fixture coverage note.",
  extremity: "mixed",
};

/**
 * Resets the database and saves a Request whose Starting Level is confirmed. Returns its URL.
 * @param learningGoal - The Request's Learning Goal; the fixture pipeline reads markers in it
 */
export async function confirmedRequest(learningGoal = "Play Iris by the Goo Goo Dolls") {
  await resetFixture();
  const [row] = await db.insert(courseRequests).values({
    learnerId: SEEDED_LEARNER_ID, subject: "Drum kit", learningGoal, status: "starting_level_confirmed",
  }).returning();
  await db.insert(startingLevelDiagnostics).values({
    courseRequestId: row!.id, learnerId: SEEDED_LEARNER_ID, startingLevel, confirmation: "looks_right",
    readyAt: new Date(), submittedAt: new Date(), confirmedAt: new Date(),
  });
  return `/course-requests/${row!.id}`;
}

/**
 * Adds Course Requests waiting on the Learner, without resetting, to fill the course list.
 * @param count - How many to add
 */
export async function addWaitingRequests(count: number) {
  await db.insert(courseRequests).values(
    Array.from({ length: count }, (_, index) => ({
      learnerId: SEEDED_LEARNER_ID, subject: `Subject ${index + 1}`, learningGoal: `Goal ${index + 1}`, status: "starting_level_confirmed" as const,
    })),
  );
}

/**
 * The fieldset of the n-th Quiz item (0-based).
 * @param page - Playwright page
 * @param index - Item index
 * @param body - The Quiz (or Goal Check) on screen; the fixture Quiz by default
 */
export function quizItem(page: Page, index: number, body: QuizBody = SEEDED_QUIZ_BODY) {
  const item = body.items[index]!;
  return page.getByRole("group", { name: `${index + 1}. ${item.prompt}` });
}

/**
 * Picks an option on the n-th item: its correct option, or the first wrong one.
 * @param page - Playwright page
 * @param index - Item index
 * @param correct - Pick the right answer
 * @param body - The Quiz (or Goal Check) on screen; the fixture Quiz by default
 */
export async function pickOption(page: Page, index: number, correct: boolean, body: QuizBody = SEEDED_QUIZ_BODY) {
  const item = body.items[index]!;
  const option = correct
    ? item.options.find((row) => row.id === item.correctOptionId)!
    : item.options.find((row) => row.id !== item.correctOptionId)!;
  await quizItem(page, index, body).getByRole("radio", { name: option.text }).check();
  return option;
}

/**
 * Answers every item, the first `correct` of them right; with `check`, presses Check after each.
 * @param page - Playwright page
 * @param correct - How many to get right
 * @param check - Per-item timing
 * @param body - The Quiz (or Goal Check) on screen; the fixture Quiz by default
 */
export async function answerAll(page: Page, correct: number, check: boolean, body: QuizBody = SEEDED_QUIZ_BODY) {
  for (let index = 0; index < body.items.length; index += 1) {
    await pickOption(page, index, index < correct, body);
    if (check) {
      const item = quizItem(page, index, body);
      await item.getByRole("button", { name: "Check" }).click();
      await item.getByText(index < correct ? "✓ Correct" : "✗ Not quite").waitFor();
    }
  }
}
