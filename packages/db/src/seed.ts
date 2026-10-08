import { createDb, loadRootEnv } from "./index.ts";
import { seedLearner, seedPublishedCourse } from "./seed-fixture.ts";

try {
  loadRootEnv(import.meta.url, 3);

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
  }

  const db = createDb(url, { max: 1 });
  const learner = await seedLearner(db);
  console.log(`Seeded Learner ${learner.id}`);
  const course = await seedPublishedCourse(db);
  console.log(`Seeded published Course ${course.id}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  throw new Error(`[seed.ts] Seed failed || ${message}`);
}

process.exit(0);
