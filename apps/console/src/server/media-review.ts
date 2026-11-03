import type { Readable } from "node:stream";
import { sql } from "drizzle-orm";
import type { MediaReview, MediaSource, OpsMediaReview, OpsMediaReviewItem } from "@senoy/db";
import { COMMONS_KEY_PREFIX, type MediaStorage } from "@senoy/media";
import { toIso, toNumber, toNumberOrNull, toText, type SqlRow } from "./format.ts";
import type { SqlRunner } from "./ops-store.ts";

/**
 * Media review (SEN-129): files found on Wikimedia Commons are used in Lessons straight away as `unreviewed`, and a
 * person approves or removes each one here. Removing stops new Readings from offering the file; Lessons that already
 * show it keep their copy of its descriptor, and `/media/…` keeps serving its bytes, so none of them breaks.
 */

/** A decision a person makes on one file. */
export type MediaDecision = Extract<MediaReview, "reviewed" | "removed">;

/** What the media review routes need. */
export interface MediaReviewService {
  /** Unreviewed Commons files, oldest first, and the latest decided ones. */
  list(): Promise<OpsMediaReview>;
  /** Approves or removes one Commons file; null when no Commons file has that id. */
  decide(id: string, review: MediaDecision): Promise<OpsMediaReviewItem | null>;
  /** One Commons file's bytes from the private bucket, for its thumbnail; null when there is no such file. */
  file(id: string): Promise<{ body: Readable; contentType: string; byteSize: number } | null>;
}

/** How many decided files the list shows, newest decision first. */
export const DECIDED_SHOWN = 30;

/** The columns every query selects, with how many published Lessons show the file. */
const COLUMNS = sql`d.id, d.review, d.caption, d.alt, d.license, d.license_url as "licenseUrl", d.source,
  d.media_category as "mediaCategory", d.topic_tags as "topicTags", d.mime_type as "mimeType", d.width, d.height,
  d.created_at as "createdAt",
  (select count(*) from published_lessons l
    where l.body @> jsonb_build_object('sections', jsonb_build_array(jsonb_build_object('blocks',
      jsonb_build_array(jsonb_build_object('kind', 'media', 'descriptor', jsonb_build_object('storageKey', d.storage_key))))))
  ) as "lessonCount"`;

/** Only files that came from Commons: the storage key prefix is where ingest puts them, and the seed never does. */
const FROM_COMMONS = sql`d.storage_key like ${`${COMMONS_KEY_PREFIX}%`}`;

/**
 * Reads one row into the screen's shape.
 * @param row - A row with {@link COLUMNS}
 */
export function toMediaReviewItem(row: SqlRow): OpsMediaReviewItem {
  const source = row.source as MediaSource | null;
  return {
    id: String(row.id),
    review: row.review as MediaReview,
    caption: String(row.caption ?? ""),
    alt: String(row.alt ?? ""),
    license: String(row.license ?? ""),
    licenseUrl: toText(row.licenseUrl),
    source: source ? { title: source.title, author: source.author, url: source.url } : null,
    mediaCategory: String(row.mediaCategory ?? ""),
    topicTags: Array.isArray(row.topicTags) ? row.topicTags.map(String) : [],
    mimeType: String(row.mimeType ?? ""),
    width: toNumberOrNull(row.width),
    height: toNumberOrNull(row.height),
    createdAt: toIso(row.createdAt),
    lessonCount: toNumber(row.lessonCount),
  };
}

/**
 * The review service over the console's SQL runner and the private bucket.
 * @param options.run - Runs raw SQL
 * @param options.storage - The bucket; without it `file` finds nothing, so the screen shows no thumbnails
 */
export function createMediaReviewService(options: { run: SqlRunner; storage: MediaStorage | null }): MediaReviewService {
  const { run, storage } = options;
  return {
    async list() {
      try {
        const [unreviewed, decided] = await Promise.all([
          run(sql`select ${COLUMNS} from media_descriptors d where ${FROM_COMMONS} and d.review = 'unreviewed' order by d.created_at, d.id`),
          run(sql`select ${COLUMNS} from media_descriptors d where ${FROM_COMMONS} and d.review <> 'unreviewed'
            order by d.updated_at desc, d.id limit ${DECIDED_SHOWN}`),
        ]);
        return { unreviewed: unreviewed.map(toMediaReviewItem), decided: decided.map(toMediaReviewItem) };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[media-review.ts: list] Failed to list Commons files for review || ${message}`);
      }
    },

    async decide(id, review) {
      try {
        const [row] = await run(sql`update media_descriptors d set review = ${review}::media_review, updated_at = now()
          where d.id = ${id} and ${FROM_COMMONS} returning ${COLUMNS}`);
        return row ? toMediaReviewItem(row) : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[media-review.ts: decide] Failed to save a review decision || id=${id} review=${review} || ${message}`);
      }
    },

    async file(id) {
      if (!storage) return null;
      let storageKey: string | null = null;
      try {
        const [row] = await run(sql`select d.storage_key as "storageKey" from media_descriptors d where d.id = ${id} and ${FROM_COMMONS}`);
        storageKey = toText(row?.storageKey);
        if (!storageKey) return null;
        return await storage.get(storageKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[media-review.ts: file] Failed to read a Commons file for its thumbnail || id=${id} storageKey=${storageKey} || ${message}`);
      }
    },
  };
}
