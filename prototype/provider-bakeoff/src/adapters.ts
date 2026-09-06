import OpenAI from "openai";
import { judgeSchema, quizSchema, readingSchema } from "./schemas.ts";
import type { ModelName } from "./types.ts";

export type StructuredCall = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
};

/** OpenRouter list prices, Sep 2026. */
const RATES: Record<ModelName, { input: number; output: number }> = {
  deepseek: { input: 1.039302 / 1_000_000, output: 2.078604 / 1_000_000 },
  terra: { input: 2 / 1_000_000, output: 12 / 1_000_000 },
};

export const MODELS: Record<ModelName, string> = {
  deepseek: "deepseek/deepseek-v4-pro",
  terra: "openai/gpt-5.6-terra",
};

type Schema = typeof readingSchema | typeof quizSchema | typeof judgeSchema;

function client(): OpenAI {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is missing");
  return new OpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://linear.app/senoy/issue/SEN-20",
      "X-Title": "AI Teacher provider bakeoff",
    },
  });
}

export async function structuredGenerate(
  model: ModelName,
  args: {
    name: string;
    schema: Schema;
    system: string;
    user: string;
    maxTokens: number;
  },
): Promise<StructuredCall> {
  const started = Date.now();
  const response = await client().chat.completions.create({
    model: MODELS[model],
    reasoning_effort: "low",
    max_tokens: args.maxTokens,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: args.name,
        strict: true,
        schema: args.schema,
      },
    },
    // Only hit endpoints that honor json_schema.
    provider: { require_parameters: true },
  } as never);
  const text = response.choices[0]?.message?.content ?? "";
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const rate = RATES[model];
  return {
    text,
    inputTokens,
    outputTokens,
    costUsd: inputTokens * rate.input + outputTokens * rate.output,
    latencyMs: Date.now() - started,
  };
}

export function otherModel(model: ModelName): ModelName {
  return model === "deepseek" ? "terra" : "deepseek";
}
