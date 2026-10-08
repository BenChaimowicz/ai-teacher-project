/** Which research slot a Source pack fills. */
export type ResearchSlot = "primary" | "secondary";

/** Adapter ids that config may pick for a research slot. */
export type ResearchAdapterId = "parallel-pro" | "you-research";

/**
 * Outcome of one research call.
 * `empty_vendor`: the vendor returned no Sources.
 * `empty_filtered`: Host policy dropped every Source the vendor returned.
 * `timed_out`: the call ran past its time limit; not the same as empty.
 * `error`: the vendor call failed.
 */
export type SourcePackStatus = "ok" | "empty_vendor" | "empty_filtered" | "timed_out" | "error";

/** One passage of a Source's text, cited by `id`. */
export type Excerpt = {
  id: string;
  text: string;
};

/** One Source in a Source pack. */
export type PackSource = {
  sourceId: string;
  url: string;
  title: string;
  host: string;
  preferred: boolean;
  retrievedAt: string;
  /** Vendor passages are not verified page text and do not count as quotes. */
  excerptOrigin: "vendor";
  excerpts: Excerpt[];
};

/** A Source that Host policy dropped, and why. */
export type FilteredSource = {
  url: string;
  host: string;
  rule: "denylist";
};

/** The structured evidence one research call returns for a Lesson topic. */
export type SourcePack = {
  slot: ResearchSlot;
  adapter: ResearchAdapterId;
  topic: string;
  status: SourcePackStatus;
  error: string | null;
  startedAt: string;
  latencyMs: number;
  /** From the configured price table; neither vendor reports cost. 0 when the call did not complete. */
  estimatedCostUsd: number;
  vendorRequestId: string | null;
  /** The vendor's own written report. For debugging only; never given to the Generator. */
  vendorSummary: string | null;
  sources: PackSource[];
  filteredOut: FilteredSource[];
  warnings: string[];
};

/** One Source as a vendor returned it, before Host policy and Source IDs. */
export type VendorSource = {
  url: string;
  title: string | null;
  excerpts: string[];
};

/** What a research adapter returns from one completed vendor call. */
export type VendorResult = {
  sources: VendorSource[];
  summary: string | null;
  requestId: string | null;
};

/** Inputs an adapter needs for one call. */
export type AdapterCall = {
  apiKey: string;
  fetch: typeof fetch;
  signal: AbortSignal;
};

/** One research vendor behind a slot. Adapters know nothing about Host policy. */
export type ResearchAdapter = {
  id: ResearchAdapterId;
  /** Name of the env var holding this vendor's key. */
  envKey: string;
  estimatedCostUsd: number;
  timeoutMs: number;
  research(topic: string, call: AdapterCall): Promise<VendorResult>;
};
