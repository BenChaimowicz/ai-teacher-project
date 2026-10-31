/**
 * The Media descriptor: what the catalog records about one piece of Demonstrative media (spec §2 "Media catalog",
 * §5.6). The bytes live in the private bucket; the descriptor is application data and the only catalog.
 */

/** What a piece of Demonstrative media is: a still, a silent loop, or an audio clip (spec §5.6). */
export const MEDIA_KINDS = ["image", "animation", "audio"] as const;

/** One of {@link MEDIA_KINDS}. */
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Where a file came from: curated into the library, or made by the generation pipeline (spec §2). */
export const MEDIA_ORIGINS = ["library", "generated"] as const;

/** One of {@link MEDIA_ORIGINS}. */
export type MediaOrigin = (typeof MEDIA_ORIGINS)[number];

/**
 * The licence families the product may host (spec §5.6). CC BY-NC is deliberately absent: a descriptor cannot carry a
 * licence the product cannot host. `product_owned` is original work we made ourselves.
 */
export const MEDIA_LICENSES = ["public_domain", "cc0", "cc_by", "cc_by_sa", "product_owned"] as const;

/** One of {@link MEDIA_LICENSES}. */
export type MediaLicense = (typeof MEDIA_LICENSES)[number];

/** Licences whose terms require full attribution on the descriptor: title, author, source URL and licence URL (TASL). */
export const ATTRIBUTION_LICENSES: readonly MediaLicense[] = ["cc_by", "cc_by_sa"];

/**
 * The coarse technique-family or subject-slice labels library lookup filters on, before Topic tags (CONTEXT: Media
 * category). A closed list in code rather than a Postgres enum, so adding a category when the catalog grows is a code
 * change, not a migration. The writer prompt and the lookup must use this same list, or every lookup misses.
 */
export const MEDIA_CATEGORIES = [
  "gram-stain-result",
  "gram-stain-procedure",
  "bacterial-cell-wall",
  "culture-technique",
  "microscopy",
  "drum-grip",
  "drum-kit-anatomy",
  "drum-stick-anatomy",
  "drum-notation",
  "norse-mythic-depiction",
] as const;

/** One of {@link MEDIA_CATEGORIES}. */
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/** The web page a library file was taken from and who made it. Null only on product-owned files. */
export type MediaSource = {
  /** The file's title on its source page. */
  title: string;
  /** The author or credit line as the source page states it. */
  author: string;
  /** The file's description page, not the raw bytes. */
  url: string;
};

/** The descriptor fields the catalog validates: everything a `media_descriptors` row holds except its timestamps. */
export type MediaDescriptorFields = {
  id: string;
  kind: MediaKind;
  origin: MediaOrigin;
  license: MediaLicense;
  licenseUrl: string | null;
  caption: string;
  alt: string;
  source: MediaSource | null;
  storageKey: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
  width: number | null;
  height: number | null;
  mediaCategory: MediaCategory;
  topicTags: string[];
};

/** Storage keys are lowercase ASCII path segments, so `/media/<key>` needs no escaping and no key is ambiguous. */
const STORAGE_KEY = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)*$/;

/** Topic tags are short lowercase kebab-case labels, the shape the Blueprint already uses. */
const TOPIC_TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** A lowercase hex SHA-256 digest. */
const SHA256 = /^[0-9a-f]{64}$/;

/**
 * Checks one descriptor against the catalog's rules: a hostable licence, attribution where the licence demands it, an
 * honest caption and alt text, a well-formed storage key, a known Media category, and at least one Topic tag.
 * @param descriptor - The fields to check
 * @returns Every rule the descriptor breaks, in plain language; empty when it is valid
 */
export function mediaDescriptorFailures(descriptor: MediaDescriptorFields): string[] {
  const failures: string[] = [];
  const {
    license, licenseUrl, source, caption, alt, storageKey, mimeType, byteSize, sha256, mediaCategory, topicTags, kind, origin,
  } = descriptor;

  if (!(MEDIA_LICENSES as readonly string[]).includes(license)) failures.push(`Licence "${license}" is not one the product can host.`);
  if (!(MEDIA_KINDS as readonly string[]).includes(kind)) failures.push(`Kind "${kind}" is unknown.`);
  if (!(MEDIA_ORIGINS as readonly string[]).includes(origin)) failures.push(`Origin "${origin}" is unknown.`);

  if (license === "product_owned") {
    if (source !== null) failures.push("A product-owned file has no source page.");
  } else {
    if (!source) failures.push("A file taken from elsewhere needs its source page.");
    else {
      if (!source.title.trim()) failures.push("The source title is empty.");
      if (!source.author.trim()) failures.push("The source author is empty.");
      if (!isHttpUrl(source.url)) failures.push(`The source URL is not an http(s) URL: "${source.url}".`);
    }
  }
  if (ATTRIBUTION_LICENSES.includes(license) && !isHttpUrl(licenseUrl ?? "")) {
    failures.push(`Licence ${license} requires a licence URL on the descriptor.`);
  }

  if (!caption.trim()) failures.push("The caption is empty.");
  if (!alt.trim()) failures.push("The alt text is empty.");
  if (!STORAGE_KEY.test(storageKey)) failures.push(`Storage key "${storageKey}" is not lowercase path segments.`);
  if (!/^[a-z]+\/[a-z0-9.+-]+$/.test(mimeType)) failures.push(`MIME type "${mimeType}" is malformed.`);
  if (!Number.isInteger(byteSize) || byteSize <= 0) failures.push("Byte size must be a positive integer.");
  if (!SHA256.test(sha256)) failures.push("The SHA-256 digest must be 64 lowercase hex characters.");
  if (!(MEDIA_CATEGORIES as readonly string[]).includes(mediaCategory)) failures.push(`Media category "${mediaCategory}" is unknown.`);
  if (topicTags.length === 0) failures.push("At least one Topic tag is required.");
  for (const tag of topicTags) {
    if (!TOPIC_TAG.test(tag)) failures.push(`Topic tag "${tag}" is not lowercase kebab-case.`);
  }

  return failures;
}

/**
 * Whether a string parses as an http(s) URL.
 * @param value - The candidate
 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
