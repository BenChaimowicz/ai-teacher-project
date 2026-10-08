import { loadModelConfig, type ModelConfig } from "./model-config.ts";
import { createOpenRouterTransport, type StructuredRequest, type StructuredTransport } from "./openrouter.ts";

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

/** Creates two small domain ports backed by one transport, without making provider calls. */
export function createModelPorts(options: ModelPortsOptions = {}): { generator: Generator; judge: Judge } {
  const config = options.config ?? loadModelConfig();
  const transport = options.transport ?? createOpenRouterTransport();
  return {
    generator: {
      modelId: config.generatorModel,
      /** Sends structured authoring work through the shared transport. */
      generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
        return transport.complete(config.generatorModel, request);
      },
    },
    judge: {
      modelId: config.judgeModel,
      /** Refuses self-judgment before any provider call or spend. */
      async judge<T>(request: StructuredRequest<T> & { authorModelId: string }): Promise<T> {
        if (!request.authorModelId.trim() || request.authorModelId.trim() === config.judgeModel.trim()) {
          throw new Error("[model-ports: judge] Judge must use a different model from the author");
        }
        return transport.complete(config.judgeModel, request, "none");
      },
    },
  };
}
