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
  "drum-stroke",
  "drum-kit-anatomy",
  "drum-stick-anatomy",
  "drum-notation",
  "norse-mythic-depiction",
] as const;

/** One of {@link MEDIA_CATEGORIES}. */
export type MediaCategory = (typeof MEDIA_CATEGORIES)[number];

/**
 * What a Reading's visual is (SEN-121): a *depiction* of a myth, a person or a place; a *diagram* of a process or a
 * structure, including a specimen or result to recognise, drawn as a plain schematic; or a *technique*, a real photograph
 * of a position or movement the Learner copies with their body. Depictions and diagrams are drawn first; a technique is a real image, from the library or Wikimedia
 * Commons, and is never drawn (decision 2026-11-03).
 */
export const VISUAL_KINDS = ["depiction", "diagram", "technique"] as const;

/** One of {@link VISUAL_KINDS}. */
export type VisualKind = (typeof VISUAL_KINDS)[number];

/**
 * One visual a Reading slot plans to show (SEN-121, decision 2026-11-03): what it is for, in the Blueprint author's
 * words, and its kind, which decides how it is made. The Reading writer turns it into a {@link VisualBrief}. A planned
 * visual that cannot be made or found is dropped; it is never a Lesson defect.
 */
export type PlannedVisual = { kind: VisualKind; intent: string };

/** Visuals one Reading plans and shows at most: a one-screen Lesson has room for one, sometimes two. */
export const MAX_SLOT_VISUALS = 2;

/** Facts one brief's `mustShow` lists at most: a checklist a Judge can hold in view, not a specification. */
export const MAX_MUST_SHOW = 6;

/** Topic tags one brief files its visual under at most, the cap a Blueprint slot's tags share. */
export const MAX_BRIEF_TAGS = 5;

/**
 * The Reading writer's description of one visual, shared by everything that makes or finds it: the illustrator draws
 * from it (SEN-128), Commons search and ingest look for it (SEN-129), and the Vision Judge checks the result against
 * `mustShow`, harshly for a technique.
 */
export type VisualBrief = {
  kind: VisualKind;
  /** One plain sentence naming what the visual shows, such as "Yggdrasil, the Norse world ash, and the beings around it". */
  subject: string;
  /** Facts that must be visibly right, one per item, such as "exactly three roots". The Judge fails any it cannot see. */
  mustShow: string[];
  /** One short sentence the Learner reads under the visual, with no Citation. */
  caption: string;
  /** What is visible, for a Learner who cannot see it. */
  alt: string;
  /** The library category and tags a found or drawn file is looked up and filed under. */
  mediaCategory: MediaCategory;
  topicTags: string[];
};

/**
 * Whether a person has looked at a library file (SEN-129). Seeded files were checked by a person before they were
 * committed, so they start `reviewed`. A file found on Wikimedia Commons is used straight away as `unreviewed` until
 * someone approves it in the Usage Console or removes it. A `removed` file is never offered to a new Reading, but its
 * row and bytes stay, so a Lesson that already shows it keeps working, and the same file is never ingested again.
 */
export const MEDIA_REVIEWS = ["reviewed", "unreviewed", "removed"] as const;

/** One of {@link MEDIA_REVIEWS}. */
export type MediaReview = (typeof MEDIA_REVIEWS)[number];

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

/**
 * The MIME types a Reading may attach: stills a vision model can look at. An SVG diagram is checked again for unsafe
 * content and drawn as a PNG for the vision call (SEN-115); the Learner's browser is served the SVG itself.
 */
export const ATTACHABLE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"] as const;

/** Storage keys are lowercase ASCII path segments, so `/media/<key>` needs no escaping and no key is ambiguous. */
export const STORAGE_KEY_PATTERN = /^[a-z0-9][a-z0-9_.-]*(\/[a-z0-9][a-z0-9_.-]*)*$/;

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
  if (!STORAGE_KEY_PATTERN.test(storageKey)) failures.push(`Storage key "${storageKey}" is not lowercase path segments.`);
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

/**
 * Reads descriptor fields back out of stored JSON, such as the snapshot a Lesson's media block carries. It checks only
 * the shape of each field; whether the descriptor obeys the catalog's rules is {@link mediaDescriptorFailures}'s call.
 * @param raw - Unknown JSON
 * @returns The fields, or null when any is missing or the wrong type
 */
export function parseMediaDescriptorFields(raw: unknown): MediaDescriptorFields | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const strings = ["id", "kind", "origin", "license", "caption", "alt", "storageKey", "mimeType", "sha256", "mediaCategory"] as const;
  if (strings.some((key) => typeof row[key] !== "string")) return null;
  if (row.licenseUrl !== null && typeof row.licenseUrl !== "string") return null;
  if (typeof row.byteSize !== "number") return null;
  if ((row.width !== null && typeof row.width !== "number") || (row.height !== null && typeof row.height !== "number")) return null;
  if (!Array.isArray(row.topicTags) || row.topicTags.some((tag) => typeof tag !== "string")) return null;
  let source: MediaSource | null = null;
  if (row.source !== null) {
    const value = row.source as Record<string, unknown> | undefined;
    if (!value || typeof value !== "object" || typeof value.title !== "string" || typeof value.author !== "string" || typeof value.url !== "string") return null;
    source = { title: value.title, author: value.author, url: value.url };
  }
  return {
    id: row.id as string,
    kind: row.kind as MediaKind,
    origin: row.origin as MediaOrigin,
    license: row.license as MediaLicense,
    licenseUrl: row.licenseUrl as string | null,
    caption: row.caption as string,
    alt: row.alt as string,
    source,
    storageKey: row.storageKey as string,
    mimeType: row.mimeType as string,
    byteSize: row.byteSize,
    sha256: row.sha256 as string,
    width: row.width as number | null,
    height: row.height as number | null,
    mediaCategory: row.mediaCategory as MediaCategory,
    topicTags: row.topicTags as string[],
  };
}
