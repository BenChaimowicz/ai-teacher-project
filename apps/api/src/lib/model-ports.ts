import { loadModelConfig, type ModelConfig } from "./model-config.ts";
import { ModelError, type ModelErrorCode, type StructuredRequest, type StructuredTransport } from "./openrouter.ts";
import { createTrackedTransport, withModelCall, type ModelCallFrame } from "./usage-tracking.ts";

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
  /** Which models write: the Generator pair, or the Lesson pair for Readings and Quizzes (ADR 0018). */
  authors?: "generator" | "lesson";
  /** Waits before a rate-limited call is retried; tests pass a fake. */
  sleep?: (ms: number) => Promise<void>;
};

/** Every Judge call reasons at high effort unless the request sets its own (ADR 0010). */
const JUDGE_REASONING_EFFORT = "high" as const;

/** Failures one more call can fix: a malformed or cut-off reply. Timeouts and refusals are not retried (ADR 0015). */
const RETRIED: readonly ModelErrorCode[] = ["invalid_output", "incomplete"];

/**
 * A 429 is retried once on the same model after the wait the reply asked for, capped, with a default when it gave none
 * (decision 2026-11-01: OpenRouter caps new accounts at 20 requests a minute per model).
 */
const RATE_LIMIT_WAIT_MS = { fallback: 5_000, max: 30_000 } as const;

/** Real waiting, for production. */
const defaultSleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** One model call the ports may make. */
type Attempt = { modelId: string };

/** Port names in logs, by Usage Record role. */
const PORT_NAMES: Record<ModelCallFrame["role"], string> = { generator: "generator", fallback_generator: "fallback generator", judge: "judge" };

/**
 * Builds the attempt loop around one way of waiting.
 * @param sleep - Waits before a rate-limited call is retried
 */
function attemptWith(sleep: (ms: number) => Promise<void>) {
  /**
   * Makes the first attempt, then the rest only after a retryable failure, logging each one retried. A rate-limited
   * call is first retried once on the same model, after the wait its reply asked for. Each call runs with its role and
   * 1-based attempt number visible to usage tracking; the rate-limit retry keeps the refused call's number.
   * @param role - Which port, for the log and the Usage Record
   * @param attempts - The primary call, its one retry, and the fallback call
   * @param call - Sends one attempt
   * @param log - Where retries are reported
   */
  return async function attempt<T>(role: ModelCallFrame["role"], attempts: Attempt[], call: (attempt: Attempt) => Promise<T>, log: ModelPortsLog): Promise<ModelReply<T>> {
    for (const [index, next] of attempts.entries()) {
      let rateLimited = false;
      for (;;) {
        try {
          return { value: await withModelCall({ role, attempt: index + 1 }, () => call(next)), modelId: next.modelId };
        } catch (error) {
          if (error instanceof ModelError && error.code === "http" && error.status === 429 && !rateLimited) {
            rateLimited = true;
            const waitMs = Math.min(error.retryAfterMs ?? RATE_LIMIT_WAIT_MS.fallback, RATE_LIMIT_WAIT_MS.max);
            log.warn(`[model-ports: ${PORT_NAMES[role]}] Rate limited; retrying in ${waitMs} ms || model=${next.modelId} || ${error.message}`);
            await sleep(waitMs);
            continue;
          }
          const following = attempts[index + 1];
          if (!following || !(error instanceof ModelError) || !RETRIED.includes(error.code)) throw error;
          log.warn(`[model-ports: ${PORT_NAMES[role]}] Retrying after a bad reply || model=${next.modelId} || next=${following.modelId} || ${error.message}`);
          break;
        }
      }
    }
    throw new Error(`[model-ports: ${PORT_NAMES[role]}] No model may make this call`);
  };
}

/**
 * The primary model twice, then the fallback once, skipping any model the caller rules out.
 * @param primary - The configured model
 * @param fallback - The configured fallback, if any
 * @param excluded - Models that may not make this call
 */
function attempts(primary: Attempt, fallback: Attempt | null, excluded: readonly string[] = []): Attempt[] {
  const allowed = (modelId: string) => !excluded.some((author) => author.trim() === modelId.trim());
  const list = allowed(primary.modelId) ? [primary, primary] : [];
  if (fallback?.modelId.trim() && fallback.modelId.trim() !== primary.modelId.trim() && allowed(fallback.modelId)) list.push(fallback);
  return list;
}

/**
 * Creates the domain ports backed by one transport, without making provider calls. `fallbackGenerator` is the
 * configured second author, for steps the spec repeats with another model after a failed check. With
 * `authors: "lesson"`, the two authors are the Lesson pair (ADR 0018).
 */
export function createModelPorts(options: ModelPortsOptions = {}): { generator: Generator; fallbackGenerator: Generator; judge: Judge } {
  const config = options.config ?? loadModelConfig();
  const transport = options.transport ?? createTrackedTransport();
  const log = options.log ?? console;
  const attempt = attemptWith(options.sleep ?? defaultSleep);
  const [primaryModel, fallbackModel] = options.authors === "lesson"
    ? [config.lessonGeneratorModel, config.lessonGeneratorFallbackModel]
    : [config.generatorModel, config.generatorFallbackModel];
  // No host is pinned since ADR 0028: every author gets OpenRouter's default routing.
  return {
    generator: {
      modelId: primaryModel,
      /** Sends structured authoring work through the shared transport. */
      generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
        return attempt("generator", attempts({ modelId: primaryModel }, { modelId: fallbackModel }),
          (next) => transport.complete(next.modelId, request), log);
      },
    },
    fallbackGenerator: {
      modelId: fallbackModel,
      /** Makes the call twice at most on its own model: a second author is already the fallback. */
      generateStructured<T>(request: StructuredRequest<T>): Promise<ModelReply<T>> {
        return attempt("fallback_generator", attempts({ modelId: fallbackModel }, null),
          (next) => transport.complete(next.modelId, request), log);
      },
    },
    judge: {
      modelId: config.judgeModel,
      /** Refuses self-judgment before any provider call or spend. */
      async judge<T>(request: StructuredRequest<T> & { authorModelIds: readonly string[] }): Promise<ModelReply<T>> {
        const { authorModelIds, ...structured } = request;
        const allowed = attempts({ modelId: config.judgeModel }, { modelId: config.judgeFallbackModel }, authorModelIds);
        if (authorModelIds.length === 0 || authorModelIds.some((author) => !author.trim()) || allowed.length === 0) {
          throw new Error("[model-ports: judge] Judge must use a different model from the author");
        }
        const judged = { ...structured, reasoningEffort: structured.reasoningEffort ?? JUDGE_REASONING_EFFORT };
        return attempt("judge", allowed, (next) => transport.complete(next.modelId, judged), log);
      },
    },
  };
}
