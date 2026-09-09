import { eq } from "drizzle-orm";
import {
  createDb,
  loadRootEnv,
  SEEDED_COURSE,
  SEEDED_COURSE_ID,
  SEEDED_LEARNER_ID,
  SEEDED_MODULE,
  SEEDED_QUIZ_LESSON,
  SEEDED_READING_LESSON,
  learners,
  publishedCourses,
  publishedLessons,
  publishedModules,
} from "./index.ts";

/**
 * Inserts the prototype's single Learner if that row is missing.
 * @param db - Drizzle client
 */
async function seedLearner(db: ReturnType<typeof createDb>) {
  try {
    await db
      .insert(learners)
      .values({ id: SEEDED_LEARNER_ID })
      .onConflictDoNothing({ target: learners.id });

    const [row] = await db.select().from(learners).where(eq(learners.id, SEEDED_LEARNER_ID)).limit(1);
    if (!row) {
      throw new Error("Seed Learner was not inserted.");
    }

    console.log(`Seeded Learner ${row.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[seed.ts: seedLearner] Failed to seed Learner || id=${SEEDED_LEARNER_ID} || ${message}`);
  }
}

/**
 * Inserts the fixture published Course snapshot if those rows are missing.
 * @param db - Drizzle client
 */
async function seedPublishedCourse(db: ReturnType<typeof createDb>) {
  try {
    await db.insert(publishedCourses).values(SEEDED_COURSE).onConflictDoNothing({ target: publishedCourses.id });
    await db.insert(publishedModules).values(SEEDED_MODULE).onConflictDoNothing({ target: publishedModules.id });
    await db
      .insert(publishedLessons)
      .values([SEEDED_READING_LESSON, SEEDED_QUIZ_LESSON])
      .onConflictDoNothing({ target: publishedLessons.id });

    const [course] = await db
      .select()
      .from(publishedCourses)
      .where(eq(publishedCourses.id, SEEDED_COURSE_ID))
      .limit(1);
    if (!course) {
      throw new Error("Seed published Course was not inserted.");
    }

    console.log(`Seeded published Course ${course.id}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[seed.ts: seedPublishedCourse] Failed to seed published Course || id=${SEEDED_COURSE_ID} || ${message}`,
    );
  }
}

try {
  loadRootEnv(import.meta.url, 3);

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
  }

  const db = createDb(url, { max: 1 });
  await seedLearner(db);
  await seedPublishedCourse(db);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`[seed.ts] Seed failed || ${message}`);
}

process.exit(0);
