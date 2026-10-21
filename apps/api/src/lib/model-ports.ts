import { loadModelConfig, type ModelConfig } from "./model-config.ts";
import { createOpenRouterTransport, ModelError, type StructuredRequest, type StructuredTransport } from "./openrouter.ts";

export type { StructuredRequest } from "./openrouter.ts";

/** The authoring role. Its model ID identifies the author for independent judging. */
export interface Generator {
  readonly modelId: string;
  /** Generates application-validated structured content, without search or automatic retries. */
  generateStructured<T>(request: StructuredRequest<T>): Promise<T>;
}

/** The judging role must use a different model ID from the artifact's author. */
export interface Judge {
  readonly modelId: string;
  /** Judges structured content only after checking author/model independence. */
  judge<T>(request: StructuredRequest<T> & { authorModelId: string }): Promise<T>;
}

/** Allows configuration and transport injection at the domain seam. */
export type ModelPortsOptions = {
  config?: ModelConfig;
  transport?: StructuredTransport;
};

/** Every Judge call reasons at high effort unless the request sets its own (ADR 0010). */
const JUDGE_REASONING_EFFORT = "high" as const;

/**
 * Runs one model step, and once more if its reply was malformed (`invalid_output`). Anything the step returns, such as
 * a reject, a clarify, or a Judge fail, is a real decision and is never re-asked; other errors are not retried either.
 * @param step - One model call, with any checks that turn its reply into a value
 */
export async function retryMalformedOnce<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (!(error instanceof ModelError) || error.code !== "invalid_output") throw error;
    return step();
  }
}

/**
 * Creates the domain ports backed by one transport, without making provider calls. `fallbackGenerator` is the
 * configured second author, for steps the spec retries with another model.
 */
export function createModelPorts(options: ModelPortsOptions = {}): { generator: Generator; fallbackGenerator: Generator; judge: Judge } {
  const config = options.config ?? loadModelConfig();
  const transport = options.transport ?? createOpenRouterTransport();
  return {
    generator: {
      modelId: config.generatorModel,
      /** Sends structured authoring work through the shared transport. */
      generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
        return transport.complete(config.generatorModel, request, config.generatorProviderOrder);
      },
    },
    fallbackGenerator: {
      modelId: config.generatorFallbackModel,
      /** The provider order names the primary author's hosts, so the fallback uses default routing. */
      generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
        return transport.complete(config.generatorFallbackModel, request);
      },
    },
    judge: {
      modelId: config.judgeModel,
      /** Refuses self-judgment before any provider call or spend. */
      async judge<T>(request: StructuredRequest<T> & { authorModelId: string }): Promise<T> {
        if (!request.authorModelId.trim() || request.authorModelId.trim() === config.judgeModel.trim()) {
          throw new Error("[model-ports: judge] Judge must use a different model from the author");
        }
        return transport.complete(config.judgeModel, { ...request, reasoningEffort: request.reasoningEffort ?? JUDGE_REASONING_EFFORT });
      },
    },
  };
}
