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

/** Injects fetch and credentials without introducing a vendor SDK. */
export type OpenRouterOptions = {
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
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

/**
 * Creates the reusable native-fetch transport. Credentials are read only when a call is made.
 * No fallback models, tools, plugins, or vendor search are added to requests.
 */
export function createOpenRouterTransport(options: OpenRouterOptions = {}): StructuredTransport {
  return {
    /** Sends a single strict structured call and rejects any unvalidated model output. */
    async complete<T>(modelId: string, request: StructuredRequest<T>, providerOrder?: string[]): Promise<T> {
      const reasoning = request.reasoningEffort ? { effort: request.reasoningEffort }
        : request.reasoningMaxTokens ? { max_tokens: request.reasoningMaxTokens } : undefined;
      const apiKey = (options.apiKey ?? process.env.OPENROUTER_API_KEY)?.trim();
      if (!apiKey) throw new ModelError("configuration");
      let response: Response;
      try {
        response = await (options.fetch ?? globalThis.fetch)("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
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
      if (!response.ok) throw new ModelError("http", { status: response.status });
      let raw: unknown;
      try {
        raw = await response.json();
      } catch (error) {
        throw isTimeout(error) ? new ModelError("timeout") : new ModelError("invalid_output", { invalidCause: "unparseable" });
      }
      const reply = { provider: stringField(raw, "provider"), responseId: stringField(raw, "id") };
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
    },
  };
}
