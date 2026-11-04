import { expect, test } from "@playwright/test";
import {
  SEEDED_COURSE,
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
  SEEDED_GOAL_CHECK_BODY,
  SEEDED_GOAL_CHECK_LESSON_ID,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "@senoy/db";
import { answerAll, resetFixture } from "./fixture.ts";

const lessonUrl = (lessonId: string) => `/study/${SEEDED_COURSE_ID}/lessons/${lessonId}`;

test("Next Lesson walks the fixture Course to the Course-complete screen, with an optional Quiz on the way, and Home shows it Completed", async ({ page }) => {
  await resetFixture();
  await page.goto("/");

  // Home: the course to continue comes first, with its progress, and New course is right there.
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: SEEDED_COURSE.title })).toBeVisible();
  await expect(main.getByText("0 of 2 lessons")).toBeVisible();
  await expect(main.getByRole("link", { name: /Start something new/ })).toBeVisible();
  await main.getByRole("link", { name: /^Continue/ }).click();

  await expect(page.getByText(`${SEEDED_COURSE.title} · 0 / 2`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Next Lesson" })).toHaveCount(0);
  // "I've read it" completes the Lesson and, here, opens the optional Quiz in the same click (SEN-133).
  await page.getByRole("button", { name: "I've read it, take the quiz" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_QUIZ_LESSON_ID));
  await expect(page.getByText(`${SEEDED_COURSE.title} · 1 / 2`)).toBeVisible();

  await answerAll(page, 4, true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Quiz passed.");
  await page.getByRole("button", { name: "Back to reading" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_READING_LESSON_ID));
  await page.getByRole("link", { name: "Next Lesson" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));

  // The last Reading's tile opens the Goal Check in the same click. It sits outside Progress (decision 2026-11-04).
  await page.getByRole("button", { name: "I've read it, start the goal check" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_GOAL_CHECK_LESSON_ID));
  await expect(page.getByText(`${SEEDED_COURSE.title} · 2 / 2`)).toBeVisible();
  await expect(page.getByRole("link", { name: /Finish Course/ })).toHaveCount(0);

  await answerAll(page, 5, true, SEEDED_GOAL_CHECK_BODY);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Goal met. Your best is 5 / 6.");
  await expect(page.getByRole("group", { name: "What was missing?" })).toHaveCount(0);
  await page.getByRole("link", { name: /Finish Course/ }).click();

  await expect(page).toHaveURL(`/study/${SEEDED_COURSE_ID}/complete`);
  await expect(page.getByRole("heading", { name: `You finished ${SEEDED_COURSE.title}` })).toBeVisible();
  await expect(page.getByText("Explain why a square knot holds under tension.")).toBeVisible();
  await expect(page.getByText("Best score 4 / 5 · Passed")).toBeVisible();
  await expect(page.getByText("Goal Check · Goal met · 5 / 6")).toBeVisible();

  await page.getByRole("link", { name: /Back to Home/ }).click();
  const completed = page.getByRole("main").getByRole("link", { name: new RegExp(SEEDED_COURSE.title) });
  await expect(completed).toContainText("2 of 2 lessons");
  await expect(completed).toContainText("done");
  await completed.click();
  await expect(page).toHaveURL(`/study/${SEEDED_COURSE_ID}/complete`);
});
