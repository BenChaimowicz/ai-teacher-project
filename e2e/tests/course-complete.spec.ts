import { expect, test } from "@playwright/test";
import { SEEDED_COURSE, SEEDED_COURSE_ID, SEEDED_FOLLOW_UP_LESSON_ID, SEEDED_QUIZ_LESSON_ID } from "@senoy/db";
import { answerAll, resetFixture } from "./fixture.ts";

const lessonUrl = (lessonId: string) => `/study/${SEEDED_COURSE_ID}/lessons/${lessonId}`;

test("Next Lesson walks the fixture Course to the Course-complete screen, and Home shows it Completed", async ({ page }) => {
  await resetFixture();
  await page.goto("/");

  // Home: the course to continue comes first, with its progress, and New course is right there.
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: SEEDED_COURSE.title })).toBeVisible();
  await expect(main.getByText("0 of 3 lessons")).toBeVisible();
  await expect(main.getByRole("link", { name: /Start something new/ })).toBeVisible();
  await main.getByRole("link", { name: /^Continue/ }).click();

  await expect(page.getByText(`${SEEDED_COURSE.title} · 0 / 3`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Next Lesson" })).toHaveCount(0);
  // "I've read it" completes the Lesson and opens the next one in the same click (decision 2026-11-03).
  await page.getByRole("button", { name: "I've read it, start the quiz" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_QUIZ_LESSON_ID));
  await expect(page.getByText(`${SEEDED_COURSE.title} · 1 / 3`)).toBeVisible();

  await answerAll(page, 4, true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Quiz passed.");
  await page.getByRole("link", { name: "Next Lesson" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));

  // The last Lesson's tile finishes the Course in the same click.
  await page.getByRole("button", { name: "I've read it, finish the course" }).click();

  await expect(page).toHaveURL(`/study/${SEEDED_COURSE_ID}/complete`);
  await expect(page.getByRole("heading", { name: `You finished ${SEEDED_COURSE.title}` })).toBeVisible();
  await expect(page.getByText("Explain why a square knot holds under tension.")).toBeVisible();
  await expect(page.getByText("Best score 4 / 5 · Passed")).toBeVisible();

  await page.getByRole("link", { name: /Back to Home/ }).click();
  const completed = page.getByRole("main").getByRole("link", { name: new RegExp(SEEDED_COURSE.title) });
  await expect(completed).toContainText("3 of 3 lessons");
  await expect(completed).toContainText("done");
  await completed.click();
  await expect(page).toHaveURL(`/study/${SEEDED_COURSE_ID}/complete`);
});
