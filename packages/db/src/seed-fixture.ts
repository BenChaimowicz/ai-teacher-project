import { eq } from "drizzle-orm";
import type { Database } from "./index.ts";
import { SEEDED_COURSE, SEEDED_COURSE_ID, SEEDED_LESSONS, SEEDED_MODULE } from "./fixture-course.ts";
import { learners, publishedCourses, publishedLessons, publishedModules } from "./schema.ts";
import { SEEDED_LEARNER_ID } from "./seed-ids.ts";

/**
 * Inserts the prototype's single Learner if that row is missing.
 * @param db - Drizzle client
 */
export async function seedLearner(db: Database) {
  try {
    await db
      .insert(learners)
      .values({ id: SEEDED_LEARNER_ID })
      .onConflictDoNothing({ target: learners.id });

    const [row] = await db.select().from(learners).where(eq(learners.id, SEEDED_LEARNER_ID)).limit(1);
    if (!row) {
      throw new Error("Seed Learner was not inserted.");
    }
    return row;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[seed-fixture.ts: seedLearner] Failed to seed Learner || id=${SEEDED_LEARNER_ID} || ${message}`);
  }
}

/**
 * Inserts the fixture published Course snapshot if those rows are missing, and fills fixture Lesson bodies.
 * @param db - Drizzle client
 */
export async function seedPublishedCourse(db: Database) {
  try {
    await db.insert(publishedCourses).values(SEEDED_COURSE).onConflictDoNothing({ target: publishedCourses.id });
    await db.insert(publishedModules).values(SEEDED_MODULE).onConflictDoNothing({ target: publishedModules.id });
    await db.insert(publishedLessons).values(SEEDED_LESSONS).onConflictDoNothing({ target: publishedLessons.id });

    for (const lesson of SEEDED_LESSONS) {
      await db
        .update(publishedLessons)
        .set({
          body: lesson.body,
          sources: lesson.sources,
          citations: lesson.citations,
          teachingMethod: lesson.teachingMethod,
        })
        .where(eq(publishedLessons.id, lesson.id));
    }

    const [course] = await db
      .select()
      .from(publishedCourses)
      .where(eq(publishedCourses.id, SEEDED_COURSE_ID))
      .limit(1);
    if (!course) {
      throw new Error("Seed published Course was not inserted.");
    }
    return course;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[seed-fixture.ts: seedPublishedCourse] Failed to seed published Course || id=${SEEDED_COURSE_ID} || ${message}`,
    );
  }
}
