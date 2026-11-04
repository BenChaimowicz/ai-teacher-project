import { expect, test } from "@playwright/test";
import {
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
  SEEDED_GOAL_CHECK_BODY,
  SEEDED_GOAL_CHECK_LESSON_ID,
  SEEDED_GOAL_OBJECTIVES,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "@senoy/db";
import { answerAll, resetFixture } from "./fixture.ts";

const lessonUrl = (lessonId: string) => `/study/${SEEDED_COURSE_ID}/lessons/${lessonId}`;

test("A not-met Goal Check shows what was missed, asks why, and opens a new Course built from it (SEN-81)", async ({ page }) => {
  await resetFixture();
  await page.goto(lessonUrl(SEEDED_READING_LESSON_ID));
  await page.getByRole("button", { name: "I've read it, start the quiz" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_QUIZ_LESSON_ID));
  await answerAll(page, 4, true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Quiz passed.");

  // The Goal Check has its own row in the outline, after the Lessons.
  const outline = page.getByRole("navigation", { name: "Lessons" });
  await outline.getByRole("list", { name: "Goal Check" }).getByRole("link").click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_GOAL_CHECK_LESSON_ID));

  // Two of six right (the first objective's two items): under 50%, so not met.
  await answerAll(page, 2, true, SEEDED_GOAL_CHECK_BODY);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Not met yet. Your best is 2 / 6.");
  // Outside Progress: the Course still counts 2 of its 3 Lessons (the Reading and the Quiz).
  await expect(page.getByText("The square knot · 2 / 3")).toBeVisible();

  // The missed objectives, in order, each linking back to the Reading that teaches it.
  const missed = page.getByRole("region", { name: "Worth another look" });
  await expect(missed.getByRole("listitem")).toHaveCount(2);
  await expect(missed.getByRole("listitem").nth(0)).toContainText(SEEDED_GOAL_OBJECTIVES[1]);
  await expect(missed.getByRole("listitem").nth(1)).toContainText(SEEDED_GOAL_OBJECTIVES[2]);
  await expect(missed.getByRole("link", { name: /When not to use a square knot/ })).toHaveAttribute("href", lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));

  // What was missing: Send waits for a reason, and "Something else" waits for its text.
  const form = page.getByRole("group", { name: "What was missing?" });
  const send = form.getByRole("button", { name: /^Send/ });
  await expect(send).toBeDisabled();
  await form.getByRole("button", { name: "Too theoretical, not practical enough" }).click();
  await expect(send).toBeEnabled();
  await form.getByRole("button", { name: "Something else" }).click();
  await expect(send).toBeDisabled();
  await form.getByLabel("What else was missing?").fill("Real rope to practise on");
  await send.click();
  await expect(form).toHaveCount(0);
  const answer = "Too theoretical, not practical enough · “Real rope to practise on”";
  await expect(page.getByRole("log").getByText(answer)).toBeVisible();

  // A reload keeps the answer; what next is still to choose.
  await page.reload();
  await expect(page.getByRole("log").getByText(answer)).toBeVisible();
  const next = page.getByRole("group", { name: "What now?" });
  await expect(next.getByRole("button", { name: /Nothing for now/ })).toBeVisible();

  await next.getByRole("button", { name: /Make a new Course with what was missing/ }).click();
  // The New course screen saves the prefilled topic straight away and opens the new Request.
  await expect(page).toHaveURL(/\/course-requests\//);
  await expect(page.getByRole("log").getByText(SEEDED_GOAL_OBJECTIVES[1], { exact: false })).toBeVisible();
});

test("A partly met Goal Check shows what to look at again and asks nothing (SEN-81)", async ({ page }) => {
  await resetFixture();
  await page.goto(lessonUrl(SEEDED_READING_LESSON_ID));
  // Free jump opens the Goal Check before the Lessons ahead of it are done.
  await page.getByRole("button", { name: "Course menu" }).click();
  await page.getByRole("menuitem", { name: "Switch to free jump" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Switch to free jump" }).click();
  await page.goto(lessonUrl(SEEDED_GOAL_CHECK_LESSON_ID));

  // Four of six: partly met. No questions asked.
  await answerAll(page, 4, true, SEEDED_GOAL_CHECK_BODY);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Partly met. Your best is 4 / 6.");
  await expect(page.getByRole("group", { name: "What was missing?" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Worth another look" }).getByRole("listitem")).toHaveCount(1);
  // The Lessons before it are still open, so the next step is one of them, not Finish Course.
  await expect(page.getByRole("link", { name: /Next Lesson/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Finish Course/ })).toHaveCount(0);
});
