import type { MediaLicense, VisualBrief } from "@senoy/db";
import { recordUsage, type UsageRecordRow } from "./usage-tracking.ts";

/**
 * Wikimedia Commons search for a visual the media library lacks (spec §5.6 step 2, SEN-129): the Action API's
 * `generator=search` over File: pages with `imageinfo`, and the licence line the product may host. A file found another
 * way, by an Openverse search or in a Commons category (SEN-132), is read from the same API by page id or category, so
 * every file passes the same licence filter on its own page. Every call to Commons, each search, lookup, and file
 * download, is a Usage Record (vendor `wikimedia`, role `media_search`, cost 0).
 */

/** The Commons Action API endpoint. */
export const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";

/**
 * The thumbnail width asked for and downloaded: wide enough for a Lesson column and for the vision Judge at high detail,
 * small enough that a 20-megapixel original is never fetched. A file narrower than this comes back at its own size.
 */
export const COMMONS_THUMB_WIDTH = 1024;

/** File pages one search returns. Twenty leaves room for the licence and type filters to drop most of them. */
export const COMMONS_SEARCH_LIMIT = 20;

/** A file whose shorter side is under this many pixels is an icon or a crop too small to teach from. */
export const MIN_SHORT_SIDE_PX = 300;

/**
 * The original file types Commons search keeps: stills a Reading can attach (`ATTACHABLE_MIME_TYPES`) minus GIF, which on
 * Commons is mostly animation. An SVG is downloaded as the PNG thumbnail Commons renders, never as SVG source.
 */
export const COMMONS_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"] as const;

/** The `extmetadata` fields the licence filter and the source line read, and the description the librarian reads. */
const EXTMETADATA_FIELDS = [
  "LicenseShortName", "License", "LicenseUrl", "UsageTerms", "AttributionRequired", "Artist", "Credit", "ObjectName", "Restrictions",
  "ImageDescription",
] as const;

/** One `extmetadata` field name. */
type ExtmetadataField = (typeof EXTMETADATA_FIELDS)[number];

/** A File page's `extmetadata`: each field Commons knows, with its value. Values may hold HTML. */
export type CommonsExtmetadata = Partial<Record<ExtmetadataField, { value?: unknown }>>;

/** Env key naming who runs this product, for the User-Agent Wikimedia's policy requires. */
export const WIKIMEDIA_CONTACT_ENV = "WIKIMEDIA_CONTACT";

/**
 * The descriptive User-Agent Wikimedia's User-Agent policy asks for: the product, and how to reach whoever runs it.
 * @param env - Defaults to `process.env`
 * @returns e.g. `Knibbler/1.0 (https://knibbler.app; media library ingest)`
 * @throws Error when `WIKIMEDIA_CONTACT` is unset, since Wikimedia blocks anonymous clients
 */
export function commonsUserAgent(env: NodeJS.ProcessEnv = process.env): string {
  const contact = env[WIKIMEDIA_CONTACT_ENV]?.trim();
  if (!contact) {
    throw new Error(`[commons.ts: commonsUserAgent] Wikimedia needs a contact in the User-Agent || ${WIKIMEDIA_CONTACT_ENV}=unset || Set it to a URL or email that reaches the team.`);
  }
  return `Knibbler/1.0 (${contact}; media library ingest)`;
}

/** A licence the product may host, read off a File page, with the deed URL a CC licence requires. */
export type CommonsLicence = { license: Exclude<MediaLicense, "product_owned">; licenseUrl: string | null };

/** The licence filter's verdict on one File page. */
export type LicenceVerdict = ({ ok: true } & CommonsLicence) | { ok: false; reason: string };

/** The CC0 deed, for a CC0 page that states no URL. */
const CC0_URL = "https://creativecommons.org/publicdomain/zero/1.0/";

/**
 * A field's text, or "" when it is missing or not a string.
 * @param meta - The page's `extmetadata`
 * @param field - Which field
 */
function field(meta: CommonsExtmetadata, field: ExtmetadataField): string {
  const value = meta[field]?.value;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Lowercase words of a licence string, so `CC BY-NC-SA 2.0`, `cc-by-nc-sa-2.0` and `/licenses/by-nc-sa/2.0` all read
 * `cc by nc sa 2 0`.
 * @param text - Any licence string
 */
function words(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
}

/** Terms that end the question: non-commercial, no-derivatives, fair use, or non-free, in any field. */
const FORBIDDEN_TERMS = [" nc ", " noncommercial ", " non commercial ", " nd ", " noderivs ", " noderivatives ", " no derivatives ", " fair use ", " non free "];

/** A CC licence family and version as Commons writes its template code, e.g. `cc-by-sa-3.0-de`. */
const CC_CODE = /^cc-(by|by-sa)-(\d\.\d)(?:-([a-z]{2,3}))?$/;

/** The same as a short name, e.g. `CC BY-SA 3.0 de`. */
const CC_SHORT = /^cc (by|by-sa) (\d\.\d)(?: ([a-z]{2,3}))?$/;

/** Which hostable family a licence string names, or null. */
type Family = { license: CommonsLicence["license"]; version?: string; port?: string };

/**
 * The hostable family the template code (`License`) or the short name names. Anything else, including GFDL,
 * "Copyrighted free use", "Attribution" and Flickr's "No restrictions", names none.
 * @param code - `License`, lowercased
 * @param short - `LicenseShortName`, lowercased
 */
function familyOf(code: string, short: string): { fromCode: Family | null; fromShort: Family | null } {
  const cc = (match: RegExpExecArray | null): Family | null =>
    match ? { license: match[1] === "by" ? "cc_by" : "cc_by_sa", version: match[2], ...(match[3] ? { port: match[3] } : {}) } : null;
  const fromCode = code === "cc0" ? { license: "cc0" as const }
    : code === "pd" || /^pd-/.test(code) ? { license: "public_domain" as const }
    : cc(CC_CODE.exec(code));
  const fromShort = /^cc0( 1\.0)?$/.test(short) ? { license: "cc0" as const }
    : short === "public domain" || /^pd(-|$)/.test(short) ? { license: "public_domain" as const }
    : cc(CC_SHORT.exec(short));
  return { fromCode, fromShort };
}

/**
 * Whether a deed URL is a Creative Commons one for this family.
 * @param url - `LicenseUrl`
 * @param license - The family the page names
 */
function deedMatches(url: string, license: CommonsLicence["license"]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url.startsWith("//") ? `https:${url}` : url);
  } catch {
    return false;
  }
  if (!/(^|\.)creativecommons\.org$/.test(parsed.hostname)) return false;
  const path = parsed.pathname.toLowerCase();
  if (license === "cc0") return path.startsWith("/publicdomain/zero/");
  if (license === "cc_by") return path.startsWith("/licenses/by/");
  return path.startsWith("/licenses/by-sa/");
}

/**
 * Maps a File page's licence fields to a licence the product may host (spec §5.6: public domain, CC0, CC BY, CC BY-SA).
 * This is a legal line, so it keeps only what it can read for certain: anything non-commercial, no-derivatives, fair
 * use, GFDL-only, any other free licence, a page whose fields disagree, one with extra restrictions (trademark,
 * personality rights, insignia), and one that states no licence are all turned down.
 * @param meta - The page's `extmetadata`
 * @returns The licence and deed URL, or why the page was turned down
 */
export function commonsLicence(meta: CommonsExtmetadata): LicenceVerdict {
  const short = field(meta, "LicenseShortName");
  const code = field(meta, "License").toLowerCase();
  const url = field(meta, "LicenseUrl");
  const terms = field(meta, "UsageTerms");
  const restrictions = field(meta, "Restrictions");
  if (!short && !code) return { ok: false, reason: "No licence is stated." };

  const everything = words([short, code, url, terms].join(" "));
  const forbidden = FORBIDDEN_TERMS.find((term) => everything.includes(term));
  if (forbidden) return { ok: false, reason: `The licence "${short || code}" is ${forbidden.trim()}, which the product may not host.` };
  if (restrictions) return { ok: false, reason: `The file carries extra restrictions: ${restrictions}.` };

  const { fromCode, fromShort } = familyOf(code, short.toLowerCase());
  const family = fromCode ?? fromShort;
  if (!family) return { ok: false, reason: `The licence "${short || code}" is not one the product may host.` };
  if (fromCode && fromShort && (fromCode.license !== fromShort.license || fromCode.version !== fromShort.version)) {
    return { ok: false, reason: `The licence fields disagree: License "${code}", LicenseShortName "${short}".` };
  }

  if (family.license === "public_domain") return { ok: true, license: "public_domain", licenseUrl: null };
  if (url && !deedMatches(url, family.license)) {
    return { ok: false, reason: `The licence URL "${url}" is not the deed for "${short || code}".` };
  }
  if (family.license === "cc0") return { ok: true, license: "cc0", licenseUrl: url ? normaliseUrl(url) : CC0_URL };
  const slug = family.license === "cc_by" ? "by" : "by-sa";
  const derived = `https://creativecommons.org/licenses/${slug}/${family.version}/${family.port ? `${family.port}/` : ""}`;
  return { ok: true, license: family.license, licenseUrl: url ? normaliseUrl(url) : derived };
}

/**
 * A protocol-relative URL made https.
 * @param url - A URL as Commons gives it
 */
function normaliseUrl(url: string): string {
  return url.startsWith("//") ? `https:${url}` : url;
}

/** Named HTML entities Commons credit lines use. */
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/**
 * Plain text from an `Artist` or `Credit` value: hidden elements dropped (Commons hides "Unknown author" beside
 * "Anonymous"), tags removed, entities decoded, whitespace collapsed.
 * @param html - The field's value
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<(\w+)[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
      if (name[0] === "#") {
        const point = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : whole;
      }
      return ENTITIES[name.toLowerCase()] ?? whole;
    })
    .replace(/\s+/g, " ")
    .trim();
}

/** The longest author line kept; a few Commons credit lines are whole paragraphs. */
const MAX_AUTHOR_CHARS = 200;

/**
 * The author line for a File page: its `Artist`, else its `Credit`, as plain text. A public-domain or CC0 file with
 * neither says "Unknown author"; a CC BY or CC BY-SA file must name one, so it gets null and is turned down.
 * @param meta - The page's `extmetadata`
 * @param license - Its licence
 */
export function commonsAuthor(meta: CommonsExtmetadata, license: CommonsLicence["license"]): string | null {
  const text = stripHtml(field(meta, "Artist")) || stripHtml(field(meta, "Credit"));
  if (text) return text.length > MAX_AUTHOR_CHARS ? `${text.slice(0, MAX_AUTHOR_CHARS - 1).trimEnd()}…` : text;
  return license === "cc_by" || license === "cc_by_sa" ? null : "Unknown author";
}

/** Words a Commons search gains nothing from: CirrusSearch ANDs every term, so each extra word only loses matches. */
const STOPWORDS = new Set([
  "a", "an", "the", "of", "on", "in", "at", "to", "for", "with", "and", "or", "by", "from", "its", "their", "his", "her",
  "is", "are", "be", "being", "as", "that", "this", "these", "those", "how", "what", "which", "who", "so", "not", "no",
  "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "both", "each", "every", "all", "some", "several",
]);

/**
 * Words about the picture rather than about what is in it: how it was made, how it is framed, and how the things in
 * it are arranged. A brief's subject is written for a reader ("A close-up photograph shows a hand holding a stick");
 * a File page's text names its object, so none of these ever reaches a query.
 */
const META_WORDS = new Set([
  // What the picture is.
  "photograph", "photographed", "photo", "picture", "pictured", "image", "illustration", "illustrated", "drawing", "drawn", "sketch",
  "schematic", "diagram", "figure", "scene", "still", "stills", "panel", "panels", "course", "courses", "own", "real",
  // How it is framed.
  "close", "closeup", "up", "view", "viewed", "shows", "showing", "shown", "show", "seen", "see", "depicts", "depicted", "depicting",
  "labelled", "labeled", "label", "labels", "angle", "detail", "slightly", "partly", "mostly", "roughly", "approximately",
  "about", "visible", "clearly",
  // How things in it are arranged.
  "holding", "held", "hold", "holds", "standing", "stands", "sitting", "sits", "lying", "lies", "resting", "rests", "surrounded",
  "surrounding", "placed", "positioned", "above", "below", "beside", "between", "around", "across", "along", "under", "over",
  "against", "inside", "outside", "front", "behind", "top", "bottom", "side", "sideways", "together",
]);

/** The most words one query carries: CirrusSearch ANDs them, and past four a search almost never matches anything. */
const MAX_QUERY_WORDS = 4;

/**
 * CirrusSearch's file-type filter for a visual kind. Without one, a File: search is mostly scanned books (PDF, DjVu)
 * whose OCR text matches the words. A technique is a photograph; a depiction or diagram may also be a drawing (SVG).
 * @param kind - The brief's visual kind
 */
function fileTypeFilter(kind: VisualBrief["kind"]): string {
  return kind === "technique" ? "filetype:bitmap" : "filetype:bitmap|drawing";
}

/**
 * A keyword search as Commons runs it: the words, limited to the still-image file types of the brief's kind.
 * @param words - The keywords, such as a search the librarian wrote
 * @param kind - The brief's visual kind
 */
export function commonsSearchString(words: string, kind: VisualBrief["kind"]): string {
  return `${words.trim()} ${fileTypeFilter(kind)}`;
}

/**
 * The searches to run for a brief, most specific first, each limited to still-image file types:
 * 1. the tag phrase: the first Topic tag as words, then the object words of the subject it does not already say
 *    ("matched grip hand drumstick");
 * 2. every Topic tag as words ("matched grip fulcrum"), which alone often match the wrong domain ("french grip right
 *    hand" also finds pistols, "fulcrum" finds brooches), so they come second;
 * 3. the subject's object words on their own.
 * Object words are what is in the picture: function words, counting words and every word about the picture itself
 * (photograph, shows, close-up, the Course's own, holding, above) are dropped, since a File page names its object, not
 * its framing. A query that repeats an earlier one's words is dropped.
 * @param brief - What the visual must show
 * @returns One to three search strings
 */
export function commonsQueries(brief: Pick<VisualBrief, "kind" | "subject" | "topicTags">): string[] {
  const unique = (list: string[]) => [...new Set(list)];
  const content = (word: string) => word.length > 1 && !STOPWORDS.has(word) && !META_WORDS.has(word);
  const subjectWords = unique(brief.subject.toLowerCase().replace(/[’']/g, "").replace(/[^\p{L}\p{N}\s-]+/gu, " ").split(/[\s-]+/)).filter(content);
  const tags = brief.topicTags.map((tag) => unique(tag.toLowerCase().split("-")).filter(content));
  const tagWords = unique(tags.flat());
  const objectWords = subjectWords.filter((word) => !tagWords.includes(word));
  const seen = new Set<string>();
  return [[...(tags[0] ?? []), ...objectWords], tagWords, subjectWords]
    .map((words) => words.slice(0, MAX_QUERY_WORDS))
    .filter((words) => {
      const key = [...words].sort().join(" ");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((words) => commonsSearchString(words.join(" "), brief.kind));
}

/** Most page ids one lookup asks for: the Action API's limit for a client without bot rights. */
export const MAX_LOOKUP_PAGE_IDS = 50;

/**
 * An Action API query for File: pages, picked by `pages` (a search, a category, or page ids), with each page's URL,
 * size, MIME type, the licence and credit fields, its description, a thumbnail at {@link COMMONS_THUMB_WIDTH}, and the
 * categories a person can see (hidden maintenance categories left out). `maxlag` asks Commons to refuse rather than
 * queue when its replicas lag, as Wikimedia's API etiquette asks of bots.
 * @param pages - The parameters that pick the pages
 */
function fileInfoUrl(pages: Record<string, string>): string {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    maxlag: "5",
    uselang: "en",
    ...pages,
    prop: "imageinfo|categories",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: String(COMMONS_THUMB_WIDTH),
    iiextmetadatafilter: EXTMETADATA_FIELDS.join("|"),
    iiextmetadatalanguage: "en",
    clshow: "!hidden",
    cllimit: "max",
  });
  return `${COMMONS_API_URL}?${params}`;
}

/**
 * The Action API query for one search: File: pages (namespace 6) in Commons' relevance order.
 * @param query - The search string
 */
export function commonsSearchUrl(query: string): string {
  return fileInfoUrl({ generator: "search", gsrnamespace: "6", gsrsearch: query, gsrlimit: String(COMMONS_SEARCH_LIMIT) });
}

/**
 * The Action API query for the files of one category (SEN-132), in the category's own sort order.
 * @param category - The category title, such as `Category:Drumsticks`
 */
export function commonsCategoryUrl(category: string): string {
  return fileInfoUrl({ generator: "categorymembers", gcmtitle: category, gcmtype: "file", gcmlimit: String(COMMONS_SEARCH_LIMIT) });
}

/**
 * The Action API query for File: pages by page id (SEN-132), such as the Commons files an Openverse search found.
 * @param pageIds - At most {@link MAX_LOOKUP_PAGE_IDS} ids
 */
export function commonsPagesUrl(pageIds: readonly number[]): string {
  return fileInfoUrl({ pageids: pageIds.join("|") });
}

/** One File page a search returned and the filters kept, ready to download and judge. */
export type CommonsCandidate = {
  pageId: number;
  /** e.g. `File:French grip right hand 01.jpg`. */
  title: string;
  /** The File: description page, which a CC licence's attribution must link to. */
  descriptionUrl: string;
  /** The thumbnail to download: never the raw original, which can be tens of megabytes. */
  thumbUrl: string;
  /** The original file's type. */
  mimeType: string;
  width: number;
  height: number;
  /** Position in the reply's order, from 1: Commons' relevance order for a search. */
  rank: number;
  licence: CommonsLicence;
  author: string;
  /** The page's description as plain text, cut to {@link MAX_DESCRIPTION_CHARS}; "" when it has none. */
  description: string;
  /** The categories a person can see on the page, such as `Category:Drumsticks`. */
  categories: string[];
};

/** A File page a filter turned down, and why. */
export type CommonsRejection = { title: string; reason: string };

/** What one search kept and turned down. `query` names the search: its string, category, or page ids. */
export type CommonsSearchResult = { query: string; candidates: CommonsCandidate[]; rejected: CommonsRejection[] };

/** The longest description kept on a candidate: enough for the librarian to tell a drum grip from a pistol grip. */
export const MAX_DESCRIPTION_CHARS = 300;

/** One File page in a `formatversion=2` reply, as far as this module reads it. */
type CommonsPage = {
  pageid?: number;
  title?: string;
  index?: number;
  imageinfo?: {
    mime?: string; width?: number; height?: number; thumburl?: string; descriptionurl?: string; extmetadata?: CommonsExtmetadata;
  }[];
  categories?: { title?: string }[];
};

/**
 * The candidates in one search reply, in relevance order: still images of a kept type, large enough to teach from,
 * under a licence the product may host, with an author line where the licence needs one.
 * @param query - The search string, for the result
 * @param body - The parsed Action API reply
 * @returns What was kept and what was turned down
 */
export function parseCommonsSearch(query: string, body: unknown): CommonsSearchResult {
  const pages = ((body as { query?: { pages?: CommonsPage[] } } | null)?.query?.pages ?? [])
    .slice()
    .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER));
  const candidates: CommonsCandidate[] = [];
  const rejected: CommonsRejection[] = [];

  for (const [position, page] of pages.entries()) {
    const title = page.title ?? `page ${page.pageid ?? "?"}`;
    const info = page.imageinfo?.[0];
    const reject = (reason: string) => void rejected.push({ title, reason });
    if (!info || typeof page.pageid !== "number") { reject("Commons returned no file information."); continue; }
    const { mime, width, height, thumburl, descriptionurl, extmetadata } = info;
    if (!mime || !(COMMONS_MIME_TYPES as readonly string[]).includes(mime)) { reject(`The file type ${mime ?? "unknown"} is not a still a Reading can attach.`); continue; }
    if (!width || !height || Math.min(width, height) < MIN_SHORT_SIDE_PX) { reject(`The file is too small (${width ?? "?"}×${height ?? "?"}).`); continue; }
    if (!thumburl || !descriptionurl) { reject("Commons gave no thumbnail or description page."); continue; }
    const verdict = commonsLicence(extmetadata ?? {});
    if (!verdict.ok) { reject(verdict.reason); continue; }
    const author = commonsAuthor(extmetadata ?? {}, verdict.license);
    if (!author) { reject(`A ${verdict.license} file must name its author, and this one names none.`); continue; }
    const description = stripHtml(field(extmetadata ?? {}, "ImageDescription"));
    candidates.push({
      pageId: page.pageid,
      title,
      descriptionUrl: normaliseUrl(descriptionurl),
      thumbUrl: normaliseUrl(thumburl),
      mimeType: mime,
      width,
      height,
      rank: position + 1,
      licence: { license: verdict.license, licenseUrl: verdict.licenseUrl },
      author,
      description: description.length > MAX_DESCRIPTION_CHARS ? `${description.slice(0, MAX_DESCRIPTION_CHARS - 1).trimEnd()}…` : description,
      categories: (page.categories ?? []).flatMap(({ title: category }) => category ? [category] : []),
    });
  }
  return { query, candidates, rejected };
}

/** How long one Commons call may take. */
const COMMONS_TIMEOUT_MS = 20_000;

/** The largest thumbnail downloaded; a 1024-pixel still is far smaller, so anything bigger is not what was asked for. */
export const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024;

/** The types a downloaded thumbnail may be: rasters only, so no SVG source is ever stored from Commons. */
const DOWNLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** How Commons is reached: the fetch to use and the User-Agent to send. */
export type CommonsClient = { fetch: typeof globalThis.fetch; userAgent: string };

/** Fields every Commons Usage Record shares. */
const COMMONS_USAGE: Pick<UsageRecordRow, "vendor" | "role" | "provider" | "attempt" | "invalidCause" | "promptTokens" | "completionTokens" | "reasoningTokens" | "cachedTokens" | "costUsd" | "costBasis"> = {
  vendor: "wikimedia", role: "media_search", provider: null, attempt: 1, invalidCause: null,
  promptTokens: null, completionTokens: null, reasoningTokens: null, cachedTokens: null, costUsd: 0, costBasis: "actual",
};

/**
 * Classifies a failed fetch as a Usage Record outcome.
 * @param error - What fetch threw
 */
function failureOutcome(error: unknown): "timeout" | "network" {
  const name = (error as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
}

/** A Commons query's result, with the error when the call failed. */
export type CommonsQueryResult = CommonsSearchResult & { error: string | null };

/**
 * Runs one Commons search and records it. A failed call returns no candidates rather than throwing, so a Commons outage
 * means "no image found", as the decision of 2026-11-03 orders; the failure is on the Usage Record and in the result.
 * @param client - fetch and User-Agent
 * @param query - The search string
 * @returns What the search kept and turned down, and the error when it failed
 */
export function searchCommons(client: CommonsClient, query: string): Promise<CommonsQueryResult> {
  return queryCommons(client, "searchCommons", "commons-search", query, commonsSearchUrl(query));
}

/**
 * Reads the files of one Commons category and records the call, as {@link searchCommons} does (SEN-132).
 * @param client - fetch and User-Agent
 * @param category - The category title, such as `Category:Drumsticks`
 */
export function browseCommonsCategory(client: CommonsClient, category: string): Promise<CommonsQueryResult> {
  return queryCommons(client, "browseCommonsCategory", "commons-category", category, commonsCategoryUrl(category));
}

/**
 * Reads File: pages by page id and records the call, as {@link searchCommons} does (SEN-132): how a Commons file another
 * index found gets its licence read off its own page. Candidates come back in the order of `pageIds`.
 * @param client - fetch and User-Agent
 * @param pageIds - At most {@link MAX_LOOKUP_PAGE_IDS} ids; any more are not looked up
 */
export async function lookupCommonsPages(client: CommonsClient, pageIds: readonly number[]): Promise<CommonsQueryResult> {
  const ids = [...new Set(pageIds)].slice(0, MAX_LOOKUP_PAGE_IDS);
  const label = `pageids:${ids.join("|")}`;
  if (ids.length === 0) return { query: label, candidates: [], rejected: [], error: null };
  const result = await queryCommons(client, "lookupCommonsPages", "commons-pages", label, commonsPagesUrl(ids));
  const order = (pageId: number) => ids.indexOf(pageId);
  const candidates = result.candidates.filter(({ pageId }) => ids.includes(pageId))
    .sort((a, b) => order(a.pageId) - order(b.pageId))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
  return { ...result, candidates };
}

/**
 * Runs one Action API query for File: pages and records it; never throws.
 * @param client - fetch and User-Agent
 * @param where - The calling function, for error messages
 * @param modelId - The Usage Record's `modelId`: which kind of Commons call this is
 * @param query - What the call asked for, for the result and the record
 * @param url - The query URL
 */
async function queryCommons(client: CommonsClient, where: string, modelId: string, query: string, url: string): Promise<CommonsQueryResult> {
  const startedAt = performance.now();
  const record = (row: Pick<UsageRecordRow, "outcome" | "httpStatus" | "error" | "response">) => recordUsage({
    ...COMMONS_USAGE, ...row, modelId, responseId: null,
    request: { query, url }, durationMs: Math.round(performance.now() - startedAt),
  });

  let response: Response;
  try {
    response = await client.fetch(url, { headers: { "User-Agent": client.userAgent, accept: "application/json" }, signal: AbortSignal.timeout(COMMONS_TIMEOUT_MS) });
  } catch (error) {
    const message = `[commons.ts: ${where}] Commons call failed || query=${query} || ${error instanceof Error ? error.message : String(error)}`;
    await record({ outcome: failureOutcome(error), httpStatus: null, error: message, response: null });
    return { query, candidates: [], rejected: [], error: message };
  }

  const text = await response.text().catch(() => "");
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Commons answers a throttled or blocked client with plain text; that is reported below.
  }
  const apiError = (body as { error?: { code?: string; info?: string } } | null)?.error;
  if (!response.ok || body === null || apiError) {
    const why = apiError ? `${apiError.code}: ${apiError.info}` : `status ${response.status}: ${text.slice(0, 200)}`;
    const message = `[commons.ts: ${where}] Commons refused the call || query=${query} || ${why}`;
    await record({ outcome: response.ok ? "error" : "http", httpStatus: response.status, error: message, response: body ?? text.slice(0, 2000) });
    return { query, candidates: [], rejected: [], error: message };
  }

  const result = parseCommonsSearch(query, body);
  await record({ outcome: result.candidates.length || result.rejected.length ? "ok" : "empty_vendor", httpStatus: response.status, error: null, response: body });
  return { ...result, error: null };
}

/** A downloaded thumbnail. */
export type CommonsDownload = { bytes: Uint8Array; mimeType: string };

/**
 * Downloads one candidate's thumbnail into memory (never hotlinked: the bytes are copied into our bucket) and records
 * the call. Only a raster of a kept type, no larger than {@link MAX_DOWNLOAD_BYTES}, is returned.
 * @param client - fetch and User-Agent
 * @param candidate - The File page
 * @returns The bytes and their type
 * @throws Error naming the page when the download fails or is not a usable still
 */
export async function downloadCommonsFile(client: CommonsClient, candidate: CommonsCandidate): Promise<CommonsDownload> {
  const startedAt = performance.now();
  const request = { title: candidate.title, url: candidate.thumbUrl };
  const fail = async (outcome: UsageRecordRow["outcome"], httpStatus: number | null, why: string): Promise<never> => {
    const message = `[commons.ts: downloadCommonsFile] Failed to download a Commons file || title=${candidate.title} || ${why}`;
    await recordUsage({ ...COMMONS_USAGE, modelId: "commons-file", responseId: null, outcome, httpStatus, error: message, request, response: null, durationMs: Math.round(performance.now() - startedAt) });
    throw new Error(message);
  };

  let response: Response;
  try {
    response = await client.fetch(candidate.thumbUrl, { headers: { "User-Agent": client.userAgent }, signal: AbortSignal.timeout(COMMONS_TIMEOUT_MS) });
  } catch (error) {
    return fail(failureOutcome(error), null, error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) return fail("http", response.status, `status ${response.status}`);
  const mimeType = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!(DOWNLOAD_MIME_TYPES as readonly string[]).includes(mimeType)) return fail("error", response.status, `content-type ${mimeType || "missing"} is not a raster still`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_DOWNLOAD_BYTES) return fail("error", response.status, `content-length ${declared} is over ${MAX_DOWNLOAD_BYTES}`);

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    return fail("network", response.status, error instanceof Error ? error.message : String(error));
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_DOWNLOAD_BYTES) return fail("error", response.status, `byte size ${bytes.byteLength} is out of range`);

  await recordUsage({
    ...COMMONS_USAGE, modelId: "commons-file", responseId: null, outcome: "ok", httpStatus: response.status, error: null, request,
    response: { mimeType, byteSize: bytes.byteLength }, durationMs: Math.round(performance.now() - startedAt),
  });
  return { bytes, mimeType };
}
