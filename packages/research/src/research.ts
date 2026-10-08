import { applyHostPolicy, hostOf, isPreferredHost } from "./host-policy.ts";
import { isWikipediaHost, sourceIdFor } from "./source-id.ts";
import type { PackSource, ResearchAdapter, ResearchSlot, SourcePack, VendorResult, VendorSource } from "./types.ts";
import { pinWikipediaRevisions } from "./wikipedia.ts";

/** Dependencies of one research run. Tests pass fakes. */
export type ResearchOptions = {
  primary: ResearchAdapter;
  secondary: ResearchAdapter;
  env: Record<string, string | undefined>;
  fetch?: typeof fetch;
  now?: () => Date;
};

/** How one vendor call ended, with its timing. */
type VendorCall = {
  outcome: { kind: "done"; result: VendorResult } | { kind: "timed_out" } | { kind: "error"; message: string };
  startedAt: Date;
  finishedAt: Date;
};

/**
 * Replaces every occurrence of a secret in `text`.
 * @param text - Message that may contain the secret
 * @param secret - API key
 */
export function redact(text: string, secret: string) {
  return secret ? text.split(secret).join("[redacted]") : text;
}

/**
 * Makes one vendor call under the adapter's time limit. Never throws.
 * @param adapter - Vendor adapter
 * @param topic - Lesson topic
 * @param apiKey - Vendor key
 * @param fetchImpl - fetch to use
 * @param now - Clock
 */
async function callVendor(
  adapter: ResearchAdapter,
  topic: string,
  apiKey: string,
  fetchImpl: typeof fetch,
  now: () => Date,
): Promise<VendorCall> {
  const startedAt = now();
  const signal = AbortSignal.timeout(adapter.timeoutMs);
  try {
    const result = await adapter.research(topic, { apiKey, fetch: fetchImpl, signal });
    return { outcome: { kind: "done", result }, startedAt, finishedAt: now() };
  } catch (error) {
    const finishedAt = now();
    const timedOut = signal.aborted || (error instanceof Error && error.name === "TimeoutError");
    if (timedOut) return { outcome: { kind: "timed_out" }, startedAt, finishedAt };
    const message = error instanceof Error ? error.message : String(error);
    return {
      outcome: { kind: "error", message: redact(`[research.ts: callVendor] ${adapter.id} failed || ${message}`, apiKey) },
      startedAt,
      finishedAt,
    };
  }
}

/**
 * True when the URL is a live Wikipedia article rather than a pinned revision.
 * @param url - Source URL
 */
function isLiveWikipediaUrl(url: string) {
  return isWikipediaHost(hostOf(url)) && !new URL(url).searchParams.has("oldid");
}

/**
 * Merges vendor Sources that are the same page into one, keeping every distinct excerpt.
 * @param vendorSources - Vendor Sources with final URLs
 * @param retrievedAt - When the vendor answered
 */
function mergeByPage(vendorSources: VendorSource[], retrievedAt: string) {
  const bySourceId = new Map<string, PackSource>();
  for (const vendorSource of vendorSources) {
    const sourceId = sourceIdFor(vendorSource.url);
    const host = hostOf(vendorSource.url);
    const source = bySourceId.get(sourceId) ?? {
      sourceId,
      url: vendorSource.url,
      title: vendorSource.title ?? host,
      host,
      preferred: isPreferredHost(host),
      retrievedAt,
      excerptOrigin: "vendor" as const,
      excerpts: [],
    };
    for (const text of vendorSource.excerpts) {
      if (!source.excerpts.some((excerpt) => excerpt.text === text)) {
        source.excerpts.push({ id: `${sourceId}#${source.excerpts.length + 1}`, text });
      }
    }
    bySourceId.set(sourceId, source);
  }
  return [...bySourceId.values()];
}

/**
 * Turns one vendor call into a Source pack: stable URLs, Source IDs, Host policy, and status.
 * @param slot - Primary or Secondary research
 * @param adapter - Vendor adapter used
 * @param topic - Lesson topic
 * @param call - Finished vendor call
 * @param stableByUrl - Live Wikipedia URL → `oldid` URL
 * @param pinWarnings - Wikipedia lookup failures from this run
 */
function buildPack(
  slot: ResearchSlot,
  adapter: ResearchAdapter,
  topic: string,
  call: VendorCall,
  stableByUrl: Map<string, string>,
  pinWarnings: string[],
): SourcePack {
  const base = {
    slot,
    adapter: adapter.id,
    topic,
    startedAt: call.startedAt.toISOString(),
    latencyMs: call.finishedAt.getTime() - call.startedAt.getTime(),
  };
  if (call.outcome.kind !== "done") {
    return {
      ...base,
      status: call.outcome.kind === "timed_out" ? "timed_out" : "error",
      error: call.outcome.kind === "error" ? call.outcome.message : `No answer within ${adapter.timeoutMs} ms`,
      estimatedCostUsd: 0,
      vendorRequestId: null,
      vendorSummary: null,
      sources: [],
      filteredOut: [],
      warnings: [],
    };
  }
  const { result } = call.outcome;
  const warnings: string[] = [];
  const usable: VendorSource[] = [];
  for (const vendorSource of result.sources) {
    const url = stableByUrl.get(vendorSource.url) ?? vendorSource.url;
    try {
      hostOf(url);
      usable.push({ ...vendorSource, url });
    } catch {
      warnings.push(`Dropped a Source with an invalid URL || url=${url}`);
    }
  }
  if (usable.some((source) => isLiveWikipediaUrl(source.url))) warnings.push(...pinWarnings);
  const { kept: sources, filteredOut } = applyHostPolicy(mergeByPage(usable, call.finishedAt.toISOString()));
  const status = usable.length === 0 ? "empty_vendor" : sources.length === 0 ? "empty_filtered" : "ok";
  return {
    ...base,
    status,
    error: null,
    estimatedCostUsd: adapter.estimatedCostUsd,
    vendorRequestId: result.requestId,
    vendorSummary: result.summary,
    sources,
    filteredOut,
    warnings,
  };
}

/**
 * Runs Primary and Secondary research on the same Lesson topic at the same time.
 * A failed, empty, or timed-out call still yields a pack that says so; the other pack is unaffected.
 * @param topic - Lesson topic, sent to both vendors unchanged
 * @param options - Adapters, env with their keys, and optional fetch/clock
 * @returns `[primaryPack, secondaryPack]`
 * @throws Error when the topic is blank or a vendor key is missing (no call is made)
 */
export async function runResearch(topic: string, options: ResearchOptions): Promise<[SourcePack, SourcePack]> {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const query = topic.trim();
  if (!query) throw new Error("[research.ts: runResearch] Topic is blank");
  const slots = [
    { slot: "primary" as const, adapter: options.primary },
    { slot: "secondary" as const, adapter: options.secondary },
  ];
  const keys = slots.map(({ adapter }) => {
    const key = options.env[adapter.envKey]?.trim();
    if (!key) throw new Error(`[research.ts: runResearch] Missing research key || envKey=${adapter.envKey}`);
    return key;
  });
  const calls = await Promise.all(
    slots.map(({ adapter }, index) => callVendor(adapter, query, keys[index]!, fetchImpl, now)),
  );
  const urls = calls.flatMap((call) => (call.outcome.kind === "done" ? call.outcome.result.sources.map((s) => s.url) : []));
  const { stableByUrl, warnings } = await pinWikipediaRevisions(urls, fetchImpl);
  const [primaryPack, secondaryPack] = slots.map(({ slot, adapter }, index) =>
    buildPack(slot, adapter, query, calls[index]!, stableByUrl, warnings),
  );
  return [primaryPack!, secondaryPack!];
}
