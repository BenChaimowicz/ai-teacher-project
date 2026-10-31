import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "image-size";
import { mediaDescriptorFailures, type MediaDescriptorFields } from "@senoy/db";
import { sha256Of } from "./storage.ts";

/**
 * One hand-written catalog entry: everything a person decides about a library file. What the bytes themselves say
 * (size, digest, dimensions, MIME type) is derived from the file when the catalog is resolved, never copied by hand.
 */
export type CatalogEntry = Pick<
  MediaDescriptorFields,
  "id" | "kind" | "origin" | "license" | "licenseUrl" | "caption" | "alt" | "source" | "mediaCategory" | "topicTags"
> & {
  /** Path of the file under `packages/media/catalog`, which is also the tail of its storage key. */
  file: string;
};

/** A catalog entry resolved against its bytes: the full descriptor plus the bytes the seed uploads. */
export type ResolvedCatalogEntry = { descriptor: MediaDescriptorFields; bytes: Uint8Array };

/** Where library files live in the bucket. `/media/library/…` is the stable path a Lesson will serve them from. */
export const LIBRARY_KEY_PREFIX = "library/";

/** The directory the seed files are committed to. */
export const CATALOG_DIR = resolve(fileURLToPath(new URL(".", import.meta.url)), "../catalog");

/** MIME type by file extension, for the file kinds the catalog accepts. */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

/** SVG content the product never hosts: scripts, embedded HTML, event handlers and remote references (spec §5.6). */
const UNSAFE_SVG = /<script|<foreignObject|\son[a-z]+\s*=|href\s*=\s*["']\s*(https?:)?\/\//i;

/**
 * Turns a catalog entry into a full Media descriptor by reading its file: storage key, MIME type, byte size, digest and
 * pixel dimensions come from the bytes.
 * @param entry - The hand-written entry
 * @param bytes - The file's contents
 * @returns The descriptor and the bytes
 */
export function resolveCatalogEntry(entry: CatalogEntry, bytes: Uint8Array): ResolvedCatalogEntry {
  const { file, ...fields } = entry;
  const mimeType = MIME_BY_EXTENSION[extname(file).toLowerCase()];
  if (!mimeType) {
    throw new Error(`[catalog.ts: resolveCatalogEntry] Unsupported file extension || file=${file}`);
  }
  if (mimeType === "image/svg+xml" && UNSAFE_SVG.test(Buffer.from(bytes).toString("utf8"))) {
    throw new Error(`[catalog.ts: resolveCatalogEntry] SVG contains script, foreignObject, event handlers or remote references || file=${file}`);
  }

  let width: number | null = null;
  let height: number | null = null;
  if (mimeType.startsWith("image/")) {
    try {
      const size = imageSize(bytes);
      width = size.width;
      height = size.height;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[catalog.ts: resolveCatalogEntry] Failed to read image dimensions || file=${file} || ${message}`);
    }
  }

  return {
    descriptor: {
      ...fields,
      storageKey: `${LIBRARY_KEY_PREFIX}${file}`,
      mimeType,
      byteSize: bytes.byteLength,
      sha256: sha256Of(bytes),
      width,
      height,
    },
    bytes,
  };
}

/**
 * Resolves every entry against the files in a directory and checks the whole catalog: each descriptor valid, no two
 * entries sharing an id or a file, and no file on disk that no entry claims.
 * @param entries - The hand-written catalog
 * @param dir - Directory holding the files; defaults to the committed one
 * @returns The resolved entries, in catalog order
 * @throws Error listing every problem found, so one run shows them all
 */
export async function resolveCatalog(entries: readonly CatalogEntry[], dir = CATALOG_DIR): Promise<ResolvedCatalogEntry[]> {
  const problems: string[] = [];
  const resolved: ResolvedCatalogEntry[] = [];
  const seenIds = new Set<string>();
  const seenFiles = new Set<string>();

  for (const entry of entries) {
    if (seenIds.has(entry.id)) problems.push(`${entry.file}: id ${entry.id} is used twice.`);
    if (seenFiles.has(entry.file)) problems.push(`${entry.file}: listed twice.`);
    seenIds.add(entry.id);
    seenFiles.add(entry.file);

    let bytes: Uint8Array;
    try {
      bytes = await readFile(resolve(dir, entry.file));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`${entry.file}: cannot read the file || ${message}`);
      continue;
    }

    try {
      const item = resolveCatalogEntry(entry, bytes);
      const failures = mediaDescriptorFailures(item.descriptor);
      if (failures.length > 0) problems.push(`${entry.file}: ${failures.join(" ")}`);
      else resolved.push(item);
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const file of await listFiles(dir)) {
    if (!seenFiles.has(file)) problems.push(`${file}: on disk but not in the catalog.`);
  }

  if (problems.length > 0) {
    throw new Error(`[catalog.ts: resolveCatalog] The media catalog is invalid || problems=${problems.length} ||\n- ${problems.join("\n- ")}`);
  }
  return resolved;
}

/**
 * Every regular file under a directory, as paths relative to it with forward slashes, dotfiles excluded.
 * @param dir - The directory to walk
 */
async function listFiles(dir: string): Promise<string[]> {
  try {
    const found = await readdir(dir, { recursive: true, withFileTypes: true });
    return found
      .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
      .map((entry) => resolve(entry.parentPath, entry.name).slice(dir.length + 1).split("\\").join("/"))
      .sort();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[catalog.ts: listFiles] Failed to list the catalog directory || dir=${dir} || ${message}`);
  }
}
