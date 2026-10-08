/** Strict JSON-schema generation with application-owned validation of unknown output. */
export type StructuredRequest<T> = {
  systemPrompt: string;
  input: unknown;
  schemaName: string;
  schema: Readonly<Record<string, unknown>>;
  parse: (value: unknown) => T;
  /** Whole-call limit; defaults to 60 s. Long authoring calls may ask for more. */
  timeoutMs?: number;
  /** How much hidden reasoning a reasoning model may spend; omitted means the model default. */
  reasoningEffort?: ReasoningEffort;
};

/** OpenRouter reasoning effort levels. */
export type ReasoningEffort = "none" | "low" | "medium" | "high";

/** The one transport used by both domain model roles. */
export interface StructuredTransport {
  /** Generates and validates one non-streaming response, with no search or retries. */
  complete<T>(modelId: string, request: StructuredRequest<T>, reasoningEffort?: ReasoningEffort): Promise<T>;
}

/** Injects fetch and credentials without introducing a vendor SDK. */
export type OpenRouterOptions = {
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
};

/** Safe failure categories that do not expose provider bodies, prompts, or credentials. */
export type ModelErrorCode = "configuration" | "network" | "http" | "refusal" | "incomplete" | "invalid_output";

/** A provider failure is not a Validity decision and may be retried by the caller. */
export class ModelError extends Error {
  /** Creates a safe error using only application-owned text and optional HTTP status. */
  constructor(public readonly code: ModelErrorCode, public readonly status?: number) {
    const descriptions: Record<ModelErrorCode, string> = {
      configuration: "Model provider is not configured",
      network: "Model provider could not be reached",
      http: "Model provider request failed",
      refusal: "Model provider refused the request",
      incomplete: "Model provider returned an incomplete response",
      invalid_output: "Model provider returned an invalid structured response",
    };
    super(`[openrouter: complete] ${descriptions[code]} || code=${code}${status === undefined ? "" : ` || status=${status}`}`);
    this.name = "ModelError";
  }
}

/** Extracts only a complete assistant text response, rejecting refusals and tool output. */
function responseContent(raw: unknown): string {
  if (raw === null || typeof raw !== "object" || "error" in raw || !("choices" in raw) ||
      !Array.isArray(raw.choices) || raw.choices.length !== 1) {
    throw new ModelError("invalid_output");
  }
  const choice: unknown = raw.choices[0];
  if (choice === null || typeof choice !== "object" || !("message" in choice) ||
      choice.message === null || typeof choice.message !== "object" || !("finish_reason" in choice)) {
    throw new ModelError("invalid_output");
  }
  const message = choice.message;
  if ("refusal" in message && message.refusal !== null && message.refusal !== undefined && typeof message.refusal !== "string") {
    throw new ModelError("invalid_output");
  }
  if (choice.finish_reason === "content_filter" || ("refusal" in message && typeof message.refusal === "string" && message.refusal.trim())) {
    throw new ModelError("refusal");
  }
  if (choice.finish_reason !== "stop") throw new ModelError("incomplete");
  if (!("role" in message) || message.role !== "assistant" ||
      ("tool_calls" in message && message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0)) ||
      ("function_call" in message && message.function_call != null) ||
      !("content" in message) || typeof message.content !== "string" || !message.content.trim()) {
    throw new ModelError("invalid_output");
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
    async complete<T>(modelId: string, request: StructuredRequest<T>, reasoningEffort?: ReasoningEffort): Promise<T> {
      const effort = reasoningEffort ?? request.reasoningEffort;
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
            // Provider speed varies several-fold for the same model; prefer the fastest that supports strict output.
            provider: { require_parameters: true, sort: "throughput" },
            reasoning: effort ? { effort } : undefined,
            stream: false,
          }),
        });
      } catch {
        throw new ModelError("network");
      }
      if (!response.ok) throw new ModelError("http", response.status);
      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        throw new ModelError("invalid_output");
      }
      const content = responseContent(raw);
      try {
        const value: unknown = JSON.parse(content);
        return request.parse(value);
      } catch {
        throw new ModelError("invalid_output");
      }
    },
  };
}
