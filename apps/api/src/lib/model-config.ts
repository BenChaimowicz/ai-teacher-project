/** Model IDs for the two domain roles; fallbacks are configuration, not automatic retries. */
export type ModelConfig = {
  generatorModel: string;
  generatorFallbackModel: string;
  judgeModel: string;
  judgeFallbackModel: string;
};

/** Reads model selection without requiring a provider key or making a provider call. */
export function loadModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  return {
    generatorModel: env.GENERATOR_MODEL?.trim() || "deepseek/deepseek-v4-pro",
    generatorFallbackModel: env.GENERATOR_FALLBACK_MODEL?.trim() || "openai/gpt-5.6-terra",
    judgeModel: env.JUDGE_MODEL?.trim() || "openai/gpt-5.6-luna",
    judgeFallbackModel: env.JUDGE_FALLBACK_MODEL?.trim() || "openai/gpt-5.6-terra",
  };
}
