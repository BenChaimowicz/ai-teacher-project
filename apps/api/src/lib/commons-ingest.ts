import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { mediaDescriptorFailures, mediaDescriptors, type Database, type MediaDescriptorFields, type MediaReview, type VisualBrief } from "@senoy/db";
import { COMMONS_KEY_PREFIX, pixelSize, sha256Of, type MediaStorage } from "@senoy/media";
import {
  commonsQueries, commonsUserAgent, downloadCommonsFile, searchCommons, type CommonsCandidate, type CommonsClient, type CommonsRejection,
} from "./commons.ts";
import { descriptorOf } from "./media-library.ts";
import { withPipelineEvent } from "./usage-tracking.ts";

/**
 * Ingest from Wikimedia Commons on a library miss (spec §5.6 step 2, SEN-129; decision 2026-11-03): search Commons for a
 * Visual brief, keep only files under a licence the product may host, have the Vision Judge check each against the
 * brief's `mustShow`, and copy the first that passes into the private bucket as an unreviewed library file. The next
 * lookup for the same Media category and Topic tags finds it in the library like any seeded file.
 */

/** The Vision Judge's verdict on one image against a brief. */
export type VisualVerdict = { pass: boolean; reasons: string[] };

/**
 * The Vision Judge, injected: it looks at one image and fails any `mustShow` fact it cannot see, harshly for a
 * technique. Its prompt belongs to SEN-121. Build it on the model ports (`createModelPorts().judge`), whose tracked
 * transport makes each call a Usage Record under this step's Pipeline Event.
 */
export type VisualJudge = (image: { bytes: Uint8Array; mimeType: string }, brief: VisualBrief) => Promise<VisualVerdict>;

/**
 * Most Vision Judge calls one search spends. Commons ranks by relevance, so a file past the third is rarely better than
 * the first three, and each call is a paid high-detail vision request inside sequential Lesson generation: three bounds
 * the cost of a miss to a few cents and well under a minute.
 */
export const MAX_JUDGED = 3;

/** Most downloads one search makes, judged or not, so an unreachable upload server cannot stall a Lesson. */
export const MAX_DOWNLOADS = 2 * MAX_JUDGED;

/** A library row with its review state, as dedupe reads it. */
export type LibraryMatch = MediaDescriptorFields & { review: MediaReview };

/** What ingest needs from the `media_descriptors` table. Production uses {@link drizzleCommonsStore}; tests a fake. */
export interface CommonsLibraryStore {
  /** The library row for this Commons description page, if any, in any review state. */
  bySourceUrl(url: string): Promise<LibraryMatch | null>;
  /** The library row holding these bytes, if any, in any review state. */
  bySha256(sha256: string): Promise<LibraryMatch | null>;
  /**
   * Writes one descriptor as `unreviewed`. When a row with the same storage key (so the same bytes) landed first, as a
   * parallel Course may do, that row is returned instead and nothing is written.
   */
  insertUnreviewed(descriptor: MediaDescriptorFields): Promise<MediaDescriptorFields>;
}

/**
 * The two spellings a Commons page URL appears in: percent-encoded, as Commons returns it, and decoded, as a hand-written
 * catalog entry may hold it.
 * @param url - A description page URL
 */
function urlSpellings(url: string): string[] {
  let decoded = url;
  try {
    decoded = decodeURI(url);
  } catch {
    // A malformed escape: compare the URL as given.
  }
  return [...new Set([url, decoded, encodeURI(decoded)])];
}

/**
 * The store over the `media_descriptors` table.
 * @param db - Drizzle client
 */
export function drizzleCommonsStore(db: Database): CommonsLibraryStore {
  /** A row with its review state, minus timestamps. */
  const matchOf = (row: typeof mediaDescriptors.$inferSelect): LibraryMatch => ({ ...descriptorOf(row), review: row.review });

  return {
    async bySourceUrl(url) {
      try {
        const spellings = urlSpellings(url);
        const [row] = await db.select().from(mediaDescriptors)
          .where(sql`${mediaDescriptors.source}->>'url' in (${sql.join(spellings.map((value) => sql`${value}`), sql`, `)})`)
          .limit(1);
        return row ? matchOf(row) : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[commons-ingest.ts: bySourceUrl] Failed to look up a library file by its source page || url=${url} || ${message}`);
      }
    },

    async bySha256(sha256) {
      try {
        const [row] = await db.select().from(mediaDescriptors).where(eq(mediaDescriptors.sha256, sha256)).limit(1);
        return row ? matchOf(row) : null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[commons-ingest.ts: bySha256] Failed to look up a library file by its digest || sha256=${sha256} || ${message}`);
      }
    },

    async insertUnreviewed(descriptor) {
      try {
        const [inserted] = await db.insert(mediaDescriptors).values({ ...descriptor, review: "unreviewed" })
          .onConflictDoNothing({ target: mediaDescriptors.storageKey })
          .returning();
        if (inserted) return descriptorOf(inserted);
        const [first] = await db.select().from(mediaDescriptors).where(eq(mediaDescriptors.storageKey, descriptor.storageKey)).limit(1);
        if (!first) throw new Error("The insert conflicted but no row holds the storage key");
        return descriptorOf(first);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[commons-ingest.ts: insertUnreviewed] Failed to write a Commons file's descriptor || storageKey=${descriptor.storageKey} || ${message}`);
      }
    },
  };
}

/**
 * What became of one Commons file that passed the licence and type filters:
 * - `removed`: a person already removed this file (by page or by bytes) from the library, so it is never taken again.
 * - `download_failed`: its thumbnail could not be downloaded, or was not a usable still.
 * - `judge_failed`: the Vision Judge failed it against the brief.
 * - `judge_error`: the Vision Judge call itself failed.
 * - `invalid`: its descriptor broke a catalog rule (it should not, after the filters; recorded rather than hidden).
 * - `ingested`: it passed and was added to the library as unreviewed.
 * - `reused`: it passed and was already in the library, under another category or tags, so that row is returned.
 */
export type CommonsTryStatus = "removed" | "download_failed" | "judge_failed" | "judge_error" | "invalid" | "ingested" | "reused";

/** One Commons file tried for a brief, for the Pipeline Event and the caller. */
export type CommonsTry = {
  title: string;
  descriptionUrl: string;
  query: string;
  rank: number;
  license: CommonsCandidate["licence"]["license"];
  status: CommonsTryStatus;
  /** The Judge's reasons, or the error, or the broken rules; empty on success. */
  reasons: string[];
};

/** The result of one Commons search for a brief. */
export type CommonsFind = {
  /** The library file to attach, or null when nothing passed. */
  descriptor: MediaDescriptorFields | null;
  outcome: "ingested" | "reused" | "miss";
  /** The searches run, in order. */
  queries: string[];
  /** Each search that failed, such as Commons throttling us; a failed search counts as finding nothing. */
  searchErrors: string[];
  /** Each file tried, in order. */
  tried: CommonsTry[];
  /** Files the licence and type filters turned down before any download. */
  rejected: CommonsRejection[];
};

/** Everything {@link findVisualOnCommons} needs. */
export type FindVisualOnCommonsOptions = {
  brief: VisualBrief;
  judge: VisualJudge;
  /** Where the descriptor is written; pass `db` for the real table, or `store` for a fake. */
  db?: Database;
  store?: CommonsLibraryStore;
  /** The private bucket the bytes are copied into. */
  storage: MediaStorage;
  /** Reaches Commons; defaults to the global fetch. */
  fetch?: typeof globalThis.fetch;
  /** Defaults to {@link commonsUserAgent} over `WIKIMEDIA_CONTACT`. */
  userAgent?: string;
  /** Defaults to {@link MAX_JUDGED}. */
  maxJudged?: number;
  /** Makes descriptor ids; defaults to random UUIDs. */
  newId?: () => string;
};

/** File extension by downloaded MIME type, for the storage key. */
const EXTENSION: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Where a Commons file's bytes live: under the library prefix, named by their digest, so the same bytes always land on
 * the same key and the table's unique storage key refuses a second row for them.
 * @param sha256 - The bytes' digest
 * @param mimeType - Their type
 */
export function commonsStorageKey(sha256: string, mimeType: string): string {
  return `${COMMONS_KEY_PREFIX}${sha256}.${EXTENSION[mimeType] ?? "bin"}`;
}

/**
 * The library descriptor for a Commons file: licence and source from its page, caption, alt, Media category and Topic
 * tags from the brief, everything else from the bytes.
 * @param brief - What the file was found for
 * @param candidate - Its Commons page
 * @param file - The downloaded bytes and their type
 * @param id - The new descriptor id
 * @throws Error when the bytes' dimensions cannot be read
 */
export function commonsDescriptor(brief: VisualBrief, candidate: CommonsCandidate, file: { bytes: Uint8Array; mimeType: string }, id: string): MediaDescriptorFields {
  const sha256 = sha256Of(file.bytes);
  const { width, height } = pixelSize(file.bytes);
  return {
    id,
    kind: "image",
    origin: "library",
    license: candidate.licence.license,
    licenseUrl: candidate.licence.licenseUrl,
    caption: brief.caption,
    alt: brief.alt,
    source: { title: candidate.title, author: candidate.author, url: candidate.descriptionUrl },
    storageKey: commonsStorageKey(sha256, file.mimeType),
    mimeType: file.mimeType,
    byteSize: file.bytes.byteLength,
    sha256,
    width,
    height,
    mediaCategory: brief.mediaCategory,
    topicTags: [...brief.topicTags],
  };
}

/**
 * Finds a visual on Wikimedia Commons for a brief the library could not fill, and adds it to the library. Runs as one
 * `media_search` Pipeline Event: each Commons call and each Vision Judge call is a Usage Record under it.
 *
 * Searches run in order ({@link commonsQueries}); files are tried in Commons' relevance order, at most
 * {@link MAX_JUDGED} judged. A file already in the library (same page or same bytes) is not ingested again: if a person
 * removed it, it is skipped; otherwise, once it passes the Judge, its existing row is returned. A file that passes and is
 * new is copied into the bucket under the library prefix and written as an unreviewed descriptor, then returned. It is
 * used straight away and listed in the Usage Console for review (decision 2026-11-03).
 *
 * Files are filed under the brief's own Media category, which must be one of `MEDIA_CATEGORIES`.
 * @param options - Brief, Judge, database or store, bucket, and Commons client settings
 * @returns The descriptor to attach (or null), and what was searched and tried
 * @throws Error only when the bucket or the database fails while ingesting a file that passed; a Commons or Judge
 *   failure is a miss, recorded in the result
 */
export function findVisualOnCommons(options: FindVisualOnCommonsOptions): Promise<CommonsFind> {
  const { brief, judge, storage } = options;
  const store = options.store ?? (options.db ? drizzleCommonsStore(options.db) : null);
  if (!store) throw new Error(`[commons-ingest.ts: findVisualOnCommons] Pass a db or a store || subject=${brief.subject}`);
  const maxJudged = options.maxJudged ?? MAX_JUDGED;
  const newId = options.newId ?? randomUUID;

  return withPipelineEvent("media_search", { label: brief.subject, detail: { brief } }, async (event) => {
    const client: CommonsClient = { fetch: options.fetch ?? globalThis.fetch, userAgent: options.userAgent ?? commonsUserAgent() };
    const find: CommonsFind = { descriptor: null, outcome: "miss", queries: commonsQueries(brief), searchErrors: [], tried: [], rejected: [] };
    const seen = new Set<number>();
    let judged = 0;
    let downloads = 0;

    /** Writes the result onto the Pipeline Event and returns it. */
    const done = (): CommonsFind => {
      event.setDetail({ outcome: find.outcome, descriptorId: find.descriptor?.id ?? null, queries: find.queries, searchErrors: find.searchErrors, tried: find.tried, rejected: find.rejected });
      return find;
    };

    for (const query of find.queries) {
      if (judged >= maxJudged || downloads >= MAX_DOWNLOADS) break;
      const search = await searchCommons(client, query);
      if (search.error) find.searchErrors.push(search.error);
      find.rejected.push(...search.rejected);

      for (const candidate of search.candidates) {
        if (judged >= maxJudged || downloads >= MAX_DOWNLOADS) break;
        if (seen.has(candidate.pageId)) continue;
        seen.add(candidate.pageId);
        const tried = (status: CommonsTryStatus, reasons: string[] = []) => void find.tried.push({
          title: candidate.title, descriptionUrl: candidate.descriptionUrl, query, rank: candidate.rank, license: candidate.licence.license, status, reasons,
        });

        const byPage = await store.bySourceUrl(candidate.descriptionUrl);
        if (byPage?.review === "removed") { tried("removed", ["A person removed this file from the library."]); continue; }

        downloads += 1;
        let file: { bytes: Uint8Array; mimeType: string };
        try {
          file = await downloadCommonsFile(client, candidate);
        } catch (error) {
          tried("download_failed", [error instanceof Error ? error.message : String(error)]);
          continue;
        }
        const existing = byPage ?? await store.bySha256(sha256Of(file.bytes));
        if (existing?.review === "removed") { tried("removed", ["A person removed these bytes from the library."]); continue; }

        judged += 1;
        let verdict: VisualVerdict;
        try {
          verdict = await judge(file, brief);
        } catch (error) {
          tried("judge_error", [error instanceof Error ? error.message : String(error)]);
          continue;
        }
        if (!verdict.pass) { tried("judge_failed", verdict.reasons); continue; }

        if (existing) {
          const { review: _review, ...descriptor } = existing;
          tried("reused");
          find.descriptor = descriptor;
          find.outcome = "reused";
          return done();
        }

        let descriptor: MediaDescriptorFields;
        try {
          descriptor = commonsDescriptor(brief, candidate, file, newId());
        } catch (error) {
          tried("invalid", [error instanceof Error ? error.message : String(error)]);
          continue;
        }
        const failures = mediaDescriptorFailures(descriptor);
        if (failures.length) { tried("invalid", failures); continue; }

        try {
          // Bytes first: a descriptor row must never point at an object the bucket lacks.
          await storage.put(descriptor.storageKey, file.bytes, descriptor.mimeType);
          find.descriptor = await store.insertUnreviewed(descriptor);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`[commons-ingest.ts: findVisualOnCommons] Failed to add a Commons file to the library || title=${candidate.title} storageKey=${descriptor.storageKey} || ${message}`);
        }
        tried("ingested");
        find.outcome = "ingested";
        return done();
      }
    }
    return done();
  });
}
