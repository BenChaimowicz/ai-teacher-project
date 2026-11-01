import { loadModelConfig } from "@senoy/api/model-config";
import { RESEARCH_ADAPTER_VENDORS, USAGE_VENDORS, type OpsModelEndpoint, type OpsSetup, type OpsSetupModel } from "@senoy/db/usage";
import { researchAdaptersFromEnv } from "@senoy/research";

/** OpenRouter's public list is re-read at most this often. */
const CACHE_MS = 10 * 60 * 1000;

/** Each model's host list must answer within this long. */
const FETCH_TIMEOUT_MS = 8_000;

/** The parameters every structured call sends; with `require_parameters`, only hosts supporting both serve us. */
const REQUIRED_PARAMETERS = ["response_format", "reasoning"];

/** Reads what the app is configured to call, and every host OpenRouter lists for its models. */
export type SetupReader = () => Promise<OpsSetup>;

/**
 * A number from an unknown JSON value, or null.
 * @param raw - Unknown value
 */
function numberOrNull(raw: unknown): number | null {
  const value = typeof raw === "string" ? Number(raw) : raw;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * A USD-per-token price string as USD per million tokens.
 * @param raw - OpenRouter's per-token price
 */
function perMillion(raw: unknown): number | null {
  const value = numberOrNull(raw);
  return value === null ? null : Math.round(value * 1_000_000 * 10_000) / 10_000;
}

/**
 * Turns OpenRouter's `/models/{id}/endpoints` body into our endpoint rows, cheapest prompt price first.
 * @param body - The parsed response body
 * @returns Endpoint rows
 * @throws Error when the body has no endpoint list
 */
export function parseEndpoints(body: unknown): OpsModelEndpoint[] {
  const list = (body as { data?: { endpoints?: unknown } } | null)?.data?.endpoints;
  if (!Array.isArray(list)) throw new Error("[setup.ts: parseEndpoints] OpenRouter returned no endpoint list");
  return list
    .filter((raw): raw is Record<string, unknown> => raw !== null && typeof raw === "object")
    .map((raw) => {
      const pricing = (raw.pricing ?? {}) as Record<string, unknown>;
      const supported = Array.isArray(raw.supported_parameters) ? raw.supported_parameters : [];
      return {
        provider: typeof raw.provider_name === "string" ? raw.provider_name : "unknown",
        tag: typeof raw.tag === "string" ? raw.tag : null,
        promptUsdPerMTok: perMillion(pricing.prompt),
        completionUsdPerMTok: perMillion(pricing.completion),
        servesOurCalls: REQUIRED_PARAMETERS.every((parameter) => supported.includes(parameter)),
        uptimeLast30m: numberOrNull(raw.uptime_last_30m),
        latencyLast30mMs: numberOrNull(raw.latency_last_30m),
        throughputLast30m: numberOrNull(raw.throughput_last_30m),
      };
    })
    .sort((a, b) => (a.promptUsdPerMTok ?? Infinity) - (b.promptUsdPerMTok ?? Infinity));
}

/**
 * Fetches every host OpenRouter lists for one model.
 * @param modelId - `author/slug`
 * @param fetchImpl - fetch to use
 * @returns Endpoint rows
 * @throws Error when the request fails or the body is not a list
 */
async function fetchEndpoints(modelId: string, fetchImpl: typeof fetch): Promise<OpsModelEndpoint[]> {
  try {
    const response = await fetchImpl(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`status=${response.status}`);
    return parseEndpoints(await response.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[setup.ts: fetchEndpoints] Could not read OpenRouter's host list || modelId=${modelId} || ${message}`);
  }
}

/**
 * Creates the reader behind `GET /api/ops/setup`. Model and research choices come from the same config functions the
 * API and worker use, so the console never keeps its own copy. Host lists are cached for ten minutes; a failed fetch
 * is reported on that model and is not cached.
 * @param options.env - Usually `process.env`
 * @param options.fetch - fetch to use; tests pass a fake
 * @param options.now - Clock
 */
export function createSetupReader(options: {
  env: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => Date;
}): SetupReader {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const cache = new Map<string, { at: number; endpoints: OpsModelEndpoint[] }>();

  /** Cached host list for one model. */
  async function endpointsFor(modelId: string) {
    const hit = cache.get(modelId);
    if (hit && now().getTime() - hit.at < CACHE_MS) return hit.endpoints;
    const endpoints = await fetchEndpoints(modelId, fetchImpl);
    cache.set(modelId, { at: now().getTime(), endpoints });
    return endpoints;
  }

  return async () => {
    const config = loadModelConfig(options.env);
    // No host is pinned since ADR 0028, so every preferred list is empty; the field stays for the screen.
    const roles: { role: OpsSetupModel["role"]; modelId: string; preferredProviders: string[] }[] = [
      { role: "generator", modelId: config.generatorModel, preferredProviders: [] },
      { role: "generator_fallback", modelId: config.generatorFallbackModel, preferredProviders: [] },
      { role: "lesson_generator", modelId: config.lessonGeneratorModel, preferredProviders: [] },
      { role: "lesson_generator_fallback", modelId: config.lessonGeneratorFallbackModel, preferredProviders: [] },
      { role: "judge", modelId: config.judgeModel, preferredProviders: [] },
      { role: "judge_fallback", modelId: config.judgeFallbackModel, preferredProviders: [] },
    ];
    const models = await Promise.all(
      roles.map(async (entry): Promise<OpsSetupModel> => {
        try {
          return { ...entry, endpoints: await endpointsFor(entry.modelId), endpointsError: null };
        } catch (error) {
          return { ...entry, endpoints: null, endpointsError: error instanceof Error ? error.message : String(error) };
        }
      }),
    );

    let research: OpsSetup["research"] = [];
    let researchError: string | null = null;
    try {
      const { primary, secondary } = researchAdaptersFromEnv(options.env);
      research = [
        { slot: "primary", adapterId: primary.id, vendor: RESEARCH_ADAPTER_VENDORS[primary.id], estimatedCostUsd: primary.estimatedCostUsd },
        { slot: "secondary", adapterId: secondary.id, vendor: RESEARCH_ADAPTER_VENDORS[secondary.id], estimatedCostUsd: secondary.estimatedCostUsd },
      ];
    } catch (error) {
      researchError = error instanceof Error ? error.message : String(error);
    }

    return { vendors: [...USAGE_VENDORS], models, research, researchError, fetchedAt: now().toISOString() };
  };
}
