import type { CostBasis, PipelineEventKind, UsageRole, UsageVendor } from "@senoy/db/usage";
import { humanize } from "@/lib/format";

/**
 * Every display name the Usage Console uses, in one place. Domain terms stay as they are (Usage Record, Pipeline
 * Event, tokens, outcome codes, vendor/provider); latency is always in plain words (never p50/p95), step kinds get
 * readable names, and cost basis reads Exact / Estimated / Unknown. Tooltips (`glossary.ts`) explain each one.
 */

/** Nouns for the tracked records. */
export const NOUN = {
  usageRecord: "Usage Record",
  usageRecords: "Usage Records",
  pipelineEvent: "Pipeline Event",
  pipelineEvents: "Pipeline Events",
  productEvent: "Product Event",
  productEvents: "Product Events",
  apiRequest: "API Request",
  apiRequests: "API Requests",
  vendor: "Vendor",
  provider: "Provider",
} as const;

/** Time and size measures. */
export const MEASURE = {
  usual: "Usual time",
  slowest: "Slowest times",
  average: "Average time",
  longest: "Longest",
  tokensIn: "Tokens in",
  tokensOut: "Tokens out",
  reasoning: "Reasoning",
  cached: "Cached",
  tokens: "Tokens",
  spend: "Spend",
  wallTime: "Start to finish",
} as const;

/** Cost basis names. */
export const BASIS_LABEL: Record<CostBasis, string> = { actual: "Exact", estimated: "Estimated", unknown: "Unknown" };

/** Step names (Pipeline Event kinds). */
export const KIND_LABEL: Record<PipelineEventKind, string> = {
  validity: "Checking the request",
  goal_focus: "Focusing the goal",
  diagnostic: "Placement questions",
  fact_check: "Fact check",
  blueprint: "Course plan",
  course_generation: "Writing the course",
  reuse: "Lesson reuse",
  research: "Research",
  reading: "Reading lesson",
  quiz: "Quiz",
  course_judge: "Final review",
  publish: "Publishing",
};

/** Who made a call. */
export const ROLE_LABEL: Record<UsageRole, string> = {
  generator: "Generator",
  fallback_generator: "Fallback Generator",
  judge: "Judge",
  research_primary: "Research (primary)",
  research_secondary: "Research (secondary)",
};

/** Paid service names. */
export const VENDOR_LABEL: Record<UsageVendor, string> = { openrouter: "OpenRouter", parallel: "Parallel", you: "You.com" };

/** Billing check status names. */
export const BILLING_STATUS_LABEL = { ok: "OK", not_configured: "Needs login", error: "Error" } as const;

/** Step status names. */
export const STEP_STATUS_LABEL = { running: "Running", ok: "Done", failed: "Failed" } as const;

/**
 * Names a step kind.
 * @param kind - Pipeline Event kind, or null for calls outside any step
 * @returns e.g. `Placement questions`
 */
export function kindLabel(kind: string | null | undefined): string {
  if (!kind) return "(no step)";
  return KIND_LABEL[kind as PipelineEventKind] ?? humanize(kind);
}

/**
 * Names a role.
 * @param role - Usage role
 * @returns e.g. `Backup writer`
 */
export function roleLabel(role: string): string {
  return ROLE_LABEL[role as UsageRole] ?? humanize(role);
}

/**
 * Shows an outcome code with its detail.
 * @param outcome - The outcome code
 * @param invalidCause - Why an `invalid_output` was invalid
 * @param httpStatus - Status for `http`
 * @returns e.g. `invalid_output/schema`, `http 429`, `timeout`
 */
export function outcomeLabel(outcome: string, invalidCause?: string | null, httpStatus?: number | null): string {
  if (invalidCause) return `${outcome}/${invalidCause}`;
  if (httpStatus) return `${outcome} ${httpStatus}`;
  return outcome;
}

/**
 * Names a paid service.
 * @param vendor - Vendor key
 * @returns e.g. `OpenRouter`
 */
export function vendorLabel(vendor: string): string {
  return VENDOR_LABEL[vendor as UsageVendor] ?? vendor;
}

/**
 * Names a Product Event kind.
 * @param kind - Product Event kind
 * @returns e.g. `blueprint approved`
 */
export function productEventLabel(kind: string): string {
  return humanize(kind);
}

/**
 * Names an attempt.
 * @param attempt - 1-based attempt number
 * @returns e.g. `Attempt 2`
 */
export function tryLabel(attempt: number): string {
  return `Attempt ${attempt}`;
}

/** Names for the configured model roles in `/api/ops/setup`. */
export const SETUP_ROLE_LABEL: Record<string, string> = {
  generator: "Generator",
  generator_fallback: "Fallback Generator",
  lesson_generator: "Lesson Generator",
  lesson_generator_fallback: "Fallback Lesson Generator",
  judge: "Judge",
  judge_fallback: "Fallback Judge",
};
