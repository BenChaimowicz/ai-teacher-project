import { expect, test, type Page } from "@playwright/test";
import {
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
  SEEDED_GOAL_CHECK_LESSON_ID,
  SEEDED_QUIZ_BODY,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
} from "@senoy/db";
import { answerAll, pickOption, quizItem, resetFixture } from "./fixture.ts";

const lessonUrl = (lessonId: string) => `/study/${SEEDED_COURSE_ID}/lessons/${lessonId}`;
const READING_TITLE = "How a square knot holds";
const QUIZ_TITLE = "Square knot check";
const FOLLOW_UP_TITLE = "When not to use a square knot";

/**
 * Starts a retake and waits for the fresh draft (Submit back, no answer selected).
 * @param page - Playwright page
 */
async function retake(page: Page) {
  await page.getByRole("button", { name: "Retake" }).click();
  await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
}

/**
 * Opens the Lessons list in the Study bar.
 * @param page - Playwright page
 */
async function openLessons(page: Page) {
  // The Course outline sits in the sidebar, open by default on desktop.
  await expect(page.getByRole("button", { name: "Hide lessons" })).toBeVisible();
  return page.getByRole("navigation", { name: "Lessons" });
}

test("Linear: Readings open in order, Next skips the Quiz, and Take quiz opens it and comes back (SEN-133)", async ({ page }) => {
  await resetFixture();
  await page.goto(lessonUrl(SEEDED_READING_LESSON_ID));

  // Nothing ahead of the unread Reading opens yet, the Quiz included.
  const lessons = await openLessons(page);
  await expect(lessons.getByText(QUIZ_TITLE)).toHaveAttribute("aria-disabled", "true");
  await expect(lessons.getByText(FOLLOW_UP_TITLE)).toHaveAttribute("aria-disabled", "true");
  await page.goto(lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));
  await expect(page).toHaveURL(lessonUrl(SEEDED_READING_LESSON_ID));

  // The end of the Chapter's last Reading offers the Quiz beside Next, with one nudge, and Next goes to the next Reading.
  await expect(page.getByText("There's a short quiz on this part if you want to check it stuck.")).toBeVisible();
  await expect(page.getByRole("button", { name: "I've read it, take the quiz" })).toBeVisible();
  await page.getByRole("button", { name: "I've read it, next lesson" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));
  await expect(page.getByText("The square knot · 1 / 2")).toBeVisible();

  // Untaken, the Quiz holds nothing back: its row opens, marked optional.
  const after = await openLessons(page);
  await expect(after.getByRole("link", { name: QUIZ_TITLE })).toContainText("quiz · optional");

  // Back on the finished Reading, the Take quiz tile opens the Quiz, and Back to reading returns there.
  await after.getByRole("link", { name: READING_TITLE }).click();
  await page.getByRole("navigation", { name: "Take quiz" }).getByRole("link", { name: /Take quiz/ }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_QUIZ_LESSON_ID));
  await page.getByRole("button", { name: "Back to reading" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_READING_LESSON_ID));
});

test("I've read it, take the quiz: completes the Reading, opens the Quiz, and Back to reading returns to the Reading", async ({ page }) => {
  await resetFixture();
  await page.goto(lessonUrl(SEEDED_READING_LESSON_ID));
  await page.getByRole("button", { name: "I've read it, take the quiz" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_QUIZ_LESSON_ID));
  await expect(page.getByText("The square knot · 1 / 2")).toBeVisible();
  await page.getByRole("button", { name: "Back to reading" }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_READING_LESSON_ID));
  await expect(page.getByRole("link", { name: "Next Lesson" })).toBeVisible();
});

test("Per-item feedback: Check reveals the right answer, and a failing Submit locks nothing", async ({ page }) => {
  await resetFixture({}, [SEEDED_READING_LESSON_ID]);
  await page.goto(lessonUrl(SEEDED_QUIZ_LESSON_ID));

  const first = quizItem(page, 0);
  await pickOption(page, 0, false);
  await expect(first.getByText("✗ Not quite")).toHaveCount(0);
  await first.getByRole("button", { name: "Check" }).click();
  await expect(first.getByText("✗ Not quite")).toBeVisible();
  await expect(first.getByRole("radio").first()).toBeDisabled();

  // A wrong answer reveals the right one with its Check; there is no Show answer step.
  const item = SEEDED_QUIZ_BODY.items[0]!;
  await expect(first.getByText(item.explanations.standard)).toBeVisible();
  const right = item.options.find((option) => option.id === item.correctOptionId)!;
  await expect(first.getByText(`Correct answer: ${right.text}`)).toBeVisible();
  await expect(first.getByRole("button", { name: "Show answer" })).toHaveCount(0);
  // The next question's answer is not in the page before it is answered.
  const nextItem = SEEDED_QUIZ_BODY.items[1]!;
  await expect(page.getByText(nextItem.explanations.standard)).toHaveCount(0);

  await expect(page.getByRole("button", { name: "Submit" })).toBeDisabled();
  for (let index = 1; index < SEEDED_QUIZ_BODY.items.length; index += 1) {
    await pickOption(page, index, index < 3);
    await quizItem(page, index).getByRole("button", { name: "Check" }).click();
  }
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("You scored 2 / 5");
  await expect(page.getByRole("status")).toContainText("You need 70% to pass.");
  await expect(page.getByText("The square knot · 1 / 2")).toBeVisible();

  const lessons = await openLessons(page);
  await expect(lessons.getByRole("link", { name: QUIZ_TITLE })).toContainText("quiz · best 2/5");
  await lessons.getByRole("link", { name: FOLLOW_UP_TITLE }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));
});

test("Retake and pass: the best score is kept on the Quiz's row, and Progress never counts the Quiz", async ({ page }) => {
  await resetFixture({}, [SEEDED_READING_LESSON_ID]);
  await page.goto(lessonUrl(SEEDED_QUIZ_LESSON_ID));

  await answerAll(page, 3, true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("You scored 3 / 5");

  await retake(page);
  await expect(page.getByText("Best score: 3 / 5 · Not passed yet")).toBeVisible();
  await answerAll(page, 4, true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Quiz passed.");
  await expect(page.getByText("The square knot · 1 / 2")).toBeVisible();
  await expect(page.getByRole("link", { name: "Next Lesson" }), "A Quiz has no finish line.").toHaveCount(0);

  await retake(page);
  await answerAll(page, 1, true);
  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("You scored 1 / 5");
  await expect(page.getByText("Best score: 4 / 5 · Passed")).toBeVisible();
  const lessons = await openLessons(page);
  await expect(lessons.getByRole("link", { name: QUIZ_TITLE })).toContainText("quiz · best 4/5");
  await expect(page.getByText("The square knot · 1 / 2")).toBeVisible();
});

test("End-of-quiz feedback: no Check buttons; every item is marked after Submit", async ({ page }) => {
  await resetFixture({ feedbackTiming: { status: "selected", value: "end_of_quiz" } }, [SEEDED_READING_LESSON_ID]);
  await page.goto(lessonUrl(SEEDED_QUIZ_LESSON_ID));

  await answerAll(page, 4, false);
  await expect(page.getByRole("button", { name: "Check" })).toHaveCount(0);
  await expect(page.getByText("✓ Correct")).toHaveCount(0);

  await page.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("✓ Correct")).toHaveCount(4);
  await expect(page.getByText("✗ Not quite")).toHaveCount(1);
  await expect(page.getByRole("status")).toContainText("Quiz passed.");
});

test("Open-book: leaving the Quiz for a Lesson and coming back keeps the draft", async ({ page }) => {
  await resetFixture({ feedbackTiming: { status: "selected", value: "end_of_quiz" } }, [SEEDED_READING_LESSON_ID]);
  await page.goto(lessonUrl(SEEDED_QUIZ_LESSON_ID));

  const first = await pickOption(page, 0, true);
  const second = await pickOption(page, 1, false);

  const lessons = await openLessons(page);
  await lessons.getByRole("link", { name: READING_TITLE }).click();
  await expect(page.getByRole("heading", { name: "Two overhand knots" })).toBeVisible();
  await lessons.getByRole("link", { name: QUIZ_TITLE }).click();

  await expect(quizItem(page, 0).getByRole("radio", { name: first.text })).toBeChecked();
  await expect(quizItem(page, 1).getByRole("radio", { name: second.text })).toBeChecked();

  await page.reload();
  await expect(quizItem(page, 0).getByRole("radio", { name: first.text })).toBeChecked();
});

test("Free jump: disclaimer, every Lesson opens before it is reached, no way back to linear", async ({ page }) => {
  await resetFixture();
  await page.goto(lessonUrl(SEEDED_READING_LESSON_ID));

  await page.getByRole("button", { name: "Course menu" }).click();
  await page.getByRole("menuitem", { name: "Switch to free jump" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("You can't switch back to linear order.");
  await dialog.getByRole("button", { name: "Switch to free jump" }).click();
  await expect(dialog).toHaveCount(0);

  const lessons = await openLessons(page);
  await expect(lessons.getByRole("link", { name: QUIZ_TITLE }), "The Quiz opens before its Reading is read.").toBeVisible();
  await lessons.getByRole("link", { name: FOLLOW_UP_TITLE }).click();
  await expect(page).toHaveURL(lessonUrl(SEEDED_FOLLOW_UP_LESSON_ID));
  // After the last Reading, "I've read it" opens the Goal Check after it, in the same click; it is open in free jump.
  await page.getByRole("button", { name: "I've read it, start the goal check" }).click();
  await expect(page.getByText("The square knot · 1 / 2")).toBeVisible();
  await expect(page).toHaveURL(lessonUrl(SEEDED_GOAL_CHECK_LESSON_ID));

  await page.getByRole("button", { name: "Course menu" }).click();
  await expect(page.getByRole("menuitem", { name: "Switch to free jump" })).toHaveCount(0);
  await expect(page.getByText("Free jump is on. Every Lesson is open.")).toBeVisible();

  await page.reload();
  const reloaded = await openLessons(page);
  await expect(reloaded.getByRole("link", { name: FOLLOW_UP_TITLE })).toBeVisible();
});
