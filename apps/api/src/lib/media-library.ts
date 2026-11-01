import { ATTACHABLE_MIME_TYPES, mediaDescriptors, type Database, type MediaCategory, type MediaDescriptorFields } from "@senoy/db";
import { createMediaStorage, mediaStorageConfigFromEnv, sha256Of, type MediaStorage } from "@senoy/media";
import type { Readable } from "node:stream";

/** A Media category and the Topic tags its library files carry, as the Reading writer is shown them. */
export type MediaVocabulary = { mediaCategory: MediaCategory; topicTags: string[] }[];

/** What the Reading generator needs from the Media catalog and the private bucket (spec §5.6). */
export interface MediaLibrary {
  /** Each Media category that has a file a Reading may attach, with the Topic tags those files carry. */
  vocabulary(): Promise<MediaVocabulary>;
  /** Attachable library files in `mediaCategory` that share a Topic tag with `topicTags`, best match first. */
  candidates(mediaCategory: MediaCategory, topicTags: readonly string[]): Promise<MediaDescriptorFields[]>;
  /**
   * The file's bytes, once checked against the descriptor's digest and size.
   * @throws Error when the bucket has no such file, holds different bytes, or cannot be read
   */
  bytes(descriptor: MediaDescriptorFields): Promise<Uint8Array>;
}

/**
 * Whether a Reading may attach a file: a library still in a type a vision model can be shown. Generated files are not
 * library files and are never looked up.
 * @param descriptor - The file's descriptor
 */
export function isAttachable(descriptor: Pick<MediaDescriptorFields, "origin" | "kind" | "mimeType">): boolean {
  return descriptor.origin === "library" && descriptor.kind === "image" && (ATTACHABLE_MIME_TYPES as readonly string[]).includes(descriptor.mimeType);
}

/**
 * The Media categories of a set of attachable files, each with every Topic tag its files carry, sorted so the same
 * catalog always reads the same.
 * @param rows - Attachable files
 */
export function vocabularyOf(rows: readonly Pick<MediaDescriptorFields, "mediaCategory" | "topicTags">[]): MediaVocabulary {
  const byCategory = new Map<MediaCategory, Set<string>>();
  for (const row of rows) {
    const tags = byCategory.get(row.mediaCategory) ?? new Set<string>();
    for (const tag of row.topicTags) tags.add(tag);
    byCategory.set(row.mediaCategory, tags);
  }
  return [...byCategory].sort(([a], [b]) => a.localeCompare(b)).map(([mediaCategory, tags]) => ({ mediaCategory, topicTags: [...tags].sort() }));
}

/**
 * Ranks library files for a Reading's request: only those sharing at least one Topic tag, most shared tags first, then
 * by storage key, so the same request always picks the same file.
 * @param rows - Attachable files in the requested Media category
 * @param topicTags - The tags the writer asked for
 */
export function rankCandidates(rows: readonly MediaDescriptorFields[], topicTags: readonly string[]): MediaDescriptorFields[] {
  const wanted = new Set(topicTags);
  return rows
    .map((row) => ({ row, shared: row.topicTags.filter((tag) => wanted.has(tag)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared || a.row.storageKey.localeCompare(b.row.storageKey))
    .map(({ row }) => row);
}

/**
 * Reads a stream to the end.
 * @param body - The object's bytes
 */
async function readAll(body: Readable): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * The library over the `media_descriptors` table and the private bucket. The catalog is read once per library, so one
 * generation run sees one catalog; the bucket is opened on the first file read.
 * @param db - Database
 * @param storage - The bucket; defaults to the one the env keys name
 */
export function createMediaLibrary(db: Database, storage?: MediaStorage): MediaLibrary {
  let catalog: Promise<MediaDescriptorFields[]> | null = null;
  let bucket: MediaStorage | null = storage ?? null;

  /** Every file a Reading may attach. The catalog is a few dozen rows, so it is read whole and filtered here. */
  function attachable(): Promise<MediaDescriptorFields[]> {
    catalog ??= db.select().from(mediaDescriptors)
      .then((rows) => rows.map(({ createdAt: _created, updatedAt: _updated, ...fields }) => fields).filter(isAttachable))
      .catch((error: unknown) => {
        catalog = null;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[media-library: attachable] Failed to read the Media catalog || ${message}`);
      });
    return catalog;
  }

  return {
    async vocabulary() {
      return vocabularyOf(await attachable());
    },

    async candidates(mediaCategory, topicTags) {
      return rankCandidates((await attachable()).filter((row) => row.mediaCategory === mediaCategory), topicTags);
    },

    async bytes(descriptor) {
      const { storageKey } = descriptor;
      try {
        bucket ??= createMediaStorage(mediaStorageConfigFromEnv());
        const object = await bucket.get(storageKey);
        if (!object) throw new Error("The bucket has no object at this key");
        const bytes = await readAll(object.body);
        if (bytes.byteLength !== descriptor.byteSize || sha256Of(bytes) !== descriptor.sha256) {
          throw new Error("The stored bytes are not the file the descriptor describes");
        }
        return bytes;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[media-library: bytes] Failed to read a library file || storageKey=${storageKey} || ${message}`);
      }
    },
  };
}
