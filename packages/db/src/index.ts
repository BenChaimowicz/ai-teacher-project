import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/** Drizzle client bound to this package's schema. */
export type Database = ReturnType<typeof createDb>;

/** The handle a `Database.transaction` callback receives. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Connections a pool opens at most, unless `createDb` is told otherwise. */
export const DEFAULT_POOL_SIZE = 10;

/**
 * Opens a Postgres connection for Drizzle. `prepare` is off so Supabase's pooler works.
 * @param url - `DATABASE_URL`
 * @param options.max - Connection pool size
 * @returns A Drizzle database
 */
export function createDb(url: string, options?: { max?: number }) {
  try {
    const client = postgres(url, {
      max: options?.max ?? DEFAULT_POOL_SIZE,
      prepare: false,
    });
    return drizzle(client, { schema });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[index.ts: createDb] Failed to create Drizzle client || ${message}`);
  }
}

/**
 * Opens `connections` pool connections up front, so the first requests after startup don't each pay connection setup
 * (TCP, TLS and auth to the pooler, several round trips). Parallel queries on a fresh pool open one connection each.
 * @param db - Drizzle client
 * @param connections - How many to open; the pool's size fills it
 * @throws Error if the database can't be reached
 */
export async function warmDb(db: Database, connections: number): Promise<void> {
  try {
    await Promise.all(Array.from({ length: connections }, () => db.execute(sql`select 1`)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[index.ts: warmDb] Failed to open database connections || connections=${connections} || ${message}`);
  }
}

export { schema };
export * from "./schema.ts";
export * from "./env.ts";
export * from "./teaching-profile.ts";
export * from "./progress.ts";
export * from "./fixture-course.ts";
export * from "./reading-lesson.ts";
export * from "./quiz.ts";
export * from "./sequence-mode.ts";
export * from "./seed-ids.ts";
export * from "./course-request.ts";
export * from "./starting-level.ts";
export * from "./blueprint.ts";
export * from "./lesson-checkpoint.ts";
export * from "./publication.ts";
export * from "./generation-job.ts";
export * from "./usage.ts";
