import { RESEARCH_TIERS, type ResearchTier } from "@senoy/db/course-request";
import type { ResearchAdapter, ResearchAdapterId } from "../types.ts";
import { parallelCoreAdapter, parallelProAdapter } from "./parallel-pro.ts";
import { youResearchAdapter, youResearchLiteAdapter } from "./you-research.ts";
import { youSearchAdapter } from "./you-search.ts";

/** Every adapter config may pick. Exa and Linkup are spec options with no adapter yet. */
const ADAPTERS: Record<ResearchAdapterId, ResearchAdapter> = {
  "parallel-pro": parallelProAdapter,
  "parallel-core": parallelCoreAdapter,
  "you-research": youResearchAdapter,
  "you-research-lite": youResearchLiteAdapter,
  "you-search": youSearchAdapter,
};

/**
 * Each adapter's list price per call, in USD (SEN-72: neither vendor reports cost). The Usage Console prices calls
 * rebuilt from stored Source packs with it.
 */
export const RESEARCH_LIST_PRICES_USD: Record<ResearchAdapterId, number> = Object.fromEntries(
  Object.values(ADAPTERS).map((adapter) => [adapter.id, adapter.estimatedCostUsd]),
) as Record<ResearchAdapterId, number>;

/** The two adapters that research every Reading of a Course on one tier: one per slot, on different engines. */
export type ResearchAdapterPair = { primary: ResearchAdapter; secondary: ResearchAdapter };

/**
 * Which adapter pair each research tier uses (spec §5.3, SEN-124). The one place a tier's adapters are named: config
 * picks only the tier, never an adapter.
 */
export const RESEARCH_TIER_ADAPTERS: Record<ResearchTier, ResearchAdapterPair> = {
  deluxe: { primary: parallelProAdapter, secondary: youResearchAdapter },
  regular: { primary: parallelCoreAdapter, secondary: youResearchLiteAdapter },
};

/**
 * What `RESEARCH_TIER` may say: force one tier, or `auto` to apply each Request's rating (spec §5.3).
 */
export const RESEARCH_TIER_MODES = [...RESEARCH_TIERS, "auto"] as const;
export type ResearchTierMode = (typeof RESEARCH_TIER_MODES)[number];

/** `RESEARCH_TIER` when unset: nothing changes in production until we choose (decision 2026-11-02). */
const DEFAULT_RESEARCH_TIER_MODE: ResearchTierMode = "deluxe";

/**
 * Reads `RESEARCH_TIER`: `deluxe` (default when unset or blank), `regular`, or `auto`.
 * @param env - Usually `process.env`
 * @throws Error for any other value, so a typo never silently picks a tier
 */
export function researchTierModeFromEnv(env: Record<string, string | undefined>): ResearchTierMode {
  const raw = env.RESEARCH_TIER?.trim().toLowerCase();
  if (!raw) return DEFAULT_RESEARCH_TIER_MODE;
  if (!RESEARCH_TIER_MODES.includes(raw as ResearchTierMode)) {
    throw new Error(
      `[adapters/index.ts: researchTierModeFromEnv] Unknown research tier || RESEARCH_TIER=${env.RESEARCH_TIER} || known=${RESEARCH_TIER_MODES.join(",")}`,
    );
  }
  return raw as ResearchTierMode;
}

/**
 * The Primary and Secondary research adapters for one tier.
 * @param tier - The Course Request's research tier
 */
export function researchAdaptersForTier(tier: ResearchTier): ResearchAdapterPair {
  return RESEARCH_TIER_ADAPTERS[tier];
}

/**
 * The tier a research call ran on, from the adapter id its Usage Record holds; null for an adapter no tier uses
 * (You.com Web Search, which only the Starting Level fact-check calls).
 * @param adapterId - A research Usage Record's `modelId`
 */
export function researchTierOfAdapter(adapterId: string): ResearchTier | null {
  const tier = RESEARCH_TIERS.find((candidate) => {
    const { primary, secondary } = RESEARCH_TIER_ADAPTERS[candidate];
    return primary.id === adapterId || secondary.id === adapterId;
  });
  return tier ?? null;
}
