import type { PipelineEventStatus, UsageOutcome } from "@senoy/db/usage";

/**
 * Categorical series colors in fixed order, never cycled; anything past the last slot folds into "Other". Validated
 * with the dataviz validator against the console card surface (#0e1522): lightness band, chroma, adjacent CVD
 * ΔE ≥ 8.4, normal-vision ΔE ≥ 19.3, all ≥ 3:1. Slot 1 is the console's blue so the biggest series reads as "ours".
 */
export const SERIES_COLORS = ["#4a9ade", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9"] as const;

/** Color for the folded "Other" series. */
export const OTHER_COLOR = "#5f6b7d";

/** The ice-blue accent used for single-series charts. */
export const ACCENT = "#8ccbf5";

/** Chart chrome on the navy surface. */
export const CHART_INK = { grid: "rgba(148,178,214,0.08)", axis: "#8a98ad", baseline: "rgba(148,178,214,0.22)" } as const;

/**
 * Reserved status colors (never reused for a series), calm rather than neon. Always shipped with an icon + label.
 */
export const STATUS_COLORS = {
  good: "#6ee7a8",
  warning: "#f2c27a",
  serious: "#f0a37a",
  critical: "#f08a80",
  running: "#8ccbf5",
  neutral: "#8a98ad",
} as const;

/** A status tone name. */
export type StatusTone = keyof typeof STATUS_COLORS;

/**
 * Picks the status tone for a Usage Record outcome.
 * @param outcome - The outcome
 * @returns `good` for ok, `warning` for empty research, `serious` for timeout, otherwise `critical`
 */
export function outcomeTone(outcome: UsageOutcome): StatusTone {
  if (outcome === "ok") return "good";
  if (outcome === "empty_vendor" || outcome === "empty_filtered") return "warning";
  if (outcome === "timeout") return "serious";
  return "critical";
}

/**
 * Picks the status tone for a Pipeline Event.
 * @param status - The status
 * @returns The tone
 */
export function stepTone(status: PipelineEventStatus): StatusTone {
  if (status === "ok") return "good";
  if (status === "failed") return "critical";
  return "running";
}

/**
 * Picks the tone for an HTTP status code.
 * @param code - HTTP status
 * @returns `critical` for 5xx, `warning` for 4xx, else `good`
 */
export function httpTone(code: number): StatusTone {
  if (code >= 500) return "critical";
  if (code >= 400) return "warning";
  return "good";
}

/**
 * Assigns series colors to keys in the order given (callers pass keys sorted by spend so the biggest series get
 * the first slots). Keys past the palette map to "Other".
 * @param keys - Series keys, most important first
 * @returns key → color, plus the set of keys that were folded
 */
export function assignColors(keys: string[]): { color: (key: string) => string; folded: Set<string> } {
  const map = new Map<string, string>();
  const folded = new Set<string>();
  keys.forEach((key, i) => {
    if (i < SERIES_COLORS.length) map.set(key, SERIES_COLORS[i]);
    else folded.add(key);
  });
  return { color: (key: string) => map.get(key) ?? OTHER_COLOR, folded };
}
