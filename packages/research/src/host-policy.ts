import type { FilteredSource } from "./types.ts";

/**
 * Preference list (spec §5.3): named hosts ranked first, without excluding the rest of the web.
 * An entry also matches its subdomains.
 */
export const PREFERENCE_LIST = [
  "openstax.org",
  "khanacademy.org",
  "ocw.mit.edu",
  "britannica.com",
  "en.wikipedia.org",
  "cdc.gov",
  "nist.gov",
  "nasa.gov",
  "pas.org",
  "vicfirth.com",
  "commons.wikimedia.org",
  "online.berklee.edu",
] as const;

/**
 * Denylist (spec §5.3): hosts never used as Sources — social scrapes, quiz and homework mills,
 * aggregators. An entry also matches its subdomains. YouTube is deliberately absent.
 */
export const DENYLIST = [
  "pinterest.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "quizlet.com",
  "brainly.com",
  "chegg.com",
  "coursehero.com",
  "studocu.com",
  "msn.com",
  "news.yahoo.com",
] as const;

/**
 * True when `host` is `entry` or one of its subdomains.
 * @param host - Lowercase host
 * @param entry - List entry
 */
function hostMatches(host: string, entry: string) {
  return host === entry || host.endsWith(`.${entry}`);
}

/**
 * Lowercase host of a URL, without `www.`.
 * @param url - Absolute URL
 */
export function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[host-policy.ts: hostOf] Invalid URL || url=${url} || ${message}`);
  }
}

/**
 * True when the host is on the Preference list.
 * @param host - Lowercase host
 */
export function isPreferredHost(host: string) {
  return PREFERENCE_LIST.some((entry) => hostMatches(host, entry));
}

/**
 * Applies Host policy after retrieval: drops denylisted hosts, then ranks preferred hosts first,
 * keeping vendor order otherwise.
 * @param items - Retrieved items, in vendor order
 * @returns Kept items and what was dropped
 */
export function applyHostPolicy<T extends { url: string }>(items: T[]) {
  const kept: T[] = [];
  const filteredOut: FilteredSource[] = [];
  for (const item of items) {
    const host = hostOf(item.url);
    if (DENYLIST.some((entry) => hostMatches(host, entry))) {
      filteredOut.push({ url: item.url, host, rule: "denylist" });
    } else {
      kept.push(item);
    }
  }
  const preferred = kept.filter((item) => isPreferredHost(hostOf(item.url)));
  const rest = kept.filter((item) => !isPreferredHost(hostOf(item.url)));
  return { kept: [...preferred, ...rest], filteredOut };
}
