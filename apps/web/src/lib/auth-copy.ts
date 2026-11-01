import { ApiError, TOO_MANY_TRIES } from "@/lib/api.ts";

/** The password rule, as shown under every new-password field. Supabase enforces the same rule. */
export const PASSWORD_RULE = "At least 8 characters, with a letter and a number.";

/** Shown on sign-in when an email link (welcome, reset) was bad or already used: the API redirects to `?link=expired`. */
export const LINK_EXPIRED = "That email link has run out or was already used. Ask for a new one below.";

/**
 * Checks a new password against the rule before it goes to the API.
 * @param password - The password as typed
 * @returns A short reason it fails, or null when it passes
 */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Use at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Add at least one letter.";
  if (!/\d/.test(password)) return "Add at least one number.";
  return null;
}

/**
 * A plain message for a failed call to an `/api/auth/*` route. The API's own `error` text wins; then copy for the
 * status, if the screen gave some; then `429`'s "too many tries"; then the fallback.
 * @param error - What the call threw
 * @param fallback - Copy when nothing more specific applies
 * @param byStatus - Copy for particular statuses when the API sent no text, e.g. `{ 401: "That code didn't work." }`
 */
export function authErrorMessage(error: unknown, fallback: string, byStatus: Record<number, string> = {}): string {
  if (error instanceof ApiError) {
    return error.serverMessage ?? byStatus[error.status] ?? (error.status === 429 ? TOO_MANY_TRIES : fallback);
  }
  // fetch throws a TypeError when the API can't be reached at all.
  if (error instanceof TypeError) return "Couldn't reach sign-in. Check your connection and try again.";
  return fallback;
}
