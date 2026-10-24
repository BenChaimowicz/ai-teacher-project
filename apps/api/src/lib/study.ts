import { and, asc, eq, inArray } from "drizzle-orm";
import {
  bestQuizScore,
  canSwitchSequenceMode,
  courseCompletePath,
  courseCompletions,
  currentLessonId,
  isCourseComplete,
  lessonCompletions,
  lockedLessonIds,
  parseNumberedSources,
  parseSequenceMode,
  publishedLessons,
  QUIZ_METHOD_ID,
  studyPath,
  type Database,
  type NumberedSource,
  type QuizScore,
  type SequenceMode,
} from "@senoy/db";
import { teachingMethodPlugin } from "../teaching-methods/index.ts";
import { submittedScores } from "../teaching-methods/quiz.ts";
import type { CourseRow, LessonRow, ModuleRow, StudyStore } from "./study-store.ts";
import { recordProductEvent } from "./usage-tracking.ts";

/** One Lesson in the Study list. */
export type StudyLessonListItem = {
  id: string;
  title: string;
  teachingMethod: string;
  position: number;
  lessonGoal: string;
  completed: boolean;
  /** Linear Sequence mode: after a Quiz that is not passed yet. */
  locked: boolean;
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
  course: { id: string; title: string; sequenceMode: SequenceMode; completedAt: string | null };
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
    const course = await store.findCourse(learnerId, courseId);
    if (!course) return null;
    const modules = await store.listModules(courseId);
    const lessons = await store.listLessons(courseId);
    const completedIds = await store.completedLessonIds(
      learnerId,
      lessons.map((row) => row.id),
    );
    const sequenceMode = parseSequenceMode(course.sequenceMode);
    const lockedIds = lockedLessonIds(lessons, completedIds, sequenceMode);
    const completedAt = await store.courseCompletedAt(learnerId, courseId);
    return { course, sequenceMode, modules, lessons, completedIds, lockedIds, completedAt };
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
  const { course, modules, lessons, completedIds, lockedIds, sequenceMode, completedAt } = context;
  const current = currentLessonId(
    lessons.map((row) => row.id),
    completedIds,
  );
  if (!current) return null;

  const lessonsByModule = new Map<string, StudyLessonListItem[]>();
  for (const row of lessons) {
    const plugin = teachingMethodPlugin(row.teachingMethod);
    const item: StudyLessonListItem = {
      id: row.id,
      title: row.title,
      teachingMethod: row.teachingMethod,
      position: row.position,
      lessonGoal: row.lessonGoal,
      completed: completedIds.has(row.id),
      locked: lockedIds.has(row.id),
      body: plugin ? plugin.studyBody(row.body) : null,
      citations: parseNumberedSources(row.citations),
    };
    const list = lessonsByModule.get(row.moduleId) ?? [];
    list.push(item);
    lessonsByModule.set(row.moduleId, list);
  }

  return {
    course: { id: course.id, title: course.title, sequenceMode, completedAt: completedAt?.toISOString() ?? null },
    progress: { completed: completedIds.size, total: lessons.length },
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
 * Records Course completion once every Lesson is complete. Call after a Lesson completion lands.
 * @param store - Study store
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 */
export async function recordCourseCompletion(store: StudyStore, learnerId: string, courseId: string): Promise<void> {
  try {
    if (await store.courseCompletedAt(learnerId, courseId)) return;
    const lessonIds = (await store.listLessons(courseId)).map((row) => row.id);
    const completedIds = await store.completedLessonIds(learnerId, lessonIds);
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

    const quizzes: CourseSummaryQuiz[] = [];
    for (const row of lessons) {
      if (row.teachingMethod !== QUIZ_METHOD_ID) continue;
      const best = bestQuizScore(submittedScores(await store.listQuizAttempts(learnerId, row.id)));
      quizzes.push({ lessonId: row.id, title: row.title, best });
    }

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
 * Study href at the Current Lesson for each published Course, plus Progress counts.
 * @param db - Drizzle client
 * @param learnerId - Current Learner
 * @param courseIds - Published Course ids
 */
export async function studyLinksByCourseId(
  db: Database,
  learnerId: string,
  courseIds: string[],
): Promise<Map<string, CourseStudyLink>> {
  try {
    const links = new Map<string, CourseStudyLink>();
    for (const courseId of courseIds) {
      links.set(courseId, { href: null, completed: 0, total: 0, courseCompleted: false });
    }
    if (courseIds.length === 0) return links;

    const lessonRows = await db
      .select({
        id: publishedLessons.id,
        publishedCourseId: publishedLessons.publishedCourseId,
        position: publishedLessons.position,
      })
      .from(publishedLessons)
      .where(inArray(publishedLessons.publishedCourseId, courseIds))
      .orderBy(asc(publishedLessons.position));

    const lessonIds = lessonRows.map((row) => row.id);
    const completedRows =
      lessonIds.length === 0
        ? []
        : await db
            .select({ lessonId: lessonCompletions.lessonId })
            .from(lessonCompletions)
            .where(and(eq(lessonCompletions.learnerId, learnerId), inArray(lessonCompletions.lessonId, lessonIds)));
    const completedIds = new Set(completedRows.map((row) => row.lessonId));

    const courseCompletionRows = await db
      .select({ courseId: courseCompletions.publishedCourseId })
      .from(courseCompletions)
      .where(and(eq(courseCompletions.learnerId, learnerId), inArray(courseCompletions.publishedCourseId, courseIds)));
    const completedCourseIds = new Set(courseCompletionRows.map((row) => row.courseId));

    const lessonsByCourse = new Map<string, string[]>();
    for (const row of lessonRows) {
      const list = lessonsByCourse.get(row.publishedCourseId) ?? [];
      list.push(row.id);
      lessonsByCourse.set(row.publishedCourseId, list);
    }

    for (const courseId of courseIds) {
      const ordered = lessonsByCourse.get(courseId) ?? [];
      const completed = ordered.filter((id) => completedIds.has(id)).length;
      const current = currentLessonId(ordered, completedIds);
      const courseCompleted = completedCourseIds.has(courseId);
      links.set(courseId, {
        href: courseCompleted ? courseCompletePath(courseId) : current ? studyPath(courseId, current) : null,
        completed,
        total: ordered.length,
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
export const LOCKED_LESSON_ERROR = "This Lesson is locked until you pass the Quiz before it.";

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
      await store.setSequenceMode(courseId, requested);
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
