import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  MEDIA_SEARCH_INDEXES, mediaDescriptorFailures, mediaDescriptors, type Database, type MediaCategory, type MediaDescriptorFields, type MediaReview,
  type MediaSearchRoute, type VisualBrief,
} from "@senoy/db";
import { COMMONS_KEY_PREFIX, pixelSize, sha256Of, type MediaStorage } from "@senoy/media";
import {
  browseCommonsCategory, commonsQueries, commonsSearchString, commonsUserAgent, downloadCommonsFile, lookupCommonsPages, searchCommons,
  type CommonsCandidate, type CommonsClient, type CommonsQueryResult, type CommonsRejection,
} from "./commons.ts";
import { createMediaLibrarian, MAX_SCREENED, type LibrarianResult, type MediaLibrarian } from "./media-librarian.ts";
import { descriptorOf } from "./media-library.ts";
import type { Triage } from "./model-ports.ts";
import { searchOpenverse, type OpenverseHit } from "./openverse.ts";
import { withPipelineEvent } from "./usage-tracking.ts";

/**
 * Ingest from Wikimedia Commons on a library miss (spec §5.6 step 2, SEN-129; decision 2026-11-03), found by a search
 * that reads like a librarian and remembers what worked (SEN-132, decision 2026-11-04). It first runs the search routes
 * that found this Media category's library files before. When they find nothing that passes, the librarian writes
 * searches in the field's own terms for Commons and Openverse, reads the results' titles and descriptions, browses a
 * good hit's Commons category, and refines once. A cheap low-detail screen ranks up to {@link MAX_SCREENED} files, and
 * only the best {@link MAX_JUDGED} reach the Vision Judge. Every file's licence is read off its own Commons page, and
 * the first that passes is copied into the private bucket as an unreviewed library file, with the route that found it.
 * The next lookup for the same Media category and Topic tags finds it in the library like any seeded file.
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
 * Most Vision Judge calls one stage of a search spends (the remembered routes, then the librarian's searches). The
 * screen has already ranked the files, so a file past the third is rarely better than the first three, and each call is
 * a paid high-detail vision request inside sequential Lesson generation: three bounds the cost of a miss to a few cents.
 */
export const MAX_JUDGED = 3;

/** Most downloads one stage tries, screened or not, so an unreachable upload server cannot stall a Lesson. */
export const MAX_DOWNLOADS = MAX_SCREENED + MAX_JUDGED;

/** Downloads run this many at a time: quick enough for a dozen previews, gentle on Wikimedia's upload servers. */
const DOWNLOAD_CONCURRENCY = 3;

/**
 * Remembered routes a search starts from, newest first. A category's first few finds name the routes that work for it;
 * more would only repeat them at the cost of a search call each.
 */
export const MAX_REMEMBERED_ROUTES = 3;

/**
 * How many of the librarian's written searches also run on Openverse, and of its refined ones. Anonymous Openverse
 * allows 200 searches a day, so it gets the best searches, not all of them.
 */
export const OPENVERSE_WRITTEN = 2;
export const OPENVERSE_REFINED = 1;

/** A library row with its review state, as dedupe reads it. */
export type LibraryMatch = MediaDescriptorFields & { review: MediaReview };

/** What ingest needs from the `media_descriptors` table. Production uses {@link drizzleCommonsStore}; tests a fake. */
export interface CommonsLibraryStore {
  /** The library row for this Commons description page, if any, in any review state. */
  bySourceUrl(url: string): Promise<LibraryMatch | null>;
  /** The library row holding these bytes, if any, in any review state. */
  bySha256(sha256: string): Promise<LibraryMatch | null>;
  /**
   * Writes one descriptor as `unreviewed`, with the route that found it. When a row with the same storage key (so the
   * same bytes) landed first, as a parallel Course may do, that row is returned instead and nothing is written.
   */
  insertUnreviewed(descriptor: MediaDescriptorFields, foundBy: MediaSearchRoute): Promise<MediaDescriptorFields>;
  /**
   * Keeps `foundBy` on a library file a search found again and reused, when no route is kept on it yet: a seeded file
   * the library check failed but a search found and the Judge passed. A route already kept is never replaced.
   */
  rememberRoute(id: string, foundBy: MediaSearchRoute): Promise<void>;
  /**
   * The routes that found this category's library files, newest first, once each, at most
   * {@link MAX_REMEMBERED_ROUTES}. Files a person removed are left out, so their routes are forgotten with them.
   */
  routes(mediaCategory: MediaCategory): Promise<MediaSearchRoute[]>;
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
 * The key two routes share when they are the same search.
 * @param route - A search route
 */
function routeKey(route: MediaSearchRoute): string {
  return `${route.index} ${route.query}`;
}

/**
 * Stored routes made safe to run: well-formed ones only, once each, in order, at most {@link MAX_REMEMBERED_ROUTES}.
 * @param stored - `found_by` values, newest first
 */
export function rememberedRoutes(stored: readonly unknown[]): MediaSearchRoute[] {
  const seen = new Set<string>();
  const routes: MediaSearchRoute[] = [];
  for (const value of stored) {
    const route = value as Partial<MediaSearchRoute> | null;
    if (!route || !(MEDIA_SEARCH_INDEXES as readonly unknown[]).includes(route.index) || typeof route.query !== "string" || !route.query.trim()) continue;
    const clean = { index: route.index!, query: route.query.trim() };
    if (seen.has(routeKey(clean))) continue;
    seen.add(routeKey(clean));
    routes.push(clean);
  }
  return routes.slice(0, MAX_REMEMBERED_ROUTES);
}

/** Rows read for remembered routes: enough to find a few distinct routes when the newest files share one. */
const ROUTE_ROWS = 20;

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

    async insertUnreviewed(descriptor, foundBy) {
      try {
        const [inserted] = await db.insert(mediaDescriptors).values({ ...descriptor, review: "unreviewed", foundBy })
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

    async rememberRoute(id, foundBy) {
      try {
        await db.update(mediaDescriptors).set({ foundBy }).where(and(eq(mediaDescriptors.id, id), isNull(mediaDescriptors.foundBy)));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[commons-ingest.ts: rememberRoute] Failed to keep the route that found a library file || id=${id} || ${message}`);
      }
    },

    async routes(mediaCategory) {
      try {
        const rows = await db.select({ foundBy: mediaDescriptors.foundBy }).from(mediaDescriptors)
          .where(and(eq(mediaDescriptors.mediaCategory, mediaCategory), ne(mediaDescriptors.review, "removed"), isNotNull(mediaDescriptors.foundBy)))
          .orderBy(desc(mediaDescriptors.createdAt))
          .limit(ROUTE_ROWS);
        return rememberedRoutes(rows.map(({ foundBy }) => foundBy));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[commons-ingest.ts: routes] Failed to read the routes that found a category's files || mediaCategory=${mediaCategory} || ${message}`);
      }
    },
  };
}

/**
 * What became of one Commons file a search kept:
 * - `removed`: a person already removed this file (by page or by bytes) from the library, so it is never taken again.
 * - `download_failed`: its thumbnail could not be downloaded, or was not a usable still.
 * - `screened_out`: the librarian's low-detail screen read it as not what the brief needs.
 * - `judge_failed`: the Vision Judge failed it against the brief.
 * - `judge_error`: the Vision Judge call itself failed.
 * - `invalid`: its descriptor broke a catalog rule (it should not, after the filters; recorded rather than hidden).
 * - `ingested`: it passed and was added to the library as unreviewed.
 * - `reused`: it passed and was already in the library, under another category or tags, so that row is returned.
 */
export type CommonsTryStatus = "removed" | "download_failed" | "screened_out" | "judge_failed" | "judge_error" | "invalid" | "ingested" | "reused";

/** Which part of a search found a file: the remembered routes, or the librarian's searches. */
export type MediaSearchStage = "remembered" | "librarian";

/** One Commons file tried for a brief, for the Pipeline Event and the caller. */
export type CommonsTry = {
  title: string;
  descriptionUrl: string;
  stage: MediaSearchStage;
  /** The search that found it. */
  route: MediaSearchRoute;
  /** Its position in that search's results, from 1. */
  rank: number;
  license: CommonsCandidate["licence"]["license"];
  status: CommonsTryStatus;
  /** The Judge's reasons, or the error, or the broken rules; empty on success. */
  reasons: string[];
};

/** One search a media search ran, and how many files it gave (for Openverse, Commons files to look up). */
export type MediaSearchCall = { stage: MediaSearchStage; route: MediaSearchRoute; found: number; error: string | null };

/** The result of one media search for a brief. */
export type CommonsFind = {
  /** The library file to attach, or null when nothing passed. */
  descriptor: MediaDescriptorFields | null;
  outcome: "ingested" | "reused" | "miss";
  /** The search that found the file attached, or null. */
  foundBy: MediaSearchRoute | null;
  /** Every search run, in order: remembered routes first, then the librarian's. */
  searches: MediaSearchCall[];
  /** Each search or page lookup that failed, such as Commons throttling us; a failed search counts as finding nothing. */
  searchErrors: string[];
  /** Each librarian call that failed, so its step was skipped. */
  librarianErrors: string[];
  /** Each file tried, in order. */
  tried: CommonsTry[];
  /**
   * Files turned down before any download: by the licence and type filters, by Openverse's source (decision
   * 2026-11-04), or by the librarian reading their title and description as off the brief.
   */
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
  /** Writes, reads, and screens; defaults to {@link createMediaLibrarian} over `triage`. */
  librarian?: MediaLibrarian;
  /** The triage port the default librarian runs on, such as one over a Course run's transport. */
  triage?: Triage;
  /** Reaches Commons and Openverse; defaults to the global fetch. */
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

/** A Commons file a search kept, with the search that found it. */
type Found = { candidate: CommonsCandidate; route: MediaSearchRoute };

/**
 * The files to screen, in order: the first read's picks, but leaving room for up to half the screen for the picks of
 * the refined searches and browsed categories, which ran because the first results were thin or a category looked
 * richer. Any picks left over follow.
 * @param first - The first read's picks
 * @param second - The second read's picks
 */
export function mergePicks<T>(first: readonly T[], second: readonly T[]): T[] {
  const lead = MAX_SCREENED - Math.min(second.length, MAX_SCREENED / 2);
  return [...first.slice(0, lead), ...second, ...first.slice(lead)];
}

/**
 * Finds a visual for a brief the library could not fill, and adds it to the library. Runs as one `media_search`
 * Pipeline Event: each Commons and Openverse call, each librarian call, and each Vision Judge call is a Usage Record
 * under it.
 *
 * Two stages, each screening at most {@link MAX_SCREENED} files and judging at most {@link MAX_JUDGED}:
 * 1. Remembered: the routes that found this Media category's library files, when there are any; the librarian picks
 *    from their results by text.
 * 2. Librarian: searches it writes (the rule-built {@link commonsQueries} when it cannot), on Commons and the best on
 *    Openverse; it reads the results, then browses the categories it names and runs its refined searches, and picks
 *    again from those.
 * A file already in the library (same page or same bytes) is not ingested again: if a person removed it, it is skipped;
 * otherwise, once it passes the Judge, its existing row is returned. A file that passes and is new is copied into the
 * bucket under the library prefix and written as an unreviewed descriptor with the route that found it, then returned.
 * It is used straight away and listed in the Usage Console for review (decision 2026-11-03).
 *
 * Files are filed under the brief's own Media category, which must be one of `MEDIA_CATEGORIES`.
 * @param options - Brief, Judge, database or store, bucket, librarian, and client settings
 * @returns The descriptor to attach (or null), and what was searched and tried
 * @throws Error only when the bucket or the database fails while ingesting a file that passed; a search, librarian, or
 *   Judge failure is a miss, recorded in the result
 */
export function findVisualOnCommons(options: FindVisualOnCommonsOptions): Promise<CommonsFind> {
  const { brief, judge, storage } = options;
  const store = options.store ?? (options.db ? drizzleCommonsStore(options.db) : null);
  if (!store) throw new Error(`[commons-ingest.ts: findVisualOnCommons] Pass a db or a store || subject=${brief.subject}`);
  const maxJudged = options.maxJudged ?? MAX_JUDGED;
  const newId = options.newId ?? randomUUID;
  const librarian = options.librarian ?? createMediaLibrarian(options.triage);

  return withPipelineEvent("media_search", { label: brief.subject, detail: { brief } }, async (event) => {
    const fetch = options.fetch ?? globalThis.fetch;
    const client: CommonsClient = { fetch, userAgent: options.userAgent ?? commonsUserAgent() };
    const find: CommonsFind = { descriptor: null, outcome: "miss", foundBy: null, searches: [], searchErrors: [], librarianErrors: [], tried: [], rejected: [] };
    /** Files tried in any stage, by page id, so none is downloaded or judged twice. */
    const seen = new Set<number>();
    /** Searches run in any stage, so none runs twice. */
    const ran = new Set<string>();

    /** Writes the result onto the Pipeline Event and returns it. */
    const done = (): CommonsFind => {
      const { descriptor, ...rest } = find;
      event.setDetail({ ...rest, descriptorId: descriptor?.id ?? null });
      return find;
    };

    /**
     * Runs each route not yet run, then looks up on Commons the files Openverse found that the Commons searches did not.
     * @param stage - Which stage runs them
     * @param routes - The searches, in order
     * @returns The files they kept, once each, leaving out files already tried
     */
    async function runRoutes(stage: MediaSearchStage, routes: readonly MediaSearchRoute[]): Promise<Found[]> {
      const found = new Map<number, Found>();
      const openverseHits: { hit: OpenverseHit; route: MediaSearchRoute }[] = [];
      /** Keeps one Commons call's files and records the call. */
      const keep = (route: MediaSearchRoute, result: CommonsQueryResult) => {
        find.searches.push({ stage, route, found: result.candidates.length, error: result.error });
        if (result.error) find.searchErrors.push(result.error);
        find.rejected.push(...result.rejected);
        for (const candidate of result.candidates) {
          if (!seen.has(candidate.pageId) && !found.has(candidate.pageId)) found.set(candidate.pageId, { candidate, route });
        }
      };

      for (const route of routes) {
        if (ran.has(routeKey(route))) continue;
        ran.add(routeKey(route));
        if (route.index === "commons") keep(route, await searchCommons(client, route.query));
        else if (route.index === "commons_category") keep(route, await browseCommonsCategory(client, route.query));
        else {
          const result = await searchOpenverse(fetch, route.query);
          find.searches.push({ stage, route, found: result.hits.length, error: result.error });
          if (result.error) find.searchErrors.push(result.error);
          find.rejected.push(...result.rejected);
          openverseHits.push(...result.hits.map((hit) => ({ hit, route })));
        }
      }

      const fresh = openverseHits.filter(({ hit }) => !seen.has(hit.pageId) && !found.has(hit.pageId));
      if (fresh.length) {
        const lookup = await lookupCommonsPages(client, fresh.map(({ hit }) => hit.pageId));
        if (lookup.error) find.searchErrors.push(lookup.error);
        find.rejected.push(...lookup.rejected);
        for (const candidate of lookup.candidates) {
          const first = fresh.find(({ hit }) => hit.pageId === candidate.pageId)!;
          if (!found.has(candidate.pageId)) found.set(candidate.pageId, { candidate: { ...candidate, rank: first.hit.rank }, route: first.route });
        }
      }
      return [...found.values()];
    }

    /**
     * Has the librarian read a stage's files by text, and turns down the ones it leaves out.
     * @param pool - The files, in search order
     * @param refine - Whether it may name categories and write new searches
     * @returns The picked files, best first, and what it added
     */
    async function read(pool: readonly Found[], refine: boolean): Promise<{ picks: Found[]; categories: string[]; queries: string[] }> {
      const results: LibrarianResult[] = pool.map(({ candidate }, index) => ({
        id: `r${index + 1}`, title: candidate.title, description: candidate.description, categories: candidate.categories,
      }));
      const verdict = await librarian.readResults(brief, results, refine);
      if (verdict.error) find.librarianErrors.push(verdict.error);
      const byId = new Map(results.map(({ id }, index) => [id, pool[index]!]));
      const picks = verdict.picks.map((id) => byId.get(id)!);
      const picked = new Set(picks);
      // Only files the read actually saw are turned down; any past MAX_READ_RESULTS were never shown to it.
      for (const [index, found] of pool.entries()) {
        if (!picked.has(found) && index < results.length) {
          find.rejected.push({ title: found.candidate.title, reason: "The librarian read its title and description as not what the brief needs." });
        }
      }
      return { picks, categories: verdict.categories, queries: verdict.queries };
    }

    /**
     * Downloads, screens, and judges a stage's picks, and ingests or reuses the first that passes.
     * @param stage - Which stage
     * @param picks - The files, best first
     * @returns Whether a file passed
     */
    async function tryFiles(stage: MediaSearchStage, picks: readonly Found[]): Promise<boolean> {
      type Downloaded = Found & { file: { bytes: Uint8Array; mimeType: string }; existing: LibraryMatch | null };
      /** Records one file's fate and marks it tried. */
      const tried = ({ candidate, route }: Found, status: CommonsTryStatus, reasons: string[] = []) => {
        seen.add(candidate.pageId);
        find.tried.push({ title: candidate.title, descriptionUrl: candidate.descriptionUrl, stage, route, rank: candidate.rank, license: candidate.licence.license, status, reasons });
      };
      /** Downloads one file unless a person removed it; null when it is not to be screened. */
      const fetchOne = async (found: Found): Promise<Downloaded | null> => {
        const byPage = await store!.bySourceUrl(found.candidate.descriptionUrl);
        if (byPage?.review === "removed") { tried(found, "removed", ["A person removed this file from the library."]); return null; }
        let file: { bytes: Uint8Array; mimeType: string };
        try {
          file = await downloadCommonsFile(client, found.candidate);
        } catch (error) {
          tried(found, "download_failed", [error instanceof Error ? error.message : String(error)]);
          return null;
        }
        const existing = byPage ?? await store!.bySha256(sha256Of(file.bytes));
        if (existing?.review === "removed") { tried(found, "removed", ["A person removed these bytes from the library."]); return null; }
        return { ...found, file, existing };
      };

      const queue = picks.filter(({ candidate }) => !seen.has(candidate.pageId)).slice(0, MAX_DOWNLOADS);
      const downloaded: Downloaded[] = [];
      let next = 0;
      while (next < queue.length && downloaded.length < MAX_SCREENED) {
        const batch = queue.slice(next, next + Math.min(DOWNLOAD_CONCURRENCY, MAX_SCREENED - downloaded.length));
        next += batch.length;
        downloaded.push(...(await Promise.all(batch.map(fetchOne))).filter((entry): entry is Downloaded => entry !== null));
      }
      if (downloaded.length === 0) return false;

      const ids = downloaded.map((_, index) => `p${index + 1}`);
      const screen = await librarian.screen(brief, downloaded.map(({ file }, index) => ({ id: ids[index]!, image: file })));
      if (screen.error) find.librarianErrors.push(screen.error);
      const ranked = new Set(screen.ranked);
      for (const [index, entry] of downloaded.entries()) {
        if (!ranked.has(ids[index]!)) tried(entry, "screened_out", ["The librarian's low-detail screen read it as not what the brief needs."]);
      }

      for (const id of screen.ranked.slice(0, maxJudged)) {
        const entry = downloaded[ids.indexOf(id)]!;
        const { candidate, route, file, existing } = entry;
        let verdict: VisualVerdict;
        try {
          verdict = await judge(file, brief);
        } catch (error) {
          tried(entry, "judge_error", [error instanceof Error ? error.message : String(error)]);
          continue;
        }
        if (!verdict.pass) { tried(entry, "judge_failed", verdict.reasons); continue; }

        if (existing) {
          const { review: _review, ...descriptor } = existing;
          await store!.rememberRoute(descriptor.id, route);
          tried(entry, "reused");
          find.descriptor = descriptor;
          find.outcome = "reused";
          find.foundBy = route;
          return true;
        }

        let descriptor: MediaDescriptorFields;
        try {
          descriptor = commonsDescriptor(brief, candidate, file, newId());
        } catch (error) {
          tried(entry, "invalid", [error instanceof Error ? error.message : String(error)]);
          continue;
        }
        const failures = mediaDescriptorFailures(descriptor);
        if (failures.length) { tried(entry, "invalid", failures); continue; }

        try {
          // Bytes first: a descriptor row must never point at an object the bucket lacks.
          await storage.put(descriptor.storageKey, file.bytes, descriptor.mimeType);
          find.descriptor = await store!.insertUnreviewed(descriptor, route);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`[commons-ingest.ts: findVisualOnCommons] Failed to add a Commons file to the library || title=${candidate.title} storageKey=${descriptor.storageKey} || ${message}`);
        }
        tried(entry, "ingested");
        find.outcome = "ingested";
        find.foundBy = route;
        return true;
      }
      return false;
    }

    const remembered = await store.routes(brief.mediaCategory);
    if (remembered.length) {
      const { picks } = await read(await runRoutes("remembered", remembered), false);
      if (await tryFiles("remembered", picks)) return done();
    }

    const written = await librarian.writeQueries(brief);
    if (written.error) find.librarianErrors.push(written.error);
    const commons = (query: string): MediaSearchRoute => ({ index: "commons", query: commonsSearchString(query, brief.kind) });
    const openverse = (query: string): MediaSearchRoute => ({ index: "openverse", query });
    const first = written.queries.length
      ? [...written.queries.map(commons), ...written.queries.slice(0, OPENVERSE_WRITTEN).map(openverse)]
      : commonsQueries(brief).map((query): MediaSearchRoute => ({ index: "commons", query }));
    const firstPool = await runRoutes("librarian", first);
    const firstRead = await read(firstPool, true);

    const second: MediaSearchRoute[] = [
      ...firstRead.categories.map((query): MediaSearchRoute => ({ index: "commons_category", query })),
      ...firstRead.queries.map(commons),
      ...firstRead.queries.slice(0, OPENVERSE_REFINED).map(openverse),
    ];
    // The second read sees only new files: the first read's picks are already in line, and the rest it passed over.
    const read1 = new Set(firstPool.map(({ candidate }) => candidate.pageId));
    const secondPool = second.length ? (await runRoutes("librarian", second)).filter(({ candidate }) => !read1.has(candidate.pageId)) : [];
    const secondPicks = secondPool.length ? (await read(secondPool, false)).picks : [];
    await tryFiles("librarian", mergePicks(firstRead.picks, secondPicks));
    return done();
  });
}
