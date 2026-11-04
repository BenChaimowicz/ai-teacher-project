import type { TruncatedContext } from "@senoy/db/logs";
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
  // Stub (SEN-116): job 02 builds the paths and tests them against real lines.
  return [];
}

/**
 * Replaces every email address in a text with `EMAIL_REPLACEMENT`.
 * @param text - A message or a context string
 * @returns The text without email addresses
 */
export function scrubEmails(text: string): string {
  // Stub (SEN-116): job 02.
  return text;
}

/**
 * A copy of a value with every `REDACTED_KEYS` value replaced by `REDACTED` at any depth, and every string scrubbed of
 * email addresses. Never throws, including on cycles.
 * @param value - A context object or any value inside one
 * @returns The redacted copy
 */
export function redactContext(value: unknown): unknown {
  // Stub (SEN-116): job 02.
  return value;
}

/**
 * Cuts a message to `LOG_MESSAGE_MAX_BYTES` of UTF-8, at a character boundary, ending it with `TRUNCATION_MARKER`.
 * @param message - The message
 * @returns The message, unchanged when it fits
 */
export function truncateMessage(message: string): string {
  // Stub (SEN-116): job 02.
  return message;
}

/**
 * Keeps a context within `LOG_CONTEXT_MAX_BYTES` of JSON: one that fits is returned as it is; a larger one becomes a
 * `TruncatedContext` holding the start of its JSON text. Never throws (a context JSON cannot encode is replaced too).
 * @param context - The context
 * @returns The context, or its marked preview
 */
export function truncateContext(context: Record<string, unknown> | null): Record<string, unknown> | TruncatedContext | null {
  // Stub (SEN-116): job 02.
  return context;
}

/**
 * Makes a row safe to insert: an id that is not a UUID moves into the context (a bad id must never fail the batch),
 * the context is redacted and capped, and the message is scrubbed and capped. The sink calls it on every `push`.
 * @param row - The row as a writer built it
 * @returns The row as it will be stored
 */
export function toStorableRow(row: LogEntryRow): LogEntryRow {
  // Stub (SEN-116): job 02.
  return row;
}
