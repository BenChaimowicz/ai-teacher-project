/**
 * Model IDs for the two domain roles; a fallback makes the third call after two bad replies (ADR 0015). Lessons keep
 * their own author pair (ADR 0018) so they can be pinned apart from the other stages; since ADR 0028 both pairs default
 * to the same OpenAI models.
 */
export type ModelConfig = {
  generatorModel: string;
  generatorFallbackModel: string;
  /** Writes Readings and Quizzes; the Lesson fallback writes a fresh draft when its repairs run out (ADR 0017). */
  lessonGeneratorModel: string;
  lessonGeneratorFallbackModel: string;
  judgeModel: string;
  judgeFallbackModel: string;
};

/** Reads model selection without requiring a provider key or making a provider call. */
export function loadModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  return {
    // Every author stage writes with Sol and falls back to Terra (ADR 0028); DeepSeek is gone, and so is its host pin.
    generatorModel: env.GENERATOR_MODEL?.trim() || "openai/gpt-6.1-sol",
    generatorFallbackModel: env.GENERATOR_FALLBACK_MODEL?.trim() || "openai/gpt-6.1-terra",
    lessonGeneratorModel: env.LESSON_GENERATOR_MODEL?.trim() || "openai/gpt-6.1-sol",
    lessonGeneratorFallbackModel: env.LESSON_GENERATOR_FALLBACK_MODEL?.trim() || "openai/gpt-6.1-terra",
    judgeModel: env.JUDGE_MODEL?.trim() || "openai/gpt-6-luna",
    // Never an author (ADR 0015): the previous Luna generation, so Sol-written Lessons keep a working Judge fallback.
    judgeFallbackModel: env.JUDGE_FALLBACK_MODEL?.trim() || "openai/gpt-5.6-luna",
  };
}
