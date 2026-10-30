import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import Fastify from "fastify";
import {
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
import type { QuizAttemptRow, StudyStore } from "../lib/study-store.ts";
import { studyRoutes } from "./study.ts";

/**
 * In-memory Study store holding the fixture Course.
 * @param quizBody - Body of the fixture's Quiz Lesson
 */
function memoryStore(quizBody: QuizBody): StudyStore {
  let sequenceMode: string = SEEDED_COURSE.sequenceMode;
  const completions = new Set<string>();
  let courseCompletedAt: Date | null = null;
  const attempts: (QuizAttemptRow & { lessonId: string })[] = [];
  return {
    async findCourse(learnerId, courseId) {
      if (learnerId !== SEEDED_LEARNER_ID || courseId !== SEEDED_COURSE_ID) return null;
      return { id: SEEDED_COURSE_ID, title: SEEDED_COURSE.title, learningGoal: SEEDED_COURSE.learningGoal, sequenceMode };
    },
    async listModules() {
      return [{ id: SEEDED_MODULE.id, title: SEEDED_MODULE.title, position: SEEDED_MODULE.position }];
    },
    async listLessons() {
      return SEEDED_LESSONS.map((lesson) => ({ ...lesson, ...(lesson.id === SEEDED_QUIZ_LESSON_ID ? { body: quizBody } : {}) }));
    },
    async completedLessonIds() {
      return new Set(completions);
    },
    async insertCompletion(_learnerId, lessonId) {
      completions.add(lessonId);
    },
    async setSequenceMode(_courseId, mode) {
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
    async updateQuizAttempt(id, patch) {
      const row = attempts.find((attempt) => attempt.id === id);
      if (!row) throw new Error("No attempt");
      const { submittedAt: _submittedAt, ...rest } = patch;
      Object.assign(row, structuredClone(rest));
    },
  };
}

/** The fixture Learner with a saved Teaching Profile built from `answers`. */
function learnerWith(answers: Record<string, unknown> = {}): typeof learners.$inferSelect {
  return {
    id: SEEDED_LEARNER_ID,
    createdAt: new Date(),
    teachingProfileVersion: TEACHING_PROFILE_VERSION,
    teachingProfileAnswers: parseTeachingProfileAnswers(answers),
    teachingProfileAssessedAt: new Date(),
    teachingProfileUpdatedAt: new Date(),
  };
}

/** Real Study handlers over the in-memory store. `state.learner` can change between requests. */
async function testApp(answers: Record<string, unknown> = {}, quizBody: QuizBody = SEEDED_QUIZ_BODY) {
  const state = { learner: learnerWith(answers) };
  const app = Fastify();
  app.decorate("db", {} as Database);
  app.addHook("onRequest", async (request) => {
    request.currentLearner = state.learner;
  });
  await app.register(studyRoutes, { store: memoryStore(quizBody) });

  const base = `/api/courses/${SEEDED_COURSE_ID}`;
  const quiz = `${base}/lessons/${SEEDED_QUIZ_LESSON_ID}/quiz`;
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

test("Study never sends the Quiz answer key, and linear locks the Lesson after the unpassed Quiz", async () => {
  const t = await testApp();
  try {
    const { status, body } = await t.study();
    assert.equal(status, 200);
    const raw = JSON.stringify(body);
    assert.ok(!raw.includes("correctOptionId"));
    assert.ok(!raw.includes("explanations"));
    assert.equal(lessonIn(body, SEEDED_QUIZ_LESSON_ID).locked, false);
    assert.equal(lessonIn(body, SEEDED_READING_LESSON_ID).locked, false);
    assert.equal(lessonIn(body, SEEDED_FOLLOW_UP_LESSON_ID).locked, true);
    assert.equal((await t.complete(SEEDED_FOLLOW_UP_LESSON_ID)).status, 403);
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

test("Fail, retake, pass: best score is kept, Progress never drops, and the next Lesson unlocks", async () => {
  const t = await testApp();
  try {
    await answerAll(t, 3, true);
    const failed = await t.submit();
    assert.equal(failed.status, 200);
    assert.deepEqual(failed.body.quiz.attempt.score, { correct: 3, total: 5 });
    assert.equal(failed.body.quiz.passed, false);
    assert.equal(lessonIn(failed.body.study, SEEDED_FOLLOW_UP_LESSON_ID).locked, true);
    assert.equal((await t.answer("q1", "a")).status, 409, "After Submit the Learner must Retake.");

    const retake = await t.retake();
    assert.equal(retake.body.quiz.attempt.status, "draft");
    assert.deepEqual(retake.body.quiz.attempt.answers, {});
    assert.deepEqual(retake.body.quiz.best, { correct: 3, total: 5 });

    await answerAll(t, 4, true);
    const passed = await t.submit();
    assert.equal(passed.body.quiz.passed, true);
    assert.deepEqual(passed.body.study.progress, { completed: 1, total: 3 });
    assert.equal(lessonIn(passed.body.study, SEEDED_QUIZ_LESSON_ID).completed, true);
    assert.equal(lessonIn(passed.body.study, SEEDED_FOLLOW_UP_LESSON_ID).locked, false);

    await t.retake();
    await answerAll(t, 1, true);
    const worse = await t.submit();
    assert.deepEqual(worse.body.quiz.attempt.score, { correct: 1, total: 5 });
    assert.deepEqual(worse.body.quiz.best, { correct: 4, total: 5 });
    assert.equal(worse.body.quiz.passed, true);
    assert.deepEqual(worse.body.study.progress, { completed: 1, total: 3 });
  } finally {
    await t.app.close();
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

test("Free jump is one-way and opens later Lessons; Progress still waits on a Quiz pass", async () => {
  const t = await testApp();
  try {
    assert.equal((await t.sequenceMode("sideways")).status, 400);
    const switched = await t.sequenceMode("free_jump");
    assert.equal(switched.status, 200);
    assert.equal(switched.body.course.sequenceMode, "free_jump");
    assert.equal(lessonIn(switched.body, SEEDED_FOLLOW_UP_LESSON_ID).locked, false);
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
            { id: "opt1", text: `World ${n}`, correct: true },
            ...["a", "b", "c"].map((letter, index) => ({ id: `opt${index + 2}`, text: `Not ${n}${letter}`, correct: false })),
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

test("Completing the last Lesson stores Course completion once; the summary shows what was covered and Quiz results", async () => {
  const t = await testApp();
  try {
    assert.equal((await t.summary()).status, 409, "No summary before the Course is complete.");

    const read = await t.complete(SEEDED_READING_LESSON_ID);
    assert.equal(read.body.course.completedAt, null);

    await answerAll(t, 3, true);
    await t.submit();
    await t.retake();
    await answerAll(t, 5, true);
    const passed = await t.submit();
    assert.equal(passed.body.study.course.completedAt, null, "One Lesson is still left.");

    const last = await t.complete(SEEDED_FOLLOW_UP_LESSON_ID);
    assert.equal(last.status, 200);
    assert.deepEqual(last.body.progress, { completed: 3, total: 3 });
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
  } finally {
    await t.app.close();
  }
});
