/** Model IDs for the two domain roles; fallbacks are configuration, not automatic retries. */
export type ModelConfig = {
  generatorModel: string;
  generatorFallbackModel: string;
  /** OpenRouter hosts preferred for author calls, in order; others remain as fallback. */
  generatorProviderOrder: string[];
  judgeModel: string;
  judgeFallbackModel: string;
};

/** Reads model selection without requiring a provider key or making a provider call. */
export function loadModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  return {
    generatorModel: env.GENERATOR_MODEL?.trim() || "deepseek/deepseek-v4-pro",
    generatorFallbackModel: env.GENERATOR_FALLBACK_MODEL?.trim() || "openai/gpt-6.1-sol",
    // Measured 2026-10-10: Alibaba was the only DeepSeek host that honoured the reasoning cap (~35 s per item set vs 66–255 s).
    generatorProviderOrder: (env.GENERATOR_PROVIDER_ORDER?.trim() || "alibaba").split(",").map((slug) => slug.trim()).filter(Boolean),
    judgeModel: env.JUDGE_MODEL?.trim() || "openai/gpt-5.6-luna",
    judgeFallbackModel: env.JUDGE_FALLBACK_MODEL?.trim() || "openai/gpt-6.1-sol",
  };
}
