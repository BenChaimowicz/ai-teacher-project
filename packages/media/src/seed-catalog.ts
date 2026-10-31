import { eq } from "drizzle-orm";
import { mediaDescriptors, type Database, type MediaDescriptorFields } from "@senoy/db";
import type { ResolvedCatalogEntry } from "./catalog.ts";
import type { MediaStorage } from "./storage.ts";

/** What one seed run did, per file, so a second run can be seen to do nothing. */
export type SeedOutcome = {
  /** Keys whose bytes were uploaded because the bucket had no object or a different digest. */
  uploaded: string[];
  /** Keys whose bytes were already in the bucket unchanged. */
  unchangedBytes: string[];
  /** Ids whose descriptor row was inserted or rewritten because the catalog differs from the database. */
  written: string[];
  /** Ids whose descriptor row already matched the catalog. */
  unchangedDescriptors: string[];
};

/**
 * Whether a file must be uploaded: there is no object under its key, or the object's recorded digest is not the
 * catalog's. An object with no recorded digest counts as different, so a file put there by hand is replaced.
 * @param descriptor - The catalog's descriptor
 * @param stored - What `MediaStorage.head` returned for its key
 */
export function needsUpload(descriptor: MediaDescriptorFields, stored: { sha256: string | null } | null): boolean {
  return stored === null || stored.sha256 !== descriptor.sha256;
}

/**
 * Whether the stored descriptor row differs from the catalog in any field the catalog owns. Timestamps are not
 * compared, so an unchanged catalog leaves `updated_at` alone. Objects are compared with their keys sorted, because
 * Postgres `jsonb` does not keep key order and would otherwise make every `source` look changed.
 * @param descriptor - The catalog's descriptor
 * @param stored - The row in the database, or undefined when there is none
 */
export function descriptorChanged(descriptor: MediaDescriptorFields, stored: MediaDescriptorFields | undefined): boolean {
  if (!stored) return true;
  const keys = Object.keys(descriptor) as (keyof MediaDescriptorFields)[];
  return keys.some((key) => canonical(descriptor[key]) !== canonical(stored[key]));
}

/**
 * JSON with object keys sorted at every level, so two values that mean the same thing serialise the same way.
 * @param value - Any JSON-serialisable value
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) => {
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      return Object.fromEntries(Object.entries(inner as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
    }
    return inner;
  });
}

/**
 * Puts the resolved catalog into the bucket and the database, uploading only bytes the bucket lacks and writing only
 * descriptor rows that differ. Running it twice in a row changes nothing the second time.
 * @param db - Drizzle client
 * @param storage - The private bucket
 * @param entries - The resolved catalog
 * @returns What was uploaded, written, or left alone
 */
export async function seedMediaCatalog(db: Database, storage: MediaStorage, entries: readonly ResolvedCatalogEntry[]): Promise<SeedOutcome> {
  const outcome: SeedOutcome = { uploaded: [], unchangedBytes: [], written: [], unchangedDescriptors: [] };

  for (const { descriptor, bytes } of entries) {
    const key = descriptor.storageKey;
    try {
      if (needsUpload(descriptor, await storage.head(key))) {
        await storage.put(key, bytes, descriptor.mimeType);
        outcome.uploaded.push(key);
      } else {
        outcome.unchangedBytes.push(key);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[seed-catalog.ts: seedMediaCatalog] Failed to seed media bytes || key=${key} || ${message}`);
    }

    try {
      const [stored] = await db.select().from(mediaDescriptors).where(eq(mediaDescriptors.id, descriptor.id)).limit(1);
      if (descriptorChanged(descriptor, stored && stripTimestamps(stored))) {
        await db
          .insert(mediaDescriptors)
          .values(descriptor)
          .onConflictDoUpdate({ target: mediaDescriptors.id, set: { ...descriptor, updatedAt: new Date() } });
        outcome.written.push(descriptor.id);
      } else {
        outcome.unchangedDescriptors.push(descriptor.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[seed-catalog.ts: seedMediaCatalog] Failed to seed a media descriptor || id=${descriptor.id} || ${message}`);
    }
  }

  return outcome;
}

/**
 * The catalog-owned fields of a stored row, for comparison.
 * @param row - A `media_descriptors` row
 */
function stripTimestamps(row: typeof mediaDescriptors.$inferSelect): MediaDescriptorFields {
  const { createdAt: _createdAt, updatedAt: _updatedAt, ...fields } = row;
  return fields;
}
