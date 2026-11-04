import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import {
  GOAL_CHECK_METHOD_ID,
  type GoalCheckBody,
  learners,
  parseTeachingProfileAnswers,
  SEEDED_COURSE,
  SEEDED_COURSE_ID,
  SEEDED_FOLLOW_UP_LESSON_ID,
  SEEDED_LEARNER_ID,
  SEEDED_LESSONS,
  SEEDED_MODULE,
  SEEDED_QUIZ_BODY,
  SEEDED_QUIZ_LESSON_ID,
  SEEDED_READING_LESSON_ID,
  TEACHING_PROFILE_VERSION,
  type Database,
  type QuizBody,
} from "@senoy/db";
import type { Generator, Judge } from "../lib/model-ports.ts";
import { createQuizGenerator } from "../lib/quiz-generation.ts";
import type { GoalCheckFeedbackRow, LessonRow, QuizAttemptRow, StudyStore } from "../lib/study-store.ts";
import { recordProductEvents, settled } from "./recording-sink.ts";
import { studyRoutes } from "./study.ts";

/** Id of the Goal Check Lesson some tests add after the fixture's Lessons. */
const GOAL_CHECK_LESSON_ID = "00000000-0000-4000-8000-0000000000a1";

/** Goal objectives of the test Goal Check, in slot order: deliberately not the order the items check them in. */
const GOAL_OBJECTIVES = ["Pick the right job for a square knot", "Tie a square knot", "Spot a granny knot"];

/** Six items, two per objective: g1–g2 tie it, g3–g4 spot a granny, g5–g6 pick the job. */
const GOAL_CHECK_BODY: GoalCheckBody = {
  items: [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `g${n}`,
    objective: GOAL_OBJECTIVES[[1, 1, 2, 2, 0, 0][n - 1]!]!,
    prompt: `Goal question ${n}?`,
    options: ["a", "b", "c", "d"].map((id) => ({ id, text: `Option ${id} for ${n}` })),
    correctOptionId: "a",
    explanations: { brief: `Brief ${n}.`, standard: `Standard ${n}.`, detailed: `Detailed ${n}.` },
  })),
};

/** The Goal Check Lesson closing the fixture Course, with each objective's teaching Lessons. */
const GOAL_CHECK_LESSON: LessonRow = {
  id: GOAL_CHECK_LESSON_ID,
  moduleId: SEEDED_MODULE.id,
  title: "Goal Check",
  teachingMethod: GOAL_CHECK_METHOD_ID,
  position: 3,
  lessonGoal: SEEDED_COURSE.learningGoal,
  body: GOAL_CHECK_BODY,
  citations: [],
  objectives: GOAL_OBJECTIVES,
  // Key order differs from GOAL_OBJECTIVES on purpose: Postgres jsonb does not keep it.
  objectiveLessonIds: {
    "Spot a granny knot": [SEEDED_QUIZ_LESSON_ID],
    "Tie a square knot": [SEEDED_READING_LESSON_ID],
    "Pick the right job for a square knot": [SEEDED_FOLLOW_UP_LESSON_ID],
  },
  assessedLessonIds: [],
};

/**
 * In-memory Study store holding the fixture Course.
 * @param quizBody - Body of the fixture's Quiz Lesson
 * @param goalCheck - A Goal Check Lesson to add after the fixture's Lessons; none by default, like a Course before SEN-81
 * @param completed - Lessons this Learner has already completed
 */
function memoryStore(quizBody: QuizBody, goalCheck: LessonRow | null = null, completed: readonly string[] = []): StudyStore {
  let sequenceMode: string = SEEDED_COURSE.sequenceMode;
  const completions = new Set<string>(completed);
  let courseCompletedAt: Date | null = null;
  const attempts: (QuizAttemptRow & { lessonId: string })[] = [];
  const feedback = new Map<string, GoalCheckFeedbackRow>();
  return {
    async findCourse(learnerId, courseId) {
      if (learnerId !== SEEDED_LEARNER_ID || courseId !== SEEDED_COURSE_ID) return null;
      return {
        id: SEEDED_COURSE_ID, title: SEEDED_COURSE.title, subject: SEEDED_COURSE.subject, learningGoal: SEEDED_COURSE.learningGoal, sequenceMode,
      };
    },
    async listModules() {
      return [{ id: SEEDED_MODULE.id, title: SEEDED_MODULE.title, position: SEEDED_MODULE.position }];
    },
    async listLessons() {
      const fixture: LessonRow[] = SEEDED_LESSONS.map((lesson) => ({
        ...lesson, objectiveLessonIds: {}, ...(lesson.id === SEEDED_QUIZ_LESSON_ID ? { body: quizBody } : {}),
      }));
      return goalCheck ? [...fixture, structuredClone(goalCheck)] : fixture;
    },
    async completedLessonIds() {
      return new Set(completions);
    },
    async insertCompletion(_learnerId, lessonId) {
      completions.add(lessonId);
    },
    async setSequenceMode(_learnerId, _courseId, mode) {
      sequenceMode = mode;
    },
    async courseCompletedAt() {
      return courseCompletedAt;
    },
    async insertCourseCompletion() {
      courseCompletedAt ??= new Date();
    },
    async listQuizAttempts(_learnerId, lessonId) {
      return attempts.filter((row) => row.lessonId === lessonId).map((row) => ({ ...row }));
    },
    async listSubmittedCourseAttempts() {
      return attempts.filter((row) => row.status === "submitted").map((row) => ({ ...row }));
    },
    async insertQuizAttempt(_learnerId, lessonId, feedbackTiming, answers) {
      const row = {
        id: randomUUID(),
        lessonId,
        status: "draft" as const,
        feedbackTiming,
        answers: structuredClone(answers),
        correct: null,
        total: null,
        startedAt: new Date(Date.now() + attempts.length),
      };
      attempts.push(row);
      return { ...row };
    },
    async updateQuizAttempt(_learnerId, id, patch) {
      const row = attempts.find((attempt) => attempt.id === id);
      if (!row) throw new Error("No attempt");
      const { submittedAt: _submittedAt, ...rest } = patch;
      Object.assign(row, structuredClone(rest));
    },
    async getGoalCheckFeedback(_learnerId, lessonId) {
      const row = feedback.get(lessonId);
      return row ? structuredClone(row) : null;
    },
    async saveGoalCheckFeedback(_learnerId, lessonId, sent) {
      feedback.set(lessonId, { ...structuredClone(sent), nextStep: null });
    },
    async setGoalCheckNextStep(_learnerId, lessonId, nextStep) {
      const row = feedback.get(lessonId);
      if (row) row.nextStep = nextStep;
    },
  };
}

/** The fixture Learner with a saved Teaching Profile built from `answers`. */
function learnerWith(answers: Record<string, unknown> = {}): typeof learners.$inferSelect {
  return {
    id: SEEDED_LEARNER_ID,
    createdAt: new Date(),
    authUserId: randomUUID(),
    displayName: "Curious_Owl",
    teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers(answers),
    teachingProfileAssessedAt: new Date(),
    teachingProfileUpdatedAt: new Date(),
  };
}

/**
 * Real Study handlers over the in-memory store. `state.learner` can change between requests.
 * @param answers - Teaching Profile answers
 * @param quizBody - Body of the fixture's Quiz
 * @param goalCheck - A Goal Check Lesson to end the Course with
 * @param readFirst - Start with the Reading the Quiz covers already read, so the Quiz is open in linear order (SEN-133)
 */
async function testApp(
  answers: Record<string, unknown> = {},
  quizBody: QuizBody = SEEDED_QUIZ_BODY,
  goalCheck: LessonRow | null = null,
  readFirst = true,
) {
  const state = { learner: learnerWith(answers) };
  const app = Fastify();
  app.decorate("db", {} as Database);
  app.addHook("onRequest", async (request) => {
    request.currentLearner = state.learner;
  });
  await app.register(studyRoutes, { store: memoryStore(quizBody, goalCheck, readFirst ? [SEEDED_READING_LESSON_ID] : []) });

  const base = `/api/courses/${SEEDED_COURSE_ID}`;
  const quiz = `${base}/lessons/${SEEDED_QUIZ_LESSON_ID}/quiz`;
  const goalQuiz = `${base}/lessons/${GOAL_CHECK_LESSON_ID}/quiz`;
  const call = async (method: "GET" | "POST" | "PUT", url: string, payload?: object) => {
    const response = await app.inject({ method, url, payload });
    return { status: response.statusCode, body: response.json() };
  };
  return {
    app,
    state,
    quizBody,
    study: () => call("GET", base),
    quiz: () => call("GET", quiz),
    answer: (itemId: string, optionId: string) => call("PUT", `${quiz}/answers/${itemId}`, { optionId }),
    check: (itemId: string) => call("POST", `${quiz}/answers/${itemId}/check`),
    submit: () => call("POST", `${quiz}/submit`),
    retake: () => call("POST", `${quiz}/retake`),
    complete: (lessonId: string) => call("POST", `${base}/lessons/${lessonId}/complete`),
    summary: () => call("GET", `${base}/summary`),
    sequenceMode: (mode: string) => call("PUT", `${base}/sequence-mode`, { mode }),
    openQuiz: (from: unknown) => call("POST", `${quiz}/opens`, { from }),
    closeQuiz: (submitted: unknown) => call("POST", `${quiz}/closes`, { submitted }),
    goal: {
      get: () => call("GET", goalQuiz),
      answer: (itemId: string, optionId: string) => call("PUT", `${goalQuiz}/answers/${itemId}`, { optionId }),
      check: (itemId: string) => call("POST", `${goalQuiz}/answers/${itemId}/check`),
      submit: () => call("POST", `${goalQuiz}/submit`),
      retake: () => call("POST", `${goalQuiz}/retake`),
      feedback: (payload: object, lessonId = GOAL_CHECK_LESSON_ID) =>
        call("PUT", `${base}/lessons/${lessonId}/goal-check/feedback`, payload),
      nextStep: (nextStep: unknown) => call("PUT", `${base}/lessons/${GOAL_CHECK_LESSON_ID}/goal-check/next-step`, { nextStep }),
    },
  };
}

type TestApp = Awaited<ReturnType<typeof testApp>>;

/**
 * Answers every item, the first `correct` of them right, checking each when `check` is set.
 * @param t - Test app
 * @param correct - How many items to answer correctly
 * @param check - Per-item timing: Check after answering
 */
async function answerAll(t: TestApp, correct: number, check: boolean) {
  for (const [index, item] of t.quizBody.items.entries()) {
    const wrong = item.options.find((option) => option.id !== item.correctOptionId)!;
    const saved = await t.answer(item.id, index < correct ? item.correctOptionId : wrong.id);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    if (check) assert.equal((await t.check(item.id)).status, 200);
  }
}

/** Study Lesson by id. */
function lessonIn(payload: { modules: { lessons: { id: string; locked: boolean; completed: boolean; body: unknown }[] }[] }, id: string) {
  const lesson = payload.modules.flatMap((module) => module.lessons).find((row) => row.id === id);
  assert.ok(lesson);
  return lesson;
}

test("Study never sends the Quiz answer key; linear opens Readings in order and the Quiz never gates (SEN-133)", async () => {
  const t = await testApp({}, SEEDED_QUIZ_BODY, null, false);
  try {
    const { status, body } = await t.study();
    assert.equal(status, 200);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("correctOptionId"));
    assert.ok(!raw.includes("explanations"));
    assert.equal(lessonIn(body, SEEDED_READING_LESSON_ID).locked, false);
    assert.equal(lessonIn(body, SEEDED_QUIZ_LESSON_ID).locked, true, "The Quiz opens once the Reading it covers is read.");
    assert.equal(lessonIn(body, SEEDED_FOLLOW_UP_LESSON_ID).locked, true, "Readings open in order.");
    assert.deepEqual((await t.complete(SEEDED_FOLLOW_UP_LESSON_ID)).body, { error: "This Lesson opens once you have read the Lessons before it." });
    assert.equal((await t.quiz()).status, 403);
    assert.deepEqual(body.progress, { completed: 0, total: 2 }, "Progress counts the Readings only.");

    const read = await t.complete(SEEDED_READING_LESSON_ID);
    const quizRow = lessonIn(read.body, SEEDED_QUIZ_LESSON_ID) as { locked: boolean; assessedLessonIds?: string[]; quizBest?: unknown };
    assert.equal(quizRow.locked, false);
    assert.equal(quizRow.quizBest, null, "Not taken yet.");
    assert.deepEqual(quizRow.assessedLessonIds, [SEEDED_READING_LESSON_ID], "Study says which Readings the Quiz covers.");
    assert.equal(lessonIn(read.body, SEEDED_FOLLOW_UP_LESSON_ID).locked, false, "An untaken Quiz does not hold back the next Reading.");
    assert.equal(read.body.currentLessonId, SEEDED_FOLLOW_UP_LESSON_ID, "The Current Lesson skips the Quiz.");
    assert.deepEqual((await t.complete(SEEDED_QUIZ_LESSON_ID)).body, {
      error: "Pass the Quiz with at least 70% to complete it.",
    });
  } finally {
    await t.app.close();
  }
});

test("Per-item timing: Check locks an answer and gives right/wrong; Submit needs every item checked", async () => {
  const t = await testApp();
  try {
    const fresh = await t.quiz();
    assert.equal(fresh.body.quiz.feedbackTiming, "per_item");
    assert.equal(fresh.body.quiz.attempt, null);

    const [first] = SEEDED_QUIZ_BODY.items;
    assert.ok(first);
    const wrong = first.options.find((option) => option.id !== first.correctOptionId)!;
    const saved = await t.answer(first.id, wrong.id);
    assert.deepEqual(saved.body.quiz.attempt.results, {}, "No feedback before Check.");

    const checked = await t.check(first.id);
    assert.deepEqual(checked.body.quiz.attempt.results, { [first.id]: false });
    assert.equal((await t.answer(first.id, first.correctOptionId)).status, 409, "Checked answers are locked.");
    assert.equal((await t.submit()).status, 400, "Submit waits on every item.");
  } finally {
    await t.app.close();
  }
});

test("Per-item timing: an item's answer key arrives with its Check, never before", async () => {
  const t = await testApp();
  try {
    const [first, second] = SEEDED_QUIZ_BODY.items;
    assert.ok(first && second);
    const leaks = (body: unknown, item: typeof first) =>
      JSON.stringify(body).includes(`"correctOptionId":"${item.correctOptionId}"`) || JSON.stringify(body).includes(item.explanations.standard);

    assert.ok(!leaks((await t.quiz()).body, first), "No key before any answer.");
    assert.ok(!JSON.stringify((await t.study()).body).includes("correctOptionId"), "Study never sends keys.");
    const wrong = first.options.find((option) => option.id !== first.correctOptionId)!;
    const saved = await t.answer(first.id, wrong.id);
    assert.deepEqual(saved.body.quiz.attempt.answerKeys, {}, "Answering alone reveals nothing.");
    assert.ok(!leaks(saved.body, first));
    assert.ok(!leaks((await t.quiz()).body, first), "Nor does reloading the draft.");

    const checked = await t.check(first.id);
    assert.deepEqual(checked.body.quiz.attempt.answerKeys, {
      [first.id]: { itemId: first.id, correctOptionId: first.correctOptionId, explanation: first.explanations.standard },
    });
    assert.ok(!(second.id in checked.body.quiz.attempt.answerKeys), "Unchecked items stay hidden.");
    assert.equal((await t.quiz()).body.quiz.attempt.answerKeys[first.id].correctOptionId, first.correctOptionId, "Kept on reload.");
    assert.equal((await t.app.inject({ method: "POST", url: `/api/courses/${SEEDED_COURSE_ID}/lessons/${SEEDED_QUIZ_LESSON_ID}/quiz/answers/${first.id}/reveal` })).statusCode, 404, "No separate reveal step.");
  } finally {
    await t.app.close();
  }
});

test("Fail, retake, pass: best score is kept, the next Reading stays open throughout, and Progress ignores the Quiz", async () => {
  const t = await testApp();
  try {
    await answerAll(t, 3, true);
    const failed = await t.submit();
    assert.equal(failed.status, 200);
    assert.deepEqual(failed.body.quiz.attempt.score, { correct: 3, total: 5 });
    assert.equal(failed.body.quiz.passed, false);
    assert.equal(lessonIn(failed.body.study, SEEDED_FOLLOW_UP_LESSON_ID).locked, false, "A failed Quiz gates nothing.");
    assert.deepEqual((lessonIn(failed.body.study, SEEDED_QUIZ_LESSON_ID) as { quizBest?: unknown }).quizBest, { correct: 3, total: 5 }, "Study shows it was taken, and the best score.");
    assert.ok(!("quizBest" in lessonIn(failed.body.study, SEEDED_READING_LESSON_ID)), "Only a Quiz carries a score.");
    assert.equal((await t.answer("q1", "a")).status, 409, "After Submit the Learner must Retake.");

    const retake = await t.retake();
    assert.equal(retake.body.quiz.attempt.status, "draft");
    assert.deepEqual(retake.body.quiz.attempt.answers, {});
    assert.deepEqual(retake.body.quiz.best, { correct: 3, total: 5 });

    await answerAll(t, 4, true);
    const passed = await t.submit();
    assert.equal(passed.body.quiz.passed, true);
    assert.deepEqual(passed.body.study.progress, { completed: 1, total: 2 }, "Only the Reading counts.");
    assert.equal(lessonIn(passed.body.study, SEEDED_QUIZ_LESSON_ID).completed, true);

    await t.retake();
    await answerAll(t, 1, true);
    const worse = await t.submit();
    assert.deepEqual(worse.body.quiz.attempt.score, { correct: 1, total: 5 });
    assert.deepEqual(worse.body.quiz.best, { correct: 4, total: 5 });
    assert.equal(worse.body.quiz.passed, true);
    assert.deepEqual(worse.body.study.progress, { completed: 1, total: 2 });
    assert.deepEqual((lessonIn(worse.body.study, SEEDED_QUIZ_LESSON_ID) as { quizBest?: unknown }).quizBest, { correct: 4, total: 5 }, "The best score is kept.");
  } finally {
    await t.app.close();
  }
});

test("Check, Retake and switching to free jump each record a product event; saving a pick records none (SEN-127)", async () => {
  const t = await testApp();
  const recorded = recordProductEvents();
  try {
    const [first, ...others] = SEEDED_QUIZ_BODY.items;
    assert.ok(first);
    await t.answer(first.id, first.correctOptionId);
    await t.answer(first.id, first.correctOptionId);
    assert.equal((await t.check(first.id)).status, 200);
    assert.equal((await t.check(first.id)).status, 200, "Checking a locked answer again is a no-op.");
    for (const item of others) {
      await t.answer(item.id, item.options.find((option) => option.id !== item.correctOptionId)!.id);
      await t.check(item.id);
    }
    assert.equal((await t.submit()).status, 200);
    await t.retake();
    await t.retake();
    await t.sequenceMode("free_jump");
    await t.sequenceMode("free_jump");
    await settled();

    const where = { courseId: SEEDED_COURSE_ID, lessonId: SEEDED_QUIZ_LESSON_ID };
    const checked = recorded.of("quiz_answer_checked");
    assert.deepEqual(checked.map((event) => (event.detail as { itemId: string }).itemId), SEEDED_QUIZ_BODY.items.map((item) => item.id), "One event per item; checking again records nothing.");
    assert.deepEqual(checked.map((event) => (event.detail as { correct: boolean }).correct), [true, ...others.map(() => false)]);
    assert.deepEqual(checked[0]?.detail, { ...where, itemId: first.id, correct: true });
    assert.deepEqual(recorded.of("quiz_retaken").map((event) => event.detail), [{ ...where, lastCorrect: 1, lastTotal: SEEDED_QUIZ_BODY.items.length }]);
    assert.deepEqual(recorded.of("course_sequence_mode_changed").map((event) => event.detail), [{ courseId: SEEDED_COURSE_ID, from: "linear", to: "free_jump" }]);
    assert.ok(recorded.events.every((event) => event.learnerId === t.state.learner.id));
    assert.deepEqual([...new Set(recorded.events.map((event) => event.kind))].sort(),
      ["course_sequence_mode_changed", "quiz_answer_checked", "quiz_retaken", "quiz_submitted"], "Saving a pick is not an event (decision 2026-11-04).");
  } finally {
    recorded.uninstall();
    await t.app.close();
  }
});

test("Opening and closing a Quiz from Take quiz each record a product event; the Goal Check is not opened this way (SEN-133)", async () => {
  const t = await testApp();
  const recorded = recordProductEvents();
  try {
    assert.equal((await t.openQuiz("sidebar")).status, 200);
    assert.equal((await t.openQuiz("floating")).status, 400);
    assert.equal((await t.closeQuiz("yes")).status, 400);
    await answerAll(t, 5, true);
    await t.submit();
    assert.equal((await t.openQuiz("card")).status, 200);
    assert.equal((await t.closeQuiz(true)).status, 200);
    await settled();

    const where = { courseId: SEEDED_COURSE_ID, lessonId: SEEDED_QUIZ_LESSON_ID, title: SEEDED_LESSONS[1]!.title };
    assert.deepEqual(recorded.of("quiz_opened").map((event) => event.detail), [
      { ...where, from: "sidebar", takenBefore: false },
      { ...where, from: "card", takenBefore: true },
    ]);
    assert.deepEqual(recorded.of("quiz_closed").map((event) => event.detail), [{ ...where, submitted: true }]);
  } finally {
    recorded.uninstall();
    await t.app.close();
  }
  const goal = await testApp({}, SEEDED_QUIZ_BODY, GOAL_CHECK_LESSON, false);
  try {
    const url = `/api/courses/${SEEDED_COURSE_ID}/lessons/${GOAL_CHECK_LESSON_ID}/quiz/opens`;
    assert.equal((await goal.app.inject({ method: "POST", url, payload: { from: "sidebar" } })).statusCode, 403, "Locked first.");
    await goal.sequenceMode("free_jump");
    assert.equal((await goal.app.inject({ method: "POST", url, payload: { from: "sidebar" } })).statusCode, 404);
  } finally {
    await goal.app.close();
  }
});

test("End-of-quiz timing: no Check; every item gets right/wrong after Submit", async () => {
  const t = await testApp({ feedbackTiming: { status: "selected", value: "end_of_quiz" } });
  try {
    assert.equal((await t.quiz()).body.quiz.feedbackTiming, "end_of_quiz");
    await answerAll(t, 2, false);
    assert.equal((await t.check("q1")).status, 409);
    const before = await t.quiz();
    assert.deepEqual(before.body.quiz.attempt.results, {}, "No feedback before Submit.");
    assert.deepEqual(before.body.quiz.attempt.answerKeys, {}, "No answer keys before Submit.");
    assert.ok(!JSON.stringify(before.body).includes("correctOptionId"));
    const after = await t.submit();
    assert.equal(Object.keys(after.body.quiz.attempt.results).length, 5);
    assert.equal(Object.keys(after.body.quiz.attempt.answerKeys).length, 5, "Every key arrives with Submit.");
    assert.equal(after.body.quiz.attempt.answerKeys.q5.correctOptionId, SEEDED_QUIZ_BODY.items[4]!.correctOptionId);
    assert.equal(after.body.quiz.attempt.results.q1, true);
    assert.equal(after.body.quiz.attempt.results.q5, false);
  } finally {
    await t.app.close();
  }
});

test("An attempt keeps the timing it started with; Feedback detail follows the current Profile", async () => {
  const t = await testApp();
  try {
    await t.answer("q1", "b");
    t.state.learner = learnerWith({
      feedbackTiming: { status: "selected", value: "end_of_quiz" },
      feedbackDepth: { status: "selected", value: "detailed" },
    });
    assert.equal((await t.quiz()).body.quiz.feedbackTiming, "per_item");
    const checked = await t.check("q1");
    assert.equal(checked.status, 200);
    assert.equal(checked.body.quiz.attempt.answerKeys.q1.explanation, SEEDED_QUIZ_BODY.items[0]!.explanations.detailed);
  } finally {
    await t.app.close();
  }
});

test("Free jump is one-way and opens every Lesson; a Quiz still completes only on a pass", async () => {
  const t = await testApp({}, SEEDED_QUIZ_BODY, null, false);
  try {
    assert.equal((await t.sequenceMode("sideways")).status, 400);
    const switched = await t.sequenceMode("free_jump");
    assert.equal(switched.status, 200);
    assert.equal(switched.body.course.sequenceMode, "free_jump");
    assert.equal(lessonIn(switched.body, SEEDED_FOLLOW_UP_LESSON_ID).locked, false);
    assert.equal(lessonIn(switched.body, SEEDED_QUIZ_LESSON_ID).locked, false, "The Quiz opens before its Reading is read.");
    assert.equal(lessonIn(switched.body, SEEDED_QUIZ_LESSON_ID).completed, false);
    assert.equal((await t.sequenceMode("free_jump")).status, 200, "Asking again is a no-op.");
    assert.deepEqual((await t.sequenceMode("linear")).body, {
      error: "Linear order cannot be restored after switching to free jump.",
    });
    assert.equal((await t.complete(SEEDED_FOLLOW_UP_LESSON_ID)).status, 200);
    assert.equal((await t.complete(SEEDED_QUIZ_LESSON_ID)).status, 400);
  } finally {
    await t.app.close();
  }
});

test("A generated Quiz plays through the Quiz plugin: attempts, best score, and completion at 70%", async () => {
  const generator: Generator = {
    modelId: "fixture/author",
    async generateStructured(request) {
      return { modelId: "fixture/author", value: request.parse({
        items: [1, 2, 3, 4, 5, 6].map((n) => ({
          objective: "Name the Nine Worlds", prompt: `Which world is number ${n}?`,
          options: [
            { id: "opt1", text: `World ${n}`, correct: true, why: `The Lesson names world ${n}.` },
            ...["a", "b", "c"].map((letter, index) => ({ id: `opt${index + 2}`, text: `Not ${n}${letter}`, correct: false, why: `The Lesson does not name ${n}${letter}.` })),
          ],
          explanations: { brief: `Brief ${n}.`, standard: `Standard ${n}.`, detailed: `Detailed ${n}.` },
        })),
      }) };
    },
  };
  // Grounding runs before the items are written, and the assessed Lesson teaches the one objective (ADR 0022).
  const judge: Judge = {
    modelId: "fixture/judge",
    judge: async (request) => ({
      value: request.parse(request.schemaName === "objective_grounding"
        ? { objectives: [{ objective: "Name the Nine Worlds", verdict: "supported", text: "", reason: "" }] }
        : { pass: true, failedChecks: [], reasons: [] }),
      modelId: "fixture/judge",
    }),
  };
  const reading = {
    id: "slot1", method: "reading" as const, title: "Worlds", lessonGoal: "Name the worlds.", objectives: ["Name the Nine Worlds"],
    topicTags: ["norse", "worlds"], assessesSlotIds: [],
  };
  const slot = { ...reading, id: "slot2", method: "quiz" as const, title: "Check: worlds", assessesSlotIds: ["slot1"] };
  const { lesson } = await createQuizGenerator({ generator, judge }).generate({
    courseTitle: "Norse cosmology", learningGoal: "Explain the Norse world", scope: null, slot, slots: [reading, slot], profile: {},
    assessed: [{ slotId: "slot1", title: "Worlds", lessonGoal: "Name the worlds.", objectives: reading.objectives, body: { sections: [] } }],
  });

  const t = await testApp({}, lesson.body);
  try {
    const shown = await t.quiz();
    assert.equal(shown.status, 200);
    assert.ok(!JSON.stringify(shown.body).includes("correctOptionId"), "The generated key stays on the server.");

    await answerAll(t, 4, true);
    const failed = await t.submit();
    assert.deepEqual(failed.body.quiz.attempt.score, { correct: 4, total: 6 });
    assert.equal(failed.body.quiz.passed, false, "4/6 is under 70%.");
    assert.equal(lessonIn(failed.body.study, SEEDED_QUIZ_LESSON_ID).completed, false);

    await t.retake();
    await answerAll(t, 5, true);
    const passed = await t.submit();
    assert.equal(passed.body.quiz.passed, true);
    assert.deepEqual(passed.body.quiz.best, { correct: 5, total: 6 });
    assert.equal(lessonIn(passed.body.study, SEEDED_QUIZ_LESSON_ID).completed, true);
  } finally {
    await t.app.close();
  }
});

test("Completing the last Reading stores Course completion once; the summary shows what was covered and Quiz results", async () => {
  const t = await testApp({}, SEEDED_QUIZ_BODY, null, false);
  try {
    assert.equal((await t.summary()).status, 409, "No summary before the Course is complete.");

    const read = await t.complete(SEEDED_READING_LESSON_ID);
    assert.equal(read.body.course.completedAt, null);

    await answerAll(t, 3, true);
    await t.submit();
    await t.retake();
    await answerAll(t, 5, true);
    const passed = await t.submit();
    assert.equal(passed.body.study.course.completedAt, null, "One Reading is still left.");

    const last = await t.complete(SEEDED_FOLLOW_UP_LESSON_ID);
    assert.equal(last.status, 200);
    assert.deepEqual(last.body.progress, { completed: 2, total: 2 });
    const completedAt = last.body.course.completedAt;
    assert.ok(completedAt, "Course completion is stored with the last Lesson.");

    const again = await t.complete(SEEDED_FOLLOW_UP_LESSON_ID);
    assert.equal(again.body.course.completedAt, completedAt, "The first completion time is kept.");

    const summary = await t.summary();
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.body.course, {
      id: SEEDED_COURSE_ID,
      title: SEEDED_COURSE.title,
      learningGoal: SEEDED_COURSE.learningGoal,
      completedAt,
    });
    assert.deepEqual(
      summary.body.modules.flatMap((module: { lessons: { id: string }[] }) => module.lessons.map((row) => row.id)),
      SEEDED_LESSONS.map((lesson) => lesson.id),
    );
    assert.deepEqual(summary.body.quizzes, [
      { lessonId: SEEDED_QUIZ_LESSON_ID, title: SEEDED_LESSONS[1]!.title, best: { correct: 5, total: 5 } },
    ]);
    assert.equal(summary.body.goalCheck, null, "A Course without a Goal Check summarises as before.");
  } finally {
    await t.app.close();
  }
});

test("Another Learner gets 404 for the Course, its Progress, its summary, and its Quiz attempts, and changes nothing", async () => {
  const t = await testApp();
  try {
    const item = t.quizBody.items[0]!;
    assert.equal((await t.answer(item.id, item.correctOptionId)).status, 200);
    assert.equal((await t.complete(SEEDED_READING_LESSON_ID)).status, 200);
    const owner = t.state.learner;
    const before = (await t.study()).body;

    t.state.learner = { ...owner, id: randomUUID(), authUserId: randomUUID() };
    const calls = [
      t.study(), t.summary(), t.complete(SEEDED_READING_LESSON_ID), t.sequenceMode("free_jump"),
      t.quiz(), t.answer(item.id, item.correctOptionId), t.check(item.id), t.submit(), t.retake(),
    ];
    for (const response of await Promise.all(calls)) {
      assert.equal(response.status, 404, JSON.stringify(response.body));
      assert.deepEqual(response.body, { error: "Published Course not found." });
    }

    t.state.learner = owner;
    assert.deepEqual((await t.study()).body, before, "The owner's Course, Progress, and Sequence mode are unchanged.");
    assert.equal((await t.quiz()).status, 200);
  } finally {
    await t.app.close();
  }
});

test("Opening a glossary word answers 200 only for a word in that Reading's glossary, and 400 without a term (SEN-48)", async () => {
  const base = memoryStore(SEEDED_QUIZ_BODY);
  const store: StudyStore = {
    ...base,
    async listLessons(courseId) {
      return (await base.listLessons(courseId)).map((lesson) => lesson.id === SEEDED_READING_LESSON_ID
        ? { ...lesson, body: { ...(lesson.body as object), glossary: [{ term: "Yggdrasil", definition: "The tree at the centre of the Norse worlds." }] } }
        : lesson);
    },
  };
  const app = Fastify();
  app.decorate("db", {} as Database);
  app.addHook("onRequest", async (request) => {
    request.currentLearner = learnerWith();
  });
  await app.register(studyRoutes, { store });
  const open = (lessonId: string, payload: object) =>
    app.inject({ method: "POST", url: `/api/courses/${SEEDED_COURSE_ID}/lessons/${lessonId}/glossary-opens`, payload });

  assert.equal((await open(SEEDED_READING_LESSON_ID, { term: "yggdrasil" })).statusCode, 200, "Case does not matter.");
  assert.equal((await open(SEEDED_READING_LESSON_ID, { term: "Bifrost" })).statusCode, 404);
  assert.equal((await open(SEEDED_QUIZ_LESSON_ID, { term: "Yggdrasil" })).statusCode, 404, "Another Lesson's glossary does not count.");
  assert.equal((await open(SEEDED_READING_LESSON_ID, {})).statusCode, 400);
  assert.equal((await open(randomUUID(), { term: "Yggdrasil" })).statusCode, 404);
});

test("Opening the Course's Words page answers 200 for the Learner's Course and 404 for another (decision 2026-11-03)", async () => {
  const app = Fastify();
  app.decorate("db", {} as Database);
  app.addHook("onRequest", async (request) => {
    request.currentLearner = learnerWith();
  });
  await app.register(studyRoutes, { store: memoryStore(SEEDED_QUIZ_BODY) });
  try {
    assert.equal((await app.inject({ method: "POST", url: `/api/courses/${SEEDED_COURSE_ID}/words-opens` })).statusCode, 200);
    assert.equal((await app.inject({ method: "POST", url: `/api/courses/${randomUUID()}/words-opens` })).statusCode, 404);
  } finally {
    await app.close();
  }
});

/**
 * Answers every Goal Check item, the first `correct` of them right, checking each (per-item timing is the default).
 * @param t - Test app
 * @param correct - How many items to answer correctly
 */
async function answerGoal(t: TestApp, correct: number) {
  for (const [index, item] of GOAL_CHECK_BODY.items.entries()) {
    const saved = await t.goal.answer(item.id, index < correct ? "a" : "b");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal((await t.goal.check(item.id)).status, 200);
  }
}

/**
 * Brings the fixture Course to "every Lesson but the Goal Check complete": the Reading, a passed Quiz, the follow-up.
 * @param t - Test app
 */
async function finishLessons(t: TestApp) {
  assert.equal((await t.complete(SEEDED_READING_LESSON_ID)).status, 200);
  await answerAll(t, 5, true);
  assert.equal((await t.submit()).body.quiz.passed, true);
  const last = await t.complete(SEEDED_FOLLOW_UP_LESSON_ID);
  assert.equal(last.status, 200);
  return last.body;
}

/** A test app whose Course ends with the Goal Check. */
function goalApp(answers: Record<string, unknown> = {}) {
  return testApp(answers, SEEDED_QUIZ_BODY, GOAL_CHECK_LESSON, false);
}

test("The Goal Check sits outside Progress, hides its key, and in linear order waits on every Reading before it (SEN-81, SEN-133)", async () => {
  const t = await goalApp();
  try {
    const fresh = await t.study();
    assert.deepEqual(fresh.body.progress, { completed: 0, total: 2 }, "Neither the Goal Check nor the Quiz is counted.");
    const goal = lessonIn(fresh.body, GOAL_CHECK_LESSON_ID);
    assert.equal(goal.locked, true);
    assert.ok(!JSON.stringify(fresh.body).includes("correctOptionId"));
    assert.deepEqual((goal.body as { items: unknown[] }).items.length, 6);
    assert.equal((await t.goal.get()).status, 403, "Locked in linear order until every Reading is read.");

    const last = await finishLessons(t);
    assert.deepEqual(last.progress, { completed: 2, total: 2 });
    assert.equal(last.course.completedAt, null, "The Course waits on the Goal Check.");
    assert.equal(last.currentLessonId, GOAL_CHECK_LESSON_ID);
    assert.equal(lessonIn(last, GOAL_CHECK_LESSON_ID).locked, false);
    const shown = await t.goal.get();
    assert.equal(shown.status, 200);
    assert.equal(shown.body.quiz.passed, false);
    assert.ok(!("goal" in shown.body.quiz), "No result before the first Submit.");
    assert.equal((await t.goal.feedback({ reasons: ["too_basic"] })).status, 409, "No feedback before a result.");
    assert.equal((await t.complete(GOAL_CHECK_LESSON_ID)).status, 400, "Cannot be marked complete before a Submit.");
  } finally {
    await t.app.close();
  }
});

test("The Goal Check completes the Course on its first scored attempt, whatever the score; a retake keeps the best (SEN-81)", async () => {
  const t = await goalApp();
  try {
    await finishLessons(t);
    await answerGoal(t, 1);
    const first = await t.goal.submit();
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.quiz.attempt.score, { correct: 1, total: 6 });
    assert.equal(first.body.quiz.passed, true, "Passed means it has a scored attempt.");
    assert.equal(first.body.quiz.goal.outcome, "not_met");
    assert.equal(lessonIn(first.body.study, GOAL_CHECK_LESSON_ID).completed, true);
    assert.deepEqual(first.body.study.progress, { completed: 2, total: 2 }, "Progress still leaves it out.");
    const completedAt = first.body.study.course.completedAt;
    assert.ok(completedAt, "The Course completes with the Goal Check's first Submit.");

    // 3/6 is exactly 50%: partly met. 4/6 is 67%: still partly met. 5/6 is 83%: met.
    for (const [correct, outcome] of [[3, "partly_met"], [4, "partly_met"], [5, "met"]] as const) {
      await t.goal.retake();
      await answerGoal(t, correct);
      const next = await t.goal.submit();
      assert.equal(next.body.quiz.goal.outcome, outcome, `${correct}/6`);
      assert.deepEqual(next.body.quiz.goal.best, { correct, total: 6 });
    }
    await t.goal.retake();
    await answerGoal(t, 0);
    const worse = await t.goal.submit();
    assert.deepEqual(worse.body.quiz.best, { correct: 5, total: 6 });
    assert.equal(worse.body.quiz.goal.outcome, "met", "The result is on the best attempt.");
    assert.equal(worse.body.study.course.completedAt, completedAt, "The first completion time is kept.");

    const summary = await t.summary();
    assert.equal(summary.status, 200);
    assert.deepEqual(summary.body.goalCheck, {
      lessonId: GOAL_CHECK_LESSON_ID,
      result: {
        outcome: "met",
        best: { correct: 5, total: 6 },
        missedObjectives: [{ objective: "Pick the right job for a square knot", lessonIds: [SEEDED_FOLLOW_UP_LESSON_ID] }],
      },
    });
    assert.deepEqual(summary.body.quizzes.map((row: { lessonId: string }) => row.lessonId), [SEEDED_QUIZ_LESSON_ID], "The Goal Check is not a Quiz row.");
  } finally {
    await t.app.close();
  }
});

test("Not met: missed objectives in slot order with their Lessons, then feedback and a next step (SEN-81)", async () => {
  const t = await goalApp();
  const recorded = recordProductEvents();
  try {
    await finishLessons(t);
    await answerGoal(t, 2);
    const submitted = await t.goal.submit();
    assert.deepEqual(submitted.body.quiz.goal, {
      outcome: "not_met",
      best: { correct: 2, total: 6 },
      missedObjectives: [
        { objective: "Pick the right job for a square knot", lessonIds: [SEEDED_FOLLOW_UP_LESSON_ID] },
        { objective: "Spot a granny knot", lessonIds: [SEEDED_QUIZ_LESSON_ID] },
      ],
      feedback: null,
    });

    assert.equal((await t.goal.nextStep("nothing")).status, 409, "No next step before feedback.");
    assert.equal((await t.goal.feedback({ reasons: [] })).status, 400);
    assert.equal((await t.goal.feedback({ reasons: ["too_basic", "too_basic"] })).status, 400);
    assert.equal((await t.goal.feedback({ reasons: ["other"] })).status, 400, "Something else needs words.");
    assert.equal((await t.goal.feedback({ reasons: ["bored"] })).status, 400);
    assert.equal((await t.goal.feedback({ reasons: ["too_basic"] }, SEEDED_QUIZ_LESSON_ID)).status, 404, "A Quiz has no Goal Check feedback.");
    assert.equal((await t.goal.feedback({ reasons: ["too_basic"] }, randomUUID())).status, 404);

    const sent = await t.goal.feedback({ reasons: ["missing_topic", "other"], otherText: "  Knots for climbing  " });
    assert.equal(sent.status, 200);
    assert.deepEqual(sent.body, { feedback: { reasons: ["missing_topic", "other"], otherText: "Knots for climbing", nextStep: null } });

    assert.equal((await t.goal.nextStep("more_lessons")).status, 400);
    const chosen = await t.goal.nextStep("new_course");
    assert.equal(chosen.status, 200);
    const href = new URL(chosen.body.newCourseHref, "http://x");
    assert.equal(href.pathname, "/new-course-request");
    assert.equal(href.searchParams.get("subject"), SEEDED_COURSE.subject);
    assert.equal(href.searchParams.get("topic"), "Pick the right job for a square knot; Spot a granny knot; Knots for climbing");
    assert.equal(chosen.body.nextStep, "new_course");
    assert.equal((await t.goal.get()).body.quiz.goal.feedback.nextStep, "new_course");
    assert.deepEqual((await t.goal.nextStep("nothing")).body, { nextStep: "nothing", newCourseHref: null });

    await t.goal.feedback({ reasons: ["too_advanced"] });
    assert.deepEqual((await t.goal.get()).body.quiz.goal.feedback, { reasons: ["too_advanced"], otherText: null, nextStep: null },
      "Sending again replaces the reasons and clears the next step.");

    await settled();
    const where = { courseId: SEEDED_COURSE_ID, lessonId: GOAL_CHECK_LESSON_ID };
    assert.equal(recorded.of("goal_check_answer_checked").length, 6);
    assert.deepEqual(recorded.of("goal_check_submitted").map((event) => event.detail), [
      { ...where, correct: 2, total: 6, outcome: "not_met", feedbackTiming: "per_item" },
    ]);
    assert.equal(recorded.of("quiz_submitted").length, 1, "Only the Quiz's own Submit is a quiz event.");
    assert.equal(recorded.of("quiz_answer_checked").length, 5);
    assert.deepEqual(recorded.of("goal_check_feedback_given").map((event) => event.detail), [
      { ...where, reasons: ["missing_topic", "other"], hasOtherText: true },
      { ...where, reasons: ["too_advanced"], hasOtherText: false },
    ]);
    assert.deepEqual(recorded.of("goal_check_next_step_chosen").map((event) => event.detail), [
      { ...where, nextStep: "new_course" },
      { ...where, nextStep: "nothing" },
    ]);

    await t.goal.retake();
    await answerGoal(t, 6);
    await t.goal.submit();
    await settled();
    assert.deepEqual(recorded.of("goal_check_retaken").map((event) => event.detail), [{ ...where, lastCorrect: 2, lastTotal: 6 }]);
    assert.equal((await t.goal.feedback({ reasons: ["too_basic"] })).status, 409, "Feedback is only for not met.");
    assert.equal((await t.goal.nextStep("nothing")).status, 409);
  } finally {
    recorded.uninstall();
    await t.app.close();
  }
});
