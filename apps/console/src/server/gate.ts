import { createHash, timingSafeEqual } from "node:crypto";

/** Header an Operator sends to reach `/api/ops/*` when `OPERATOR_KEY` is set. */
export const OPERATOR_KEY_HEADER = "x-operator-key";

/**
 * Compares two secrets in constant time. Both are hashed first so their lengths cannot leak through timing either.
 * @param given - What the caller sent
 * @param expected - The configured key
 * @returns True when they are identical
 */
export function secretsMatch(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Decides whether a request may use the Usage Console. With no key configured (local dev) everyone may; otherwise
 * the `x-operator-key` header must be a single value equal to the key.
 * @param header - The raw header value (string, repeated array, or absent)
 * @param operatorKey - The configured key, or undefined/empty when the gate is off
 * @returns True when the request may pass
 */
export function isOperator(header: string | string[] | undefined, operatorKey: string | undefined): boolean {
  if (!operatorKey) return true;
  if (typeof header !== "string" || header === "") return false;
  return secretsMatch(header, operatorKey);
}
