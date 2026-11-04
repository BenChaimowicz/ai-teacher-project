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
  /** Answers the two small triage questions per Request: the subject check and the research tier (SEN-124). */
  triageModel: string;
  /**
   * Turns a Visual brief into a scene plan the illustration engine draws (SEN-121); its own pair so illustration can be
   * pinned apart, defaulting to the Generator pair (ADR 0028).
   */
  illustratorModel: string;
  illustratorFallbackModel: string;
  /**
   * Checks a technique photograph harshly against its brief (SEN-121): its own setting, so the technique-Judge eval
   * (`check:technique-judge:live`) can pin it; defaults to the Judge's model. Never an author (ADR 0015).
   */
  techniqueJudgeModel: string;
};

/** Reads model selection without requiring a provider key or making a provider call. */
export function loadModelConfig(env: NodeJS.ProcessEnv = process.env): ModelConfig {
  const judgeModel = env.JUDGE_MODEL?.trim() || "openai/gpt-6-luna";
  const generatorModel = env.GENERATOR_MODEL?.trim() || "openai/gpt-6.1-sol";
  const generatorFallbackModel = env.GENERATOR_FALLBACK_MODEL?.trim() || "openai/gpt-6.1-terra";
  return {
    // Every author stage writes with Sol and falls back to Terra (ADR 0028); DeepSeek is gone, and so is its host pin.
    generatorModel,
    generatorFallbackModel,
    lessonGeneratorModel: env.LESSON_GENERATOR_MODEL?.trim() || "openai/gpt-6.1-sol",
    lessonGeneratorFallbackModel: env.LESSON_GENERATOR_FALLBACK_MODEL?.trim() || "openai/gpt-6.1-terra",
    judgeModel,
    // Never an author (ADR 0015): the previous Luna generation, so Sol-written Lessons keep a working Judge fallback.
    judgeFallbackModel: env.JUDGE_FALLBACK_MODEL?.trim() || "openai/gpt-5.6-luna",
    // Cheap model, its own setting; defaults to the Judge's Luna (decision 2026-11-02).
    triageModel: env.TRIAGE_MODEL?.trim() || judgeModel,
    // The illustrator is an author like any other: the Generator pair unless pinned apart (SEN-121).
    illustratorModel: env.ILLUSTRATOR_MODEL?.trim() || generatorModel,
    illustratorFallbackModel: env.ILLUSTRATOR_FALLBACK_MODEL?.trim() || generatorFallbackModel,
    // Picked by the technique-Judge eval on 2026-11-04: 12 of 13 right, no wrong grip let through (SEN-121).
    techniqueJudgeModel: env.TECHNIQUE_JUDGE_MODEL?.trim() || "openai/gpt-5.6-luna",
  };
}
