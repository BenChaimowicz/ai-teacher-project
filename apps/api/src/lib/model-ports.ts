import { loadModelConfig, type ModelConfig } from "./model-config.ts";
import { createOpenRouterTransport, ModelError, type ModelErrorCode, type StructuredRequest, type StructuredTransport } from "./openrouter.ts";

export type { StructuredRequest } from "./openrouter.ts";

/** A structured result and the model that actually produced it, which may be a fallback (ADR 0015). */
export type ModelReply<T> = { value: T; modelId: string };

/** The authoring role. `modelId` is the primary model; each reply names the model that wrote it. */
export interface Generator {
  readonly modelId: string;
  /** Generates application-validated structured content, without search; one bad reply is retried, then falls back. */
  generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>>;
}

/** The judging role never uses a model that wrote any part of the artifact. */
export interface Judge {
  readonly modelId: string;
  /** Judges structured content with a model outside `authorModelIds`; one bad reply is retried, then falls back. */
  judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>>;
}

/** Where the ports report a call they are about to retry. */
export type ModelPortsLog = { warn(message: string): void };

/** Allows configuration, transport, and log injection at the domain seam. */
export type ModelPortsOptions = {
  config?: ModelConfig;
  transport?: StructuredTransport;
  log?: ModelPortsLog;
};

/** Every Judge call reasons at high effort unless the request sets its own (ADR 0010). */
const JUDGE_REASONING_EFFORT = "high" as const;

/** Failures one more call can fix: a malformed or cut-off reply. Timeouts and refusals are not retried (ADR 0015). */
const RETRIED: readonly ModelErrorCode[] = ["invalid_output", "incomplete"];

/** One model call the ports may make. */
type Attempt = { modelId: string; providerOrder?: string[] };

/**
 * Makes the first attempt, then the rest only after a retryable failure, logging each one retried.
 * @param role - Which port, for the log
 * @param attempts - The primary call, its one retry, and the fallback call
 * @param call - Sends one attempt
 * @param log - Where retries are reported
 */
async function attempt<T>(role: string, attempts: Attempt[], call: (attempt: Attempt) => Promise<T>, log: ModelPortsLog): Promise<ModelReply<T>> {
  for (const [index, next] of attempts.entries()) {
    try {
      return { value: await call(next), modelId: next.modelId };
    } catch (error) {
      const following = attempts[index + 1];
      if (!following || !(error instanceof ModelError) || !RETRIED.includes(error.code)) throw error;
      log.warn(`[model-ports: ${role}] Retrying after a bad reply || model=${next.modelId} || next=${following.modelId} || ${error.message}`);
    }
  }
  throw new Error(`[model-ports: ${role}] No model may make this call`);
}

/**
 * The primary model twice, then the fallback once, skipping any model the caller rules out.
 * @param primary - The configured model, with its preferred hosts
 * @param fallback - The configured fallback; its hosts are left to OpenRouter
 * @param excluded - Models that may not make this call
 */
function attempts(primary: Attempt, fallback: string, excluded: readonly string[] = []): Attempt[] {
  const allowed = (modelId: string) => !excluded.some((author) => author.trim() === modelId.trim());
  const list = allowed(primary.modelId) ? [primary, primary] : [];
  if (fallback.trim() && fallback.trim() !== primary.modelId.trim() && allowed(fallback)) list.push({ modelId: fallback });
  return list;
}

/**
 * Creates the domain ports backed by one transport, without making provider calls. `fallbackGenerator` is the
 * configured second author, for steps the spec repeats with another model after a failed check.
 */
export function createModelPorts(options: ModelPortsOptions = {}): { generator: Generator; fallbackGenerator: Generator; judge: Judge } {
  const config = options.config ?? loadModelConfig();
  const transport = options.transport ?? createOpenRouterTransport();
  const log = options.log ?? console;
  return {
    generator: {
      modelId: config.generatorModel,
      /** Sends structured authoring work through the shared transport. */
      generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
        const primary = { modelId: config.generatorModel, providerOrder: config.generatorProviderOrder };
        return attempt("generator", attempts(primary, config.generatorFallbackModel),
          (next) => transport.complete(next.modelId, request, next.providerOrder), log);
      },
    },
    fallbackGenerator: {
      modelId: config.generatorFallbackModel,
      /** The provider order names the primary author's hosts, so the fallback uses default routing. */
      generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
        return attempt("fallback generator", attempts({ modelId: config.generatorFallbackModel }, ""),
          (next) => transport.complete(next.modelId, request), log);
      },
    },
    judge: {
      modelId: config.judgeModel,
      /** Refuses self-judgment before any provider call or spend. */
      async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
        const { authorModelIds, ...structured } = request;
        const allowed = attempts({ modelId: config.judgeModel }, config.judgeFallbackModel, authorModelIds);
        if (authorModelIds.length === 0 || authorModelIds.some((author) => !author.trim()) || allowed.length === 0) {
          throw new Error("[model-ports: judge] Judge must use a different model from the author");
        }
        const judged = { ...structured, reasoningEffort: structured.reasoningEffort ?? JUDGE_REASONING_EFFORT };
        return attempt("judge", allowed, (next) => transport.complete(next.modelId, judged), log);
      },
    },
  };
}
