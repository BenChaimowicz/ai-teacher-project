import { expect, test } from "@playwright/test";
import { SEEDED_COURSE, SEEDED_COURSE_ID, SEEDED_FOLLOW_UP_LESSON_ID, SEEDED_QUIZ_LESSON_ID } from "@senoy/db";
import { answerAll, resetFixture } from "./fixture.ts";

const lessonUrl = (lessonId: string) => `/study/${SEEDED_COURSE_ID}/lessons/${lessonId}`;

test("Next Lesson walks the fixture Course to the Course-complete screen, and Home shows it Completed", async ({ page }) => {
  await resetFixture();
  await page.goto("/");

  const card = page.getByRole("link", { name: `Published ${SEEDED_COURSE.title}` });
  await expect(card).toContainText("Progress 0 / 3 Lessons");
  await expect(page.getByRole("main").getByRole("link", { name: "New Course Request" })).toBeVisible();
  await card.click();

  await expect(page.getByText(`${SEEDED_COURSE.title} · 0 / 3`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Next Lesson" })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark complete" }).click();
  await page.getByRole("link", { name: "Next Lesson" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_QUIZ_LESSON_ID));

  await answerAll(page, 4, true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Quiz passed.");
  await page.getByRole("link", { name: "Next Lesson" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));

  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText(`${SEEDED_COURSE.title} · 3 / 3`)).toBeVisible();
  await page.getByRole("link", { name: "Finish Course" }).click();

  await expect(page).toHaveURL(`/study/${SEEDED_COURSE_ID}/complete`);
  await expect(page.getByText("Course complete")).toBeVisible();
  await expect(page.getByRole("heading", { name: SEEDED_COURSE.title })).toBeVisible();
  await expect(page.getByText("Explain why a square knot holds under tension.")).toBeVisible();
  await expect(page.getByText("Best score 4 / 5 · Passed")).toBeVisible();

  await page.getByRole("link", { name: "Back to Home" }).click();
  const completed = page.getByRole("link", { name: `Completed ${SEEDED_COURSE.title}` });
  await expect(completed).toContainText("Progress 3 / 3 Lessons");
  await completed.click();
  await expect(page).toHaveURL(`/study/${SEEDED_COURSE_ID}/complete`);
});
