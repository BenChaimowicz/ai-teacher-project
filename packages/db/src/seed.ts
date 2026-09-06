import { eq } from "drizzle-orm";
import { createDb, loadRootEnv, SEEDED_LEARNER_ID, learners } from "./index.ts";

/**
 * Inserts the prototype's single Learner if that row is missing.
 */
async function seedLearner() {
  try {
    loadRootEnv(import.meta.url, 3);

    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");
    }

    const db = createDb(url, { max: 1 });

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

await seedLearner();
process.exit(0);
