import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

/** Drizzle client bound to this package's schema. */
export type Database = ReturnType<typeof createDb>;

/**
 * Opens a Postgres connection for Drizzle. `prepare` is off so Supabase's pooler works.
 * @param url - `DATABASE_URL`
 * @param options.max - Connection pool size
 * @returns A Drizzle database
 */
export function createDb(url: string, options?: { max?: number }) {
  try {
    const client = postgres(url, {
      max: options?.max ?? 10,
      prepare: false,
    });
    return drizzle(client, { schema });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[index.ts: createDb] Failed to create Drizzle client || ${message}`);
  }
}

export { schema };
export * from "./schema.ts";
export * from "./env.ts";
export * from "./teaching-profile.ts";

/** Stable seed id for the prototype's single Learner. Runtime still loads "the only row". */
export const SEEDED_LEARNER_ID = "8f0c2e1a-4b3d-4a7c-9e12-6d5f8a90b1c3";
