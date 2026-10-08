import { createHash } from "node:crypto";

/** Query params that never change which page a URL points at. */
const IGNORED_PARAMS = new Set(["fbclid", "gclid", "oldid"]);

/**
 * True when `host` is a Wikipedia language host, e.g. `en.wikipedia.org`.
 * @param host - Lowercase host
 */
export function isWikipediaHost(host: string) {
  return /^[a-z-]+\.wikipedia\.org$/.test(host);
}

/**
 * Reduces a URL to the page it names, so the same page found by two engines compares equal.
 * Drops scheme, `www.`, fragment, tracking params, and a Wikipedia `oldid` (the article, not the revision).
 * @param url - Absolute Source URL
 * @returns Canonical page key
 */
export function canonicalPageKey(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    let path = decodeURI(parsed.pathname);
    const params = [...parsed.searchParams].filter(
      ([key]) => !key.startsWith("utm_") && !IGNORED_PARAMS.has(key),
    );
    if (isWikipediaHost(host) && path === "/w/index.php") {
      const title = params.find(([key]) => key === "title")?.[1];
      if (title) {
        path = `/wiki/${title.replace(/ /g, "_")}`;
        params.splice(0, params.length);
      }
    }
    if (path.length > 1) path = path.replace(/\/+$/, "");
    params.sort(([a], [b]) => a.localeCompare(b));
    const query = params.map(([key, value]) => `${key}=${value}`).join("&");
    return `${host}${path}${query ? `?${query}` : ""}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[source-id.ts: canonicalPageKey] Invalid Source URL || url=${url} || ${message}`);
  }
}

/**
 * Stable Source ID for a URL. Same page, same ID, in any Source pack.
 * @param url - Absolute Source URL
 * @returns `src_` plus 10 hex chars
 */
export function sourceIdFor(url: string) {
  const digest = createHash("sha256").update(canonicalPageKey(url)).digest("hex");
  return `src_${digest.slice(0, 10)}`;
}
