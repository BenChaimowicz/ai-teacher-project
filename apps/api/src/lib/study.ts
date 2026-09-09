import { and, asc, eq, inArray } from "drizzle-orm";
import {
  currentLessonId,
  lessonCompletions,
  publishedCourses,
  publishedLessons,
  publishedModules,
  studyPath,
  type Database,
} from "@senoy/db";

/** One Lesson in the Study list. */
export type StudyLessonListItem = {
  id: string;
  title: string;
  teachingMethod: string;
  position: number;
  lessonGoal: string;
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
  course: { id: string; title: string; sequenceMode: string };
  progress: { completed: number; total: number };
  currentLessonId: string;
  modules: StudyModule[];
};

/**
 * Loads Lessons in Course order and Progress for one published Course owned by this Learner.
 * @param db - Drizzle client
 * @param learnerId - Current Learner
 * @param courseId - Published Course id
 * @returns Study payload, or null when the Course is missing or not theirs
 */
export async function loadStudyCourse(
  db: Database,
  learnerId: string,
  courseId: string,
): Promise<StudyCoursePayload | null> {
  try {
    const [course] = await db
      .select({
        id: publishedCourses.id,
        title: publishedCourses.title,
        sequenceMode: publishedCourses.sequenceMode,
      })
      .from(publishedCourses)
      .where(and(eq(publishedCourses.id, courseId), eq(publishedCourses.learnerId, learnerId)))
      .limit(1);

    if (!course) return null;

    const moduleRows = await db
      .select({
        id: publishedModules.id,
        title: publishedModules.title,
        position: publishedModules.position,
      })
      .from(publishedModules)
      .where(eq(publishedModules.publishedCourseId, courseId))
      .orderBy(asc(publishedModules.position));

    const lessonRows = await db
      .select({
        id: publishedLessons.id,
        moduleId: publishedLessons.moduleId,
        title: publishedLessons.title,
        teachingMethod: publishedLessons.teachingMethod,
        position: publishedLessons.position,
        lessonGoal: publishedLessons.lessonGoal,
      })
      .from(publishedLessons)
      .where(eq(publishedLessons.publishedCourseId, courseId))
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
    const current = currentLessonId(lessonIds, completedIds);
    if (!current) return null;

    const lessonsByModule = new Map<string, StudyLessonListItem[]>();
    for (const row of lessonRows) {
      const item: StudyLessonListItem = {
        id: row.id,
        title: row.title,
        teachingMethod: row.teachingMethod,
        position: row.position,
        lessonGoal: row.lessonGoal,
      };
      const list = lessonsByModule.get(row.moduleId) ?? [];
      list.push(item);
      lessonsByModule.set(row.moduleId, list);
    }

    return {
      course: { id: course.id, title: course.title, sequenceMode: course.sequenceMode },
      progress: { completed: completedIds.size, total: lessonIds.length },
      currentLessonId: current,
      modules: moduleRows.map((row) => ({
        id: row.id,
        title: row.title,
        position: row.position,
        lessons: lessonsByModule.get(row.id) ?? [],
      })),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[study.ts: loadStudyCourse] Failed to load Study Course || courseId=${courseId} || ${message}`,
    );
  }
}

/** Library/Open items pointer into Study. */
export type CourseStudyLink = {
  href: string | null;
  completed: number;
  total: number;
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
      links.set(courseId, { href: null, completed: 0, total: 0 });
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
      links.set(courseId, {
        href: current ? studyPath(courseId, current) : null,
        completed,
        total: ordered.length,
      });
    }

    return links;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[study.ts: studyLinksByCourseId] Failed to resolve Study links || ${message}`);
  }
}
