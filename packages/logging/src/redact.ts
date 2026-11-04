import { LOG_COMPONENTS, LOG_CONTEXT_MAX_BYTES, LOG_LEVELS, LOG_MESSAGE_MAX_BYTES, TRUNCATION_MARKER, type TruncatedContext } from "@senoy/db/logs";
import type { LogEntryRow } from "./types.ts";

/**
 * Redaction and size caps (ADR 0029). Secrets and emails never reach `log_entries`, and no row is larger than the
 * limits in `@senoy/db/logs`. Prompt and response text is never logged at all: it lives in Usage Records.
 */

/** Keys whose values are replaced by `REDACTED` wherever they appear, at any depth, matched without case. */
export const REDACTED_KEYS = [
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "token",
  "refresh_token",
  "access_token",
  "refreshToken",
  "accessToken",
] as const;

/**
 * Keys redacted only inside a request body (`body.<key>`, `req.body.<key>`): the 6-digit sign-in code. Elsewhere
 * `code` stays readable, because errors carry useful codes (`ECONNRESET`, `email_not_confirmed`).
 */
export const REDACTED_BODY_KEYS = ["code"] as const;

/** What a redacted value becomes. */
export const REDACTED = "[Redacted]";

/** What an email address in a message or a context string becomes. */
export const EMAIL_REPLACEMENT = "[email]";

/**
 * Pino `redact.paths` built from `REDACTED_KEYS` and `REDACTED_BODY_KEYS`, so stdout is redacted the same way.
 * @returns The paths
 */
export function pinoRedactPaths(): string[] {
  const paths = new Set<string>();
  for (const key of REDACTED_KEYS) {
    const step = pathStep(key);
    // Pino's wildcards match one level each, so the keys are covered at the top, one and two levels down, and in the
    // request and reply headers by name.
    paths.add(key.includes("-") ? `[${JSON.stringify(key)}]` : key);
    paths.add(`*${step}`);
    paths.add(`*.*${step}`);
    paths.add(`req.headers${step}`);
    paths.add(`res.headers${step}`);
  }
  for (const key of REDACTED_BODY_KEYS) {
    const step = pathStep(key);
    paths.add(`body${step}`);
    paths.add(`*.body${step}`);
  }
  return [...paths];
}

/**
 * One step of a Pino redact path: `.key`, or `["key"]` for a key that is not a plain identifier.
 * @param key - The key
 */
function pathStep(key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
}

/** `REDACTED_KEYS`, lowercased, for matching without case. */
const REDACTED_KEY_SET: ReadonlySet<string> = new Set(REDACTED_KEYS.map((key) => key.toLowerCase()));

/** `REDACTED_BODY_KEYS`, lowercased. */
const REDACTED_BODY_KEY_SET: ReadonlySet<string> = new Set(REDACTED_BODY_KEYS.map((key) => key.toLowerCase()));

/** Any `local@domain.tld`. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Deeper than this, a context value is replaced by `TOO_DEEP`: no line we log nests this far on purpose. */
const MAX_DEPTH = 12;

/** What a value nested past `MAX_DEPTH` becomes. */
const TOO_DEEP = "[Too deep]";

/** What a value that contains itself becomes, where it repeats. */
const CIRCULAR = "[Circular]";

/**
 * Replaces every email address in a text with `EMAIL_REPLACEMENT`.
 * @param text - A message or a context string
 * @returns The text without email addresses
 */
export function scrubEmails(text: string): string {
  return text.replace(EMAIL, EMAIL_REPLACEMENT);
}

/**
 * A copy of a value with every `REDACTED_KEYS` value replaced by `REDACTED` at any depth, and every string scrubbed of
 * email addresses. Never throws, including on cycles.
 * @param value - A context object or any value inside one
 * @returns The redacted copy
 */
export function redactContext(value: unknown): unknown {
  try {
    return redactValue(value, null, 0, new WeakSet());
  } catch {
    // Only a hostile getter gets here; the value is dropped rather than risk storing a secret.
    return REDACTED;
  }
}

/**
 * The redacted copy of one value.
 * @param value - The value
 * @param parentKey - The key the value sits under, lowercased; null at the top
 * @param depth - How deep the value is
 * @param seen - The objects on the path to this one, to stop at a cycle
 */
function redactValue(value: unknown, parentKey: string | null, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === "string") return scrubEmails(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (depth >= MAX_DEPTH) return TOO_DEEP;
  if (seen.has(value)) return CIRCULAR;
  seen.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => redactValue(item, parentKey, depth + 1, seen) ?? null);
    const source: Record<string, unknown> = value instanceof Error
      ? { ...value, type: value.name, message: value.message, stack: value.stack }
      : (value as Record<string, unknown>);
    const copy: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(source)) {
      const lower = key.toLowerCase();
      if (REDACTED_KEY_SET.has(lower) || (parentKey === "body" && REDACTED_BODY_KEY_SET.has(lower))) {
        copy[key] = REDACTED;
        continue;
      }
      const redacted = redactValue(inner, lower, depth + 1, seen);
      if (redacted !== undefined) copy[key] = redacted;
    }
    return copy;
  } finally {
    // Only the path to a value counts: the same object twice side by side is not a cycle.
    seen.delete(value);
  }
}

/**
 * The start of a text that fits in a number of UTF-8 bytes, cut between characters.
 * @param text - The text
 * @param maxBytes - Bytes it may take
 */
function cutToBytes(text: string, maxBytes: number) {
  let bytes = 0;
  let end = 0;
  for (const char of text) {
    const size = Buffer.byteLength(char);
    if (bytes + size > maxBytes) break;
    bytes += size;
    end += char.length;
  }
  return text.slice(0, end);
}

/** UTF-8 bytes of `TRUNCATION_MARKER`. */
const MARKER_BYTES = Buffer.byteLength(TRUNCATION_MARKER);

/**
 * Cuts a message to `LOG_MESSAGE_MAX_BYTES` of UTF-8, at a character boundary, ending it with `TRUNCATION_MARKER`.
 * @param message - The message
 * @returns The message, unchanged when it fits
 */
export function truncateMessage(message: string): string {
  if (Buffer.byteLength(message) <= LOG_MESSAGE_MAX_BYTES) return message;
  return cutToBytes(message, LOG_MESSAGE_MAX_BYTES - MARKER_BYTES) + TRUNCATION_MARKER;
}

/**
 * Keeps a context within `LOG_CONTEXT_MAX_BYTES` of JSON: one that fits is returned as it is; a larger one becomes a
 * `TruncatedContext` holding the start of its JSON text. Never throws (a context JSON cannot encode is replaced too).
 * @param context - The context
 * @returns The context, or its marked preview
 */
export function truncateContext(context: Record<string, unknown> | null): Record<string, unknown> | TruncatedContext | null {
  if (context === null) return null;
  let json: string;
  try {
    json = JSON.stringify(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { truncated: true, originalBytes: 0, preview: truncateMessage(`(the context could not be encoded as JSON: ${message})`) };
  }
  const originalBytes = Buffer.byteLength(json);
  if (originalBytes <= LOG_CONTEXT_MAX_BYTES) return context;
  // The preview is stored as a JSON string, where quotes and backslashes take two bytes, so it shrinks until it fits.
  let budget = LOG_CONTEXT_MAX_BYTES - 100;
  for (;;) {
    const preview = cutToBytes(json, budget - MARKER_BYTES) + TRUNCATION_MARKER;
    const truncated: TruncatedContext = { truncated: true, originalBytes, preview };
    const over = Buffer.byteLength(JSON.stringify(truncated)) - LOG_CONTEXT_MAX_BYTES;
    if (over <= 0 || budget <= MARKER_BYTES) return truncated;
    budget = Math.max(MARKER_BYTES, budget - over);
  }
}

/** A UUID, as the five id columns store it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The five id fields of a row. */
const ID_FIELDS = ["requestId", "generationJobId", "courseRequestId", "learnerId", "pipelineEventId"] as const;

/** The component and level values the enums accept. */
const COMPONENTS: ReadonlySet<string> = new Set(LOG_COMPONENTS);
const LEVELS: ReadonlySet<string> = new Set(LOG_LEVELS);

/**
 * Whether a row's component and level are values the enums accept; a row that fails this is never stored.
 * @param row - The row
 */
export function hasStorableEnums(row: Pick<LogEntryRow, "component" | "level">): boolean {
  return COMPONENTS.has(row.component) && LEVELS.has(row.level);
}

/**
 * Makes a row safe to insert: an id that is not a UUID moves into the context (a bad id must never fail the batch),
 * the context is redacted and capped, and the message is scrubbed and capped. The sink calls it on every `push`.
 * @param row - The row as a writer built it
 * @returns The row as it will be stored
 */
export function toStorableRow(row: LogEntryRow): LogEntryRow {
  try {
    const ids = {} as Record<(typeof ID_FIELDS)[number], string | null>;
    const invalidIds: Record<string, unknown> = {};
    for (const field of ID_FIELDS) {
      const value: unknown = row[field];
      if (value === null || value === undefined) ids[field] = null;
      else if (typeof value === "string" && UUID.test(value)) ids[field] = value;
      else {
        ids[field] = null;
        invalidIds[field] = value;
      }
    }
    const rawContext: unknown = row.context;
    const base = rawContext && typeof rawContext === "object" && !Array.isArray(rawContext) ? rawContext as Record<string, unknown>
      : rawContext === null || rawContext === undefined ? null : { value: rawContext };
    const withIds = Object.keys(invalidIds).length ? { ...base, invalidIds } : base;
    const cleaned = withIds === null ? null : redactContext(withIds);
    const redacted = cleaned === null || (typeof cleaned === "object" && !Array.isArray(cleaned)) ? cleaned as Record<string, unknown> | null
      : { value: cleaned };
    const loggedAt = row.loggedAt instanceof Date && !Number.isNaN(row.loggedAt.getTime()) ? row.loggedAt : new Date();
    const message = typeof row.message === "string" ? row.message : String(row.message ?? "");
    return {
      loggedAt,
      component: row.component,
      level: row.level,
      message: truncateMessage(scrubEmails(message)),
      context: truncateContext(redacted),
      ...ids,
    };
  } catch {
    // Unreachable in practice: every step above guards itself. The row keeps nothing it could not check.
    return {
      loggedAt: new Date(), component: row.component, level: row.level, message: "(this Log Entry could not be prepared for storage)",
      context: null, requestId: null, generationJobId: null, courseRequestId: null, learnerId: null, pipelineEventId: null,
    };
  }
}
