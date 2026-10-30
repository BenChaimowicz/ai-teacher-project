/** Strict JSON-schema generation with application-owned validation of unknown output. */
export type StructuredRequest<T> = {
  systemPrompt: string;
  input: unknown;
  schemaName: string;
  schema: Readonly<Record<string, unknown>>;
  parse: (value: unknown) => T;
  /** Whole-call limit; defaults to 60 s. Long authoring calls may ask for more. */
  timeoutMs?: number;
  /** Hard cap on hidden reasoning tokens; omitted means the model default. Effort hints proved unreliable. */
  reasoningMaxTokens?: number;
  /** Reasoning effort for this call; overrides any token cap. Omitted with no cap means the model default. */
  reasoningEffort?: ReasoningEffort;
};

/** OpenRouter reasoning effort levels. */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

/** The one transport used by both domain model roles. */
export interface StructuredTransport {
  /** Generates and validates one non-streaming response, with no search or retries; the ports retry (ADR 0015). */
  complete<T>(modelId: string, request: StructuredRequest<T>, providerOrder?: string[]): Promise<T>;
}

/** Injects fetch and credentials without introducing a vendor SDK, and an optional observer of every call. */
export type OpenRouterOptions = {
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
  /**
   * Cuts off every call this transport makes once aborted, such as a generation run that lost its job (SEN-93). A call
   * it cuts off, or one started after, throws the signal's reason rather than a `ModelError`, so the ports never retry it.
   */
  signal?: AbortSignal;
  /**
   * Sees every call this transport makes, successful or not, once it ends. It is awaited, and anything it throws is
   * ignored: observing never changes what the call returns or throws.
   */
  observe?: (call: ModelCallObservation) => Promise<void> | void;
};

/** What we sent OpenRouter for one call: everything except credentials and the JSON schema. */
export type ModelCallRequest = {
  systemPrompt: string;
  input: unknown;
  schemaName: string;
  providerOrder?: string[];
  reasoning?: unknown;
  timeoutMs: number;
};

/** Token counts and cost from an OpenRouter `usage` object; each is null when the body did not report it. */
export type ModelUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  reasoningTokens: number | null;
  cachedTokens: number | null;
  /** USD, as OpenRouter reports it in `usage.cost`. */
  costUsd: number | null;
};

/** One finished transport call, as its observer sees it. */
export type ModelCallObservation = {
  modelId: string;
  request: ModelCallRequest;
  /** The provider body as received (parsed JSON, or text when an error body was not JSON); null when none arrived. */
  response: unknown;
  httpStatus: number | null;
  outcome: "ok" | ModelErrorCode;
  invalidCause: InvalidOutputCause | null;
  provider: string | null;
  responseId: string | null;
  /** Null when no body arrived or it had no `usage` object. */
  usage: ModelUsage | null;
  /** The safe ModelError message on failure. */
  error: string | null;
  durationMs: number;
};

/** Safe failure categories that do not expose provider bodies, prompts, or credentials. */
export type ModelErrorCode = "configuration" | "network" | "timeout" | "http" | "refusal" | "incomplete" | "invalid_output";

/**
 * Why a reply was an invalid structured response: it was not JSON or was empty, it did not match the schema, or it
 * matched the schema and our own checks rejected it. Parsers mark their own checks with `check`.
 */
export type InvalidOutputCause = "unparseable" | "schema" | "check";

/** What a ModelError may record besides its code. Never provider bodies, prompts, or credentials. */
export type ModelErrorDetails = {
  status?: number;
  /** Set only on `invalid_output`. */
  invalidCause?: InvalidOutputCause;
  /** The OpenRouter host that answered, when a response arrived. */
  provider?: string;
  /** The OpenRouter response id, when a response arrived. */
  responseId?: string;
};

/** A provider failure is not a Validity decision and may be retried by the caller. */
export class ModelError extends Error {
  public readonly status?: number;
  public readonly invalidCause?: InvalidOutputCause;
  public readonly provider?: string;
  public readonly responseId?: string;

  /** Creates a safe error using only application-owned text, the HTTP status, and response identifiers. */
  constructor(public readonly code: ModelErrorCode, details: ModelErrorDetails = {}) {
    const descriptions: Record<ModelErrorCode, string> = {
      configuration: "Model provider is not configured",
      network: "Model provider could not be reached",
      timeout: "Model provider did not finish within the time limit",
      http: "Model provider request failed",
      refusal: "Model provider refused the request",
      incomplete: "Model provider returned an incomplete response",
      invalid_output: "Model provider returned an invalid structured response",
    };
    const fields = [`code=${code}`, ...(["status", "invalidCause", "provider", "responseId"] as const)
      .filter((key) => details[key] !== undefined).map((key) => `${key}=${details[key]}`)];
    super(`[openrouter: complete] ${descriptions[code]} || ${fields.join(" || ")}`);
    this.name = "ModelError";
    this.status = details.status;
    this.invalidCause = details.invalidCause;
    this.provider = details.provider;
    this.responseId = details.responseId;
  }
}

/**
 * The error a parser throws when a reply matched the schema but our own checks reject it (a wrong count, an unknown
 * id). Stages with a repair loop check these outside the parser instead, so they feed the loop.
 */
export function rejectedOutput(): ModelError {
  return new ModelError("invalid_output", { invalidCause: "check" });
}

/** A string field of an object, if it has one. */
function stringField(raw: unknown, key: string): string | undefined {
  if (raw === null || typeof raw !== "object" || !(key in raw)) return undefined;
  const value: unknown = (raw as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** A finite number, or null. */
function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A nested object field, if it has one. */
function objectField(raw: unknown, key: string): Record<string, unknown> | undefined {
  if (raw === null || typeof raw !== "object" || !(key in raw)) return undefined;
  const value: unknown = (raw as Record<string, unknown>)[key];
  return value !== null && typeof value === "object" ? value as Record<string, unknown> : undefined;
}

/**
 * Reads OpenRouter's `usage` object: tokens, cached and reasoning token details, and `cost` in USD. Every reply carries
 * it, including refusals, cut-off replies, and replies that fail our validation, which are all billed.
 * @param raw - The response body
 * @returns The usage, or null when the body has none
 */
export function modelUsageOf(raw: unknown): ModelUsage | null {
  const usage = objectField(raw, "usage");
  if (!usage) return null;
  return {
    promptTokens: numberOrNull(usage.prompt_tokens),
    completionTokens: numberOrNull(usage.completion_tokens),
    reasoningTokens: numberOrNull(objectField(usage, "completion_tokens_details")?.reasoning_tokens),
    cachedTokens: numberOrNull(objectField(usage, "prompt_tokens_details")?.cached_tokens),
    costUsd: numberOrNull(usage.cost),
  };
}

/** True when the call's time limit aborted it, while connecting or while reading the body. */
function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

/**
 * Extracts only a complete assistant text response, rejecting refusals and tool output.
 * @param raw - The response body
 * @param reply - The host and response id, recorded on any error
 */
function responseContent(raw: unknown, reply: Pick<ModelErrorDetails, "provider" | "responseId">): string {
  const unparseable = () => new ModelError("invalid_output", { ...reply, invalidCause: "unparseable" });
  if (raw === null || typeof raw !== "object" || "error" in raw || !("choices" in raw) ||
      !Array.isArray(raw.choices) || raw.choices.length !== 1) {
    throw unparseable();
  }
  const choice: unknown = raw.choices[0];
  if (choice === null || typeof choice !== "object" || !("message" in choice) ||
      choice.message === null || typeof choice.message !== "object" || !("finish_reason" in choice)) {
    throw unparseable();
  }
  const message = choice.message;
  if ("refusal" in message && message.refusal !== null && message.refusal !== undefined && typeof message.refusal !== "string") {
    throw unparseable();
  }
  if (choice.finish_reason === "content_filter" || ("refusal" in message && typeof message.refusal === "string" && message.refusal.trim())) {
    throw new ModelError("refusal", reply);
  }
  if (choice.finish_reason !== "stop") throw new ModelError("incomplete", reply);
  if (!("role" in message) || message.role !== "assistant" ||
      ("tool_calls" in message && message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0)) ||
      ("function_call" in message && message.function_call != null) ||
      !("content" in message) || typeof message.content !== "string" || !message.content.trim()) {
    throw unparseable();
  }
  return message.content;
}

/** What one call has seen so far, for its observer. */
type CallState = { response: unknown; httpStatus: number | null; provider: string | null; responseId: string | null };

/**
 * Creates the reusable native-fetch transport. Credentials are read only when a call is made.
 * No fallback models, tools, plugins, or vendor search are added to requests. When `options.observe` is set, every call
 * is reported to it once it ends, with the body as received, so a billed reply is recorded even when it fails validation.
 */
export function createOpenRouterTransport(options: OpenRouterOptions = {}): StructuredTransport {
  /**
   * Sends one call and validates its reply, noting what arrived in `state`.
   * @param modelId - OpenRouter model id
   * @param request - The structured request
   * @param reasoning - The reasoning setting sent, if any
   * @param timeoutMs - Whole-call limit
   * @param providerOrder - Preferred hosts
   * @param state - Filled in as the call proceeds
   */
  async function send<T>(
    modelId: string,
    request: StructuredRequest<T>,
    reasoning: unknown,
    timeoutMs: number,
    providerOrder: string[] | undefined,
    state: CallState,
  ): Promise<T> {
    const apiKey = (options.apiKey ?? process.env.OPENROUTER_API_KEY)?.trim();
    if (!apiKey) throw new ModelError("configuration");
    let response: Response;
    try {
      response = await (options.fetch ?? globalThis.fetch)("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        signal: options.signal ? AbortSignal.any([AbortSignal.timeout(timeoutMs), options.signal]) : AbortSignal.timeout(timeoutMs),
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: request.systemPrompt },
            { role: "user", content: JSON.stringify(request.input) },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: request.schemaName, strict: true, schema: request.schema },
          },
          provider: providerOrder?.length
            ? { require_parameters: true, order: providerOrder, allow_fallbacks: true }
            : { require_parameters: true },
          reasoning,
          stream: false,
        }),
      });
    } catch (error) {
      throw new ModelError(isTimeout(error) ? "timeout" : "network");
    }
    state.httpStatus = response.status;
    if (!response.ok) {
      // The error body is kept only for the observer; it never reaches the thrown error.
      if (options.observe) state.response = await errorBody(response);
      throw new ModelError("http", { status: response.status });
    }
    let raw: unknown;
    try {
      raw = await response.json();
    } catch (error) {
      throw isTimeout(error) ? new ModelError("timeout") : new ModelError("invalid_output", { invalidCause: "unparseable" });
    }
    state.response = raw;
    const reply = { provider: stringField(raw, "provider"), responseId: stringField(raw, "id") };
    state.provider = reply.provider ?? null;
    state.responseId = reply.responseId ?? null;
    const content = responseContent(raw, reply);
    let value: unknown;
    try {
      value = JSON.parse(content);
    } catch {
      throw new ModelError("invalid_output", { ...reply, invalidCause: "unparseable" });
    }
    try {
      return request.parse(value);
    } catch (error) {
      const invalidCause = error instanceof ModelError && error.invalidCause === "check" ? "check" : "schema";
      throw new ModelError("invalid_output", { ...reply, invalidCause });
    }
  }

  return {
    /** Sends a single strict structured call and rejects any unvalidated model output. */
    async complete<T>(modelId: string, request: StructuredRequest<T>, providerOrder?: string[]): Promise<T> {
      const reasoning = request.reasoningEffort ? { effort: request.reasoningEffort }
        : request.reasoningMaxTokens ? { max_tokens: request.reasoningMaxTokens } : undefined;
      const timeoutMs = request.timeoutMs ?? 60_000;
      const state: CallState = { response: null, httpStatus: null, provider: null, responseId: null };
      const startedAt = performance.now();

      /** Reports the finished call; an observer failure is ignored. */
      const observe = async (error: unknown) => {
        if (!options.observe) return;
        const failure = error instanceof ModelError ? error : null;
        try {
          await options.observe({
            modelId,
            request: {
              systemPrompt: request.systemPrompt,
              input: request.input,
              schemaName: request.schemaName,
              ...(providerOrder?.length ? { providerOrder } : {}),
              ...(reasoning ? { reasoning } : {}),
              timeoutMs,
            },
            response: state.response,
            httpStatus: state.httpStatus,
            outcome: error === undefined ? "ok" : failure?.code ?? "network",
            invalidCause: failure?.invalidCause ?? null,
            provider: state.provider ?? failure?.provider ?? null,
            responseId: state.responseId ?? failure?.responseId ?? null,
            usage: modelUsageOf(state.response),
            error: error === undefined ? null : error instanceof Error ? error.message : String(error),
            durationMs: Math.round(performance.now() - startedAt),
          });
        } catch {
          // Observing never changes the call's result (ADR 0008).
        }
      };

      options.signal?.throwIfAborted();
      let value: T;
      try {
        value = await send(modelId, request, reasoning, timeoutMs, providerOrder, state);
      } catch (error) {
        // Cut off by the caller: its reason, not a timeout or a bad reply (which the ports would retry).
        const thrown = options.signal?.aborted ? options.signal.reason : error;
        await observe(thrown ?? new Error("Unknown failure"));
        throw thrown;
      }
      await observe(undefined);
      return value;
    },
  };
}

/**
 * Reads an error response body for the observer: JSON when it parses, else its text; null when it cannot be read.
 * @param response - A non-success response
 */
async function errorBody(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}
