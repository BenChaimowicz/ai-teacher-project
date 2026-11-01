import { sql } from "drizzle-orm";
import { createDb, loadRootEnv } from "./index.ts";

/** Tables whose rows make a Learner worth keeping: anything the Learner made or did. */
const OWNED_TABLES = [
  "course_requests",
  "starting_level_diagnostics",
  "course_blueprints",
  "generation_jobs",
  "published_courses",
  "lesson_completions",
  "course_completions",
  "quiz_attempts",
] as const;

/** Usage tables that only record what a Learner's calls cost; an empty Learner's rows move with the account. */
const USAGE_TABLES = ["pipeline_events", "product_events", "api_requests"] as const;

/**
 * Hands the one unclaimed Learner (the prototype's seeded Learner) and everything it owns to the account signed up with
 * `email` (ADR 0026). If that account already made its own Learner on its first call, that Learner must own nothing:
 * its usage rows move to the claimed Learner and it is deleted.
 * Usage: `pnpm db:claim-learner <email>`
 */
async function claimLearner() {
  loadRootEnv(import.meta.url, 3);
  const email = process.argv[2]?.trim();
  if (!email) throw new Error("Pass the account's email: pnpm db:claim-learner <email>");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing. Copy .env.example to .env.");

  const db = createDb(process.env.DATABASE_URL, { max: 1 });
  await db.transaction(async (tx) => {
    const users = await tx.execute<{ id: string }>(sql`select id from auth.users where lower(email) = lower(${email})`);
    const user = users[0];
    if (!user) throw new Error(`No Supabase account has email ${email}. Sign up first.`);

    const unclaimed = await tx.execute<{ id: string; display_name: string }>(
      sql`select id, display_name from learners where auth_user_id is null for update`,
    );
    if (unclaimed.length !== 1) {
      throw new Error(`Expected exactly one unclaimed Learner, found ${unclaimed.length}.`);
    }
    const seeded = unclaimed[0]!;

    const existing = await tx.execute<{ id: string }>(sql`select id from learners where auth_user_id = ${user.id}`);
    const own = existing[0];
    if (own) {
      for (const table of OWNED_TABLES) {
        const rows = await tx.execute(sql`select 1 from ${sql.identifier(table)} where learner_id = ${own.id} limit 1`);
        if (rows.length > 0) {
          throw new Error(`${email} already has a Learner that owns rows in ${table}. Nothing was changed.`);
        }
      }
      for (const table of USAGE_TABLES) {
        await tx.execute(sql`update ${sql.identifier(table)} set learner_id = ${seeded.id} where learner_id = ${own.id}`);
      }
      await tx.execute(sql`delete from learners where id = ${own.id}`);
    }

    await tx.execute(sql`update learners set auth_user_id = ${user.id} where id = ${seeded.id}`);
    console.log(`Learner ${seeded.id} (${seeded.display_name}) now belongs to ${email}.`);
  });
}

try {
  await claimLearner();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[claim-learner.ts: claimLearner] Failed to claim the seeded Learner || ${message}`);
  process.exit(1);
}

process.exit(0);
