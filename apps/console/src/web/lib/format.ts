import type { CostBasis } from "@senoy/db/usage";

/**
 * Formats a USD amount for dense tables. Small amounts keep enough digits to stay distinguishable
 * (an LLM call often costs fractions of a cent).
 * @param usd - Amount in US dollars
 * @returns e.g. `$0`, `$0.00042`, `$0.0123`, `$1.23`, `$1.2K`
 */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : "";
  if (abs >= 10_000) return `${sign}$${compact(abs)}`;
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `${sign}$${Number(abs.toPrecision(2))}`;
}

/**
 * Formats one Usage Record's cost according to where it came from.
 * @param usd - The cost, or null when none is known
 * @param basis - `actual`, `estimated`, or `unknown`
 * @returns `$0.10` for actual, `~$0.10` for estimated, `?` for unknown
 */
export function formatCost(usd: number | null, basis: CostBasis): string {
  if (basis === "unknown" || usd === null) return "?";
  return basis === "estimated" ? `~${formatUsd(usd)}` : formatUsd(usd);
}

/**
 * Formats a duration in milliseconds at the precision a developer cares about.
 * @param ms - Duration in ms, or null
 * @returns e.g. `850ms`, `12.3s`, `4m 12s`, `1h 03m`, or `—`
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 2 : 1)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * Compacts a number: 1,284 → 1.3K, 12_900_000 → 12.9M.
 * @param n - Any number
 * @returns The compact form
 */
export function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/**
 * Formats a token count, compact above 10K.
 * @param n - Token count or null
 * @returns e.g. `812`, `9,140`, `42.1K`, or `—`
 */
export function formatTokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n >= 10_000 ? compact(n) : formatInt(n);
}

/**
 * Formats an integer with thousands separators.
 * @param n - Any number
 * @returns e.g. `1,284`
 */
export function formatInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/**
 * Formats a ratio as a percentage.
 * @param ratio - 0..1, or null when undefined (0/0)
 * @param digits - Fraction digits
 * @returns e.g. `12.5%` or `—`
 */
export function formatPct(ratio: number | null, digits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  return `${(ratio * 100).toFixed(digits)}%`;
}

/**
 * Safe ratio that returns null instead of NaN/Infinity.
 * @param a - Numerator
 * @param b - Denominator
 * @returns a / b, or null when b is 0
 */
export function ratio(a: number, b: number): number | null {
  return b === 0 ? null : a / b;
}

/**
 * Formats an ISO instant as a short local date-time with seconds.
 * @param iso - ISO string
 * @returns e.g. `Oct 24 13:02:11`
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/**
 * Formats an ISO instant relative to now.
 * @param iso - ISO string
 * @returns e.g. `12s ago`, `4m ago`, `3h ago`, `2d ago`
 */
export function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff)) return iso;
  const s = Math.max(0, Math.round(diff / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/**
 * Shortens a uuid-like id for display; the full id goes in a tooltip.
 * @param id - Any id
 * @returns The first 8 characters
 */
export function shortId(id: string | null | undefined): string {
  if (!id) return "—";
  return id.length > 10 ? id.slice(0, 8) : id;
}

/**
 * Turns a snake_case enum value into words.
 * @param value - e.g. `course_generation`
 * @returns e.g. `course generation`
 */
export function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

/**
 * Formats an ISO instant as a short local day, or "today" when it is today.
 * @param iso - ISO string
 * @returns e.g. `today`, `Oct 19`
 */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (d.toDateString() === new Date().toDateString()) return "today";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
