import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { publishedLessons, STORAGE_KEY_PATTERN, type Database } from "@senoy/db";
import { createMediaStorage, mediaStorageConfigFromEnv, type MediaStorage } from "@senoy/media";

/**
 * Sent with every SVG: opened on its own, it may draw and style itself and do nothing else. The seed and the Reading
 * both refuse an SVG with scripts or remote references (SEN-47, SEN-115); this keeps a missed one inert.
 */
export const SVG_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; sandbox";

/** Dependencies of the media route; tests inject both. */
export type MediaRouteOptions = {
  /** Whether a published Lesson shows the file at this storage key; defaults to {@link publishedLessonShows}. */
  published?: (storageKey: string) => Promise<boolean>;
  /** The private bucket; defaults to the one the env keys name, opened on the first request. */
  storage?: MediaStorage;
};

/**
 * Whether any published Lesson's body holds a media block with this storage key. The descriptor snapshot in the body is
 * the only record of which Lessons use a file, so this is one jsonb containment query over published bodies.
 * @param db - Database
 * @param storageKey - The requested key
 */
export async function publishedLessonShows(db: Database, storageKey: string): Promise<boolean> {
  const containing = JSON.stringify({ sections: [{ blocks: [{ kind: "media", descriptor: { storageKey } }] }] });
  try {
    const rows = await db.select({ id: publishedLessons.id }).from(publishedLessons)
      .where(sql`${publishedLessons.body} @> ${containing}::jsonb`).limit(1);
    return rows.length > 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[media.ts: publishedLessonShows] Failed to look up Lessons using a media file || storageKey=${storageKey} || ${message}`);
  }
}

/**
 * The stable `/media/<storage key>` path (spec §2 "Media bytes"). It streams a file from the private bucket only when a
 * published Lesson shows it, so checkpoints and catalog files no Course has shipped stay private. No signed URL is
 * made or stored.
 * @param app - Fastify app
 * @param options - Injected lookup and bucket
 */
export async function mediaRoutes(app: FastifyInstance, options: MediaRouteOptions = {}) {
  const published = options.published ?? ((storageKey: string) => publishedLessonShows(app.db, storageKey));
  let bucket: MediaStorage | null = options.storage ?? null;

  app.get("/media/*", async (request, reply) => {
    const storageKey = (request.params as { "*": string })["*"];
    if (!STORAGE_KEY_PATTERN.test(storageKey)) return reply.code(404).send({ error: "Not found" });
    try {
      if (!(await published(storageKey))) return reply.code(404).send({ error: "Not found" });
      bucket ??= createMediaStorage(mediaStorageConfigFromEnv());
      const object = await bucket.get(storageKey);
      if (!object) {
        request.log.warn({ storageKey }, "[media.ts: GET /media] A published Lesson shows a file the bucket does not have");
        return reply.code(404).send({ error: "Not found" });
      }
      if (object.byteSize > 0) reply.header("Content-Length", object.byteSize);
      if (object.contentType === "image/svg+xml") reply.header("Content-Security-Policy", SVG_CONTENT_SECURITY_POLICY);
      return reply
        .header("Content-Type", object.contentType)
        .header("Cache-Control", "private, max-age=3600")
        .header("X-Content-Type-Options", "nosniff")
        .send(object.body);
    } catch (error) {
      request.log.error({ err: error, storageKey }, "[media.ts: GET /media] Failed to serve a media file");
      return reply.code(502).send({ error: "Media is unavailable right now." });
    }
  });
}
