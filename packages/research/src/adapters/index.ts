import type { ResearchAdapter, ResearchAdapterId } from "../types.ts";
import { parallelProAdapter } from "./parallel-pro.ts";
import { youResearchAdapter } from "./you-research.ts";

/** Every adapter config may pick. Exa and Linkup are spec options with no adapter yet. */
const ADAPTERS: Record<ResearchAdapterId, ResearchAdapter> = {
  "parallel-pro": parallelProAdapter,
  "you-research": youResearchAdapter,
};

/** Used when the slot's env var is unset. */
const DEFAULTS = { primary: "parallel-pro", secondary: "you-research" } as const;

/**
 * Looks up an adapter by id.
 * @param id - Value from config
 * @param envVar - Config key it came from, for the error message
 * @throws Error for an unknown id
 */
function adapterById(id: string, envVar: string) {
  const adapter = ADAPTERS[id as ResearchAdapterId];
  if (!adapter) {
    throw new Error(
      `[adapters/index.ts: adapterById] Unknown research adapter || ${envVar}=${id} || known=${Object.keys(ADAPTERS).join(",")}`,
    );
  }
  return adapter;
}

/**
 * Picks the Primary and Secondary research adapters from config.
 * @param env - Usually `process.env`
 * @throws Error when an id is unknown or both slots pick the same engine
 */
export function researchAdaptersFromEnv(env: Record<string, string | undefined>) {
  const primary = adapterById(env.PRIMARY_RESEARCH_ADAPTER || DEFAULTS.primary, "PRIMARY_RESEARCH_ADAPTER");
  const secondary = adapterById(env.SECONDARY_RESEARCH_ADAPTER || DEFAULTS.secondary, "SECONDARY_RESEARCH_ADAPTER");
  if (primary.id === secondary.id) {
    throw new Error(
      `[adapters/index.ts: researchAdaptersFromEnv] Primary and Secondary research must use different engines || adapter=${primary.id}`,
    );
  }
  return { primary, secondary };
}
