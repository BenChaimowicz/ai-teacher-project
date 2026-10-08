import { isWikipediaHost } from "./source-id.ts";

/** Wikipedia asks API clients to identify themselves. */
const USER_AGENT = "KnibblerResearch/0.1 (prototype Source packs)";

/** The Action API answers up to 50 titles per request. */
const TITLES_PER_REQUEST = 50;

/** The parts of an Action API `query` response this module reads. */
type RevisionsResponse = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: { title: string; missing?: boolean; revisions?: { revid: number }[] }[];
  };
};

/**
 * Article title from a live Wikipedia `/wiki/…` URL, or null for any other URL.
 * @param url - Absolute URL
 */
function liveArticle(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!isWikipediaHost(host) || !parsed.pathname.startsWith("/wiki/")) return null;
    const title = decodeURIComponent(parsed.pathname.slice("/wiki/".length)).replace(/_/g, " ");
    return title ? { host, title } : null;
  } catch {
    return null;
  }
}

/**
 * Looks up the current revision of up to 50 titles on one Wikipedia host.
 * @param host - e.g. `en.wikipedia.org`
 * @param titles - Article titles as written in the URLs
 * @param fetchImpl - fetch to use
 * @returns Requested title → stable `oldid` URL, for titles that resolved
 */
async function pinTitles(host: string, titles: string[], fetchImpl: typeof fetch) {
  const api = new URL(`https://${host}/w/api.php`);
  api.search = new URLSearchParams({
    action: "query",
    prop: "revisions",
    rvprop: "ids",
    redirects: "1",
    format: "json",
    formatversion: "2",
    titles: titles.join("|"),
  }).toString();
  const response = await fetchImpl(api, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`[wikipedia.ts: pinTitles] Wikipedia API failed || host=${host} || status=${response.status}`);
  }
  const body = (await response.json()) as RevisionsResponse;
  const query = body.query ?? {};
  const renamed = new Map<string, string>();
  for (const step of [...(query.normalized ?? []), ...(query.redirects ?? [])]) renamed.set(step.from, step.to);
  const pages = new Map((query.pages ?? []).map((page) => [page.title, page]));
  const pinned = new Map<string, string>();
  for (const title of titles) {
    let resolved = title;
    for (let hop = 0; hop < 3 && renamed.has(resolved); hop += 1) resolved = renamed.get(resolved)!;
    const revid = pages.get(resolved)?.revisions?.[0]?.revid;
    if (pages.get(resolved)?.missing || !revid) continue;
    const stable = new URL(`https://${host}/w/index.php`);
    stable.search = new URLSearchParams({ title: resolved.replace(/ /g, "_"), oldid: String(revid) }).toString();
    pinned.set(title, stable.toString());
  }
  return pinned;
}

/**
 * Rewrites live Wikipedia article URLs to their current stable `oldid` URL.
 * Non-Wikipedia URLs are not in the result. A failed lookup leaves the live URL and a warning.
 * @param urls - Source URLs from every pack in the run, so both packs pin the same revision
 * @param fetchImpl - fetch to use
 * @returns Live URL → stable URL, plus warnings
 */
export async function pinWikipediaRevisions(urls: string[], fetchImpl: typeof fetch) {
  const titlesByHost = new Map<string, Map<string, string[]>>();
  for (const url of new Set(urls)) {
    const article = liveArticle(url);
    if (!article) continue;
    const titles = titlesByHost.get(article.host) ?? new Map<string, string[]>();
    titles.set(article.title, [...(titles.get(article.title) ?? []), url]);
    titlesByHost.set(article.host, titles);
  }
  const stableByUrl = new Map<string, string>();
  const warnings: string[] = [];
  for (const [host, urlsByTitle] of titlesByHost) {
    const titles = [...urlsByTitle.keys()];
    for (let start = 0; start < titles.length; start += TITLES_PER_REQUEST) {
      const batch = titles.slice(start, start + TITLES_PER_REQUEST);
      try {
        const pinned = await pinTitles(host, batch, fetchImpl);
        for (const title of batch) {
          const stable = pinned.get(title);
          if (!stable) {
            warnings.push(`Wikipedia revision not found; kept live URL || host=${host} || title=${title}`);
            continue;
          }
          for (const url of urlsByTitle.get(title) ?? []) stableByUrl.set(url, stable);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Wikipedia revision lookup failed; kept live URLs || host=${host} || ${message}`);
      }
    }
  }
  return { stableByUrl, warnings };
}
