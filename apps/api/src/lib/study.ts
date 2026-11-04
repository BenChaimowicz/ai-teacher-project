import { and, asc, eq, inArray, type SQLWrapper } from "drizzle-orm";
import {
  bestGoalCheckAttempt,
  bestQuizScore,
  canSwitchSequenceMode,
  courseCompletePath,
  courseCompletions,
  currentLessonId,
  flowLessonIds,
  GOAL_CHECK_METHOD_ID,
  goalCheckResult,
  isCourseComplete,
  lessonCompletions,
  lockedLessonIds,
  parseGoalCheckBody,
  parseNumberedSources,
  parseQuizAnswers,
  parseReadingBody,
  parseSequenceMode,
  progressLessonIds,
  publishedLessons,
  QUIZ_METHOD_ID,
  studyPath,
  type Database,
  type GoalCheckResult,
  type NumberedSource,
  type QuizScore,
  type SequenceMode,
} from "@senoy/db";
import { teachingMethodPlugin } from "../teaching-methods/index.ts";
import { submittedScores } from "../teaching-methods/quiz.ts";
import type { CourseRow, LessonRow, ModuleRow, QuizAttemptRow, StudyStore } from "./study-store.ts";
import { recordProductEvent } from "./usage-tracking.ts";

/** One Lesson in the Study list. */
export type StudyLessonListItem = {
  id: string;
  title: string;
  teachingMethod: string;
  position: number;
  lessonGoal: string;
  completed: boolean;
  /** Linear Sequence mode: a flow Lesson after an unread Reading, or a Quiz whose Readings are not all read (SEN-133). */
  locked: boolean;
  /** On a Quiz: the Readings it covers. Its "Take quiz" card sits after the last of them. Empty otherwise. */
  assessedLessonIds: string[];
  /** On a Quiz: this Learner's best submitted score, or null while it is not taken. Absent on other Lessons. */
  quizBest?: QuizScore | null;
  /** What the method's plugin lets the browser see. A Quiz body has no answer key. */
  body: unknown;
  citations: NumberedSource[];
};

/** One Module in the Study list. */
export type StudyModule = {
  id: string;
  title: string;
  position: number;
  lessons: StudyLessonListItem[];
};

/** Published Course payload for Study chrome. */
export type StudyCoursePayload = {
  /** `completedAt` is set once every Lesson is complete. */
  course: { id: string; title: string; learningGoal: string; sequenceMode: SequenceMode; completedAt: string | null };
  /** Readings only: Quizzes are optional and the Goal Check sits outside Progress (decisions 2026-11-04). */
  progress: { completed: number; total: number };
  currentLessonId: string;
  modules: StudyModule[];
};

/** A published Course with this Learner's completions and unlock state. */
export type CourseContext = {
  course: CourseRow;
  sequenceMode: SequenceMode;
  modules: ModuleRow[];
  lessons: LessonRow[];
  completedIds: Set<string>;
  lockedIds: Set<string>;
  /** When this Learner completed the Course, or null. */
  completedAt: Date | null;
  /** Best submitted score per Quiz this Learner has taken; a Quiz missing here is not taken. */
  quizBest: Map<string, QuizScore>;
};

/**
 * Loads a published Course owned by this Learner, with completions and locked Lessons.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 * @returns Context, or null when the Course is missing or not theirs
 */
export async function loadCourseContext(
  store: StudyStore,
  learnerId: string,
  courseId: string,
): Promise<CourseContext | null> {
  try {
    // Every read shares one round trip. Nothing read for a Course that isn't this Learner's is returned.
    const [course, modules, lessons, completedIds, completedAt, submitted] = await Promise.all([
      store.findCourse(learnerId, courseId),
      store.listModules(courseId),
      store.listLessons(courseId),
      store.completedLessonIds(learnerId, courseId),
      store.courseCompletedAt(learnerId, courseId),
      store.listSubmittedCourseAttempts(learnerId, courseId),
    ]);
    if (!course) return null;
    const sequenceMode = parseSequenceMode(course.sequenceMode);
    const lockedIds = lockedLessonIds(lessons, completedIds, sequenceMode);
    const quizBest = new Map<string, QuizScore>();
    for (const lessonId of new Set(submitted.map((row) => row.lessonId))) {
      const best = bestQuizScore(submittedScores(submitted.filter((row) => row.lessonId === lessonId)));
      if (best) quizBest.set(lessonId, best);
    }
    return { course, sequenceMode, modules, lessons, completedIds, lockedIds, completedAt, quizBest };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[study.ts: loadCourseContext] Failed to load Course context || courseId=${courseId} || ${message}`,
    );
  }
}

/**
 * Builds the Study payload from a loaded Course.
 * @param context - Course context
 * @returns Study payload, or null when the Course has no Lessons
 */
export function studyPayload(context: CourseContext): StudyCoursePayload | null {
  const { course, modules, lessons, completedIds, lockedIds, sequenceMode, completedAt, quizBest } = context;
  const current = currentLessonId(flowLessonIds(lessons), completedIds);
  if (!current) return null;

  const lessonsByModule = new Map<string, StudyLessonListItem[]>();
  for (const row of lessons) {
    const plugin = teachingMethodPlugin(row.teachingMethod);
    const quiz = row.teachingMethod === QUIZ_METHOD_ID;
    const item: StudyLessonListItem = {
      id: row.id,
      title: row.title,
      teachingMethod: row.teachingMethod,
      position: row.position,
      lessonGoal: row.lessonGoal,
      completed: completedIds.has(row.id),
      locked: lockedIds.has(row.id),
      assessedLessonIds: quiz ? row.assessedLessonIds ?? [] : [],
      ...(quiz ? { quizBest: quizBest.get(row.id) ?? null } : {}),
      body: plugin ? plugin.studyBody(row.body) : null,
      citations: parseNumberedSources(row.citations),
    };
    const list = lessonsByModule.get(row.moduleId) ?? [];
    list.push(item);
    lessonsByModule.set(row.moduleId, list);
  }

  return {
    course: { id: course.id, title: course.title, learningGoal: course.learningGoal, sequenceMode, completedAt: completedAt?.toISOString() ?? null },
    progress: progressCounts(lessons, completedIds),
    currentLessonId: current,
    modules: modules.map((row) => ({
      id: row.id,
      title: row.title,
      position: row.position,
      lessons: lessonsByModule.get(row.id) ?? [],
    })),
  };
}

/**
 * Progress counts: completed and total over the Readings.
 * @param lessons - Lessons of the Course
 * @param completedIds - This Learner's completed Lessons
 */
function progressCounts(
  lessons: readonly { id: string; teachingMethod: string }[],
  completedIds: ReadonlySet<string>,
): { completed: number; total: number } {
  const ids = progressLessonIds(lessons);
  return { completed: ids.filter((id) => completedIds.has(id)).length, total: ids.length };
}

/**
 * A Goal Check's result from this Learner's best scored attempt.
 * @param lesson - The Goal Check Lesson
 * @param attempts - Its stored attempts
 * @returns The result, or null before the first Submit or when the body is not a valid Goal Check
 */
export function goalCheckResultOf(lesson: LessonRow, attempts: readonly QuizAttemptRow[]): GoalCheckResult | null {
  const body = parseGoalCheckBody(lesson.body);
  if (!body) return null;
  const scored = attempts.flatMap((row) =>
    row.status === "submitted" && row.correct != null && row.total != null
      ? [{ row, score: { correct: row.correct, total: row.total } }]
      : [],
  );
  const best = bestGoalCheckAttempt(scored);
  if (!best) return null;
  return goalCheckResult(body, parseQuizAnswers(best.row.answers, body), lesson.objectives ?? [], lesson.objectiveLessonIds ?? {});
}

/**
 * Loads Lessons in Course order, unlock state, and Progress for one published Course owned by this Learner.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 * @returns Study payload, or null when the Course is missing or not theirs
 */
export async function loadStudyCourse(
  store: StudyStore,
  learnerId: string,
  courseId: string,
): Promise<StudyCoursePayload | null> {
  const context = await loadCourseContext(store, learnerId, courseId);
  return context ? studyPayload(context) : null;
}

/**
 * Records Course completion once every Lesson of the reading flow is complete: the Readings and the Goal Check, not the
 * Quizzes, which are optional (SEN-133). Call after a Lesson completion lands.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 */
export async function recordCourseCompletion(store: StudyStore, learnerId: string, courseId: string): Promise<void> {
  try {
    const [completedAt, lessons, completedIds] = await Promise.all([
      store.courseCompletedAt(learnerId, courseId),
      store.listLessons(courseId),
      store.completedLessonIds(learnerId, courseId),
    ]);
    if (completedAt) return;
    const lessonIds = flowLessonIds(lessons);
    if (isCourseComplete(lessonIds, completedIds)) {
      await store.insertCourseCompletion(learnerId, courseId);
      void recordProductEvent("course_completed", { learnerId, detail: { courseId, lessons: lessonIds.length } });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[study.ts: recordCourseCompletion] Failed to record Course completion || courseId=${courseId} || ${message}`,
    );
  }
}

/** One Quiz's result on the Course-complete screen. */
export type CourseSummaryQuiz = { lessonId: string; title: string; best: QuizScore | null };

/** What the Course-complete screen shows. */
export type CourseSummary = {
  course: { id: string; title: string; learningGoal: string; completedAt: string };
  modules: {
    id: string;
    title: string;
    lessons: { id: string; title: string; lessonGoal: string; teachingMethod: string }[];
  }[];
  quizzes: CourseSummaryQuiz[];
  /** The Course's Goal Check and its result on the best attempt; null on a Course without one (before SEN-81). */
  goalCheck: { lessonId: string; result: GoalCheckResult | null } | null;
};

/** Result of loading the Course-complete screen. */
export type CourseSummaryResult =
  | { ok: true; payload: CourseSummary }
  | { ok: false; status: 404 | 409; error: string };

/**
 * What a completed Course covered and the best score on each Quiz.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 */
export async function loadCourseSummary(
  store: StudyStore,
  learnerId: string,
  courseId: string,
): Promise<CourseSummaryResult> {
  try {
    const context = await loadCourseContext(store, learnerId, courseId);
    if (!context) return { ok: false, status: 404, error: "Published Course not found." };
    const { course, modules, lessons, completedAt } = context;
    if (!completedAt) return { ok: false, status: 409, error: "This Course is not complete yet." };

    const goalLesson = lessons.find((row) => row.teachingMethod === GOAL_CHECK_METHOD_ID) ?? null;
    const goalCheckPromise = goalLesson
      ? store.listQuizAttempts(learnerId, goalLesson.id).then((attempts) => ({
        lessonId: goalLesson.id,
        result: goalCheckResultOf(goalLesson, attempts),
      }))
      : Promise.resolve(null);
    const quizzesPromise: Promise<CourseSummaryQuiz[]> = Promise.all(
      lessons
        .filter((row) => row.teachingMethod === QUIZ_METHOD_ID)
        .map(async (row) => ({
          lessonId: row.id,
          title: row.title,
          best: bestQuizScore(submittedScores(await store.listQuizAttempts(learnerId, row.id))),
        })),
    );
    const [quizzes, goalCheck] = await Promise.all([quizzesPromise, goalCheckPromise]);

    return {
      ok: true,
      payload: {
        course: {
          id: course.id,
          title: course.title,
          learningGoal: course.learningGoal,
          completedAt: completedAt.toISOString(),
        },
        modules: modules.map((module) => ({
          id: module.id,
          title: module.title,
          lessons: lessons
            .filter((row) => row.moduleId === module.id)
            .map(({ id, title, lessonGoal, teachingMethod }) => ({ id, title, lessonGoal, teachingMethod })),
        })),
        quizzes,
        goalCheck,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[study.ts: loadCourseSummary] Failed to load Course summary || courseId=${courseId} || ${message}`);
  }
}

/** Library/Open items pointer into Study, or to the Course-complete screen once complete. */
export type CourseStudyLink = {
  href: string | null;
  completed: number;
  total: number;
  /** Stored Course completion; never derived from the counts. */
  courseCompleted: boolean;
};

/**
 * Study href at the Current Lesson for each published Course, plus Progress counts. Lessons with their completions and
 * the Course completions are two statements in one round trip, and the Courses are a subquery, so callers don't read
 * them first.
 * @param db - Drizzle client
 * @param learnerId - Current Learner
 * @param courseIds - Subquery selecting the published Course ids, e.g. `db.select({ id: publishedCourses.id })...`
 * @returns Links for the Courses that have Lessons or a completion; callers default the rest
 */
export async function studyLinksByCourseId(
  db: Database,
  learnerId: string,
  courseIds: SQLWrapper,
): Promise<Map<string, CourseStudyLink>> {
  try {
    const [lessonRows, courseCompletionRows] = await Promise.all([
      db
        .select({
          id: publishedLessons.id,
          publishedCourseId: publishedLessons.publishedCourseId,
          teachingMethod: publishedLessons.teachingMethod,
          completedLessonId: lessonCompletions.lessonId,
        })
        .from(publishedLessons)
        .leftJoin(lessonCompletions, and(eq(lessonCompletions.lessonId, publishedLessons.id), eq(lessonCompletions.learnerId, learnerId)))
        .where(inArray(publishedLessons.publishedCourseId, courseIds))
        .orderBy(asc(publishedLessons.position)),
      db
        .select({ courseId: courseCompletions.publishedCourseId })
        .from(courseCompletions)
        .where(and(eq(courseCompletions.learnerId, learnerId), inArray(courseCompletions.publishedCourseId, courseIds))),
    ]);
    const completedIds = new Set(lessonRows.flatMap((row) => (row.completedLessonId ? [row.completedLessonId] : [])));
    const completedCourseIds = new Set(courseCompletionRows.map((row) => row.courseId));

    const lessonsByCourse = new Map<string, { id: string; teachingMethod: string }[]>();
    for (const row of lessonRows) {
      const list = lessonsByCourse.get(row.publishedCourseId) ?? [];
      list.push({ id: row.id, teachingMethod: row.teachingMethod });
      lessonsByCourse.set(row.publishedCourseId, list);
    }

    const links = new Map<string, CourseStudyLink>();
    for (const courseId of new Set([...lessonsByCourse.keys(), ...completedCourseIds])) {
      const ordered = lessonsByCourse.get(courseId) ?? [];
      const { completed, total } = progressCounts(ordered, completedIds);
      const current = currentLessonId(flowLessonIds(ordered), completedIds);
      const courseCompleted = completedCourseIds.has(courseId);
      links.set(courseId, {
        href: courseCompleted ? courseCompletePath(courseId) : current ? studyPath(courseId, current) : null,
        completed,
        total,
        courseCompleted,
      });
    }

    return links;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[study.ts: studyLinksByCourseId] Failed to resolve Study links || ${message}`);
  }
}

/** Result of a Study write. */
export type StudyWriteResult =
  | { ok: true; payload: StudyCoursePayload }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

/** Copy when a linear Course blocks a Lesson. */
export const LOCKED_LESSON_ERROR = "This Lesson opens once you have read the Lessons before it.";

/**
 * Marks a Lesson complete through its Teaching-method plugin, and the Course once its last Lesson completes.
 * Locked Lessons cannot complete. Progress never drops.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 * @param lessonId - Lesson to complete
 */
export async function completeLesson(
  store: StudyStore,
  learnerId: string,
  courseId: string,
  lessonId: string,
): Promise<StudyWriteResult> {
  try {
    const context = await loadCourseContext(store, learnerId, courseId);
    if (!context) return { ok: false, status: 404, error: "Published Course not found." };

    const lesson = context.lessons.find((row) => row.id === lessonId);
    if (!lesson) return { ok: false, status: 404, error: "Lesson not found." };
    if (context.lockedIds.has(lesson.id)) return { ok: false, status: 403, error: LOCKED_LESSON_ERROR };

    const plugin = teachingMethodPlugin(lesson.teachingMethod);
    if (!plugin) {
      return { ok: false, status: 400, error: "This teaching method cannot be marked complete yet." };
    }

    const outcome = await plugin.complete(store, learnerId, lesson);
    if (!outcome.ok) return outcome;
    void recordProductEvent("lesson_completed", {
      learnerId, detail: { courseId, lessonId, teachingMethod: lesson.teachingMethod, title: lesson.title },
    });
    await recordCourseCompletion(store, learnerId, courseId);

    const payload = await loadStudyCourse(store, learnerId, courseId);
    if (!payload) return { ok: false, status: 404, error: "Published Course not found." };
    return { ok: true, payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[study.ts: completeLesson] Failed to complete Lesson || courseId=${courseId} || lessonId=${lessonId} || ${message}`,
    );
  }
}

/** What opening a glossary word returns: nothing on success, since it changes no Study state. */
export type GlossaryOpenResult = { ok: true } | { ok: false; status: 400 | 404; error: string };

/**
 * Records that the Learner opened one word's definition in a Reading (SEN-48). It writes no Study state, only the
 * product event, so the console sees which words Learners need. Only a word in that Lesson's glossary counts.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 * @param lessonId - The Reading
 * @param term - The glossary term opened, as the body spells it
 */
export async function openGlossaryTerm(
  store: StudyStore,
  learnerId: string,
  courseId: string,
  lessonId: string,
  term: unknown,
): Promise<GlossaryOpenResult> {
  try {
    if (typeof term !== "string" || !term.trim()) return { ok: false, status: 400, error: "term must be a word from the Lesson's glossary." };
    const context = await loadCourseContext(store, learnerId, courseId);
    if (!context) return { ok: false, status: 404, error: "Published Course not found." };
    const lesson = context.lessons.find((row) => row.id === lessonId);
    if (!lesson) return { ok: false, status: 404, error: "Lesson not found." };
    const entry = (parseReadingBody(lesson.body)?.glossary ?? []).find((row) => row.term.toLowerCase() === term.trim().toLowerCase());
    if (!entry) return { ok: false, status: 404, error: "That word is not in this Lesson's glossary." };
    void recordProductEvent("glossary_term_opened", { learnerId, detail: { courseId, lessonId, title: lesson.title, term: entry.term } });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[study.ts: openGlossaryTerm] Failed to record a glossary word || courseId=${courseId} || lessonId=${lessonId} || ${message}`,
    );
  }
}

/**
 * Records that the Learner opened the Course's Words page (decision 2026-11-03): every word its Readings defined, in one
 * list. It writes no Study state, only the product event, with how many words the page held.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 */
export async function openCourseWords(store: StudyStore, learnerId: string, courseId: string): Promise<GlossaryOpenResult> {
  try {
    const context = await loadCourseContext(store, learnerId, courseId);
    if (!context) return { ok: false, status: 404, error: "Published Course not found." };
    const terms = new Set(context.lessons.flatMap((row) => (parseReadingBody(row.body)?.glossary ?? []).map((entry) => entry.term.toLowerCase())));
    void recordProductEvent("course_words_opened", { learnerId, detail: { courseId, words: terms.size } });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[study.ts: openCourseWords] Failed to record the Words page || courseId=${courseId} || ${message}`);
  }
}

/**
 * Switches a Course's Sequence mode. Only linear → free jump; asking for the mode it already has is a no-op.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 * @param requested - Requested mode (unvalidated JSON)
 */
export async function switchSequenceMode(
  store: StudyStore,
  learnerId: string,
  courseId: string,
  requested: unknown,
): Promise<StudyWriteResult> {
  try {
    if (requested !== "linear" && requested !== "free_jump") {
      return { ok: false, status: 400, error: "Sequence mode must be linear or free_jump." };
    }
    const course = await store.findCourse(learnerId, courseId);
    if (!course) return { ok: false, status: 404, error: "Published Course not found." };

    const current = parseSequenceMode(course.sequenceMode);
    if (current !== requested) {
      if (!canSwitchSequenceMode(current, requested)) {
        return { ok: false, status: 409, error: "Linear order cannot be restored after switching to free jump." };
      }
      await store.setSequenceMode(learnerId, courseId, requested);
      void recordProductEvent("course_sequence_mode_changed", { learnerId, detail: { courseId, from: current, to: requested } });
    }

    const payload = await loadStudyCourse(store, learnerId, courseId);
    if (!payload) return { ok: false, status: 404, error: "Published Course not found." };
    return { ok: true, payload };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[study.ts: switchSequenceMode] Failed to switch Sequence mode || courseId=${courseId} || ${message}`,
    );
  }
}
