import { isAuthError, isAuthRetryableFetchError } from "@supabase/supabase-js";

/** The password rule, as shown under every new-password field. Supabase enforces the same rule. */
export const PASSWORD_RULE = "At least 8 characters, with a letter and a number.";

/**
 * Checks a new password against the rule before it goes to Supabase.
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
 * A plain message for a Supabase Auth error. Never says whether an email has an account.
 * @param error - What Supabase returned or threw
 * @param fallback - Copy when the error has no known code
 */
export function authErrorMessage(error: unknown, fallback: string): string {
  if (isAuthRetryableFetchError(error)) return "Couldn't reach sign-in. Check your connection and try again.";
  if (!isAuthError(error)) return fallback;
  switch (error.code) {
    case "invalid_credentials":
      return "That email and password don't match.";
    case "email_not_confirmed":
      return "Confirm your email first. The link is in the welcome email we sent.";
    case "weak_password":
      return `That password is too easy to guess. ${PASSWORD_RULE}`;
    case "same_password":
      return "That's your current password. Pick a new one.";
    case "otp_expired":
      return "That code didn't work or has run out. Ask for a new one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many tries for now. Wait a minute and try again.";
    case "reauthentication_needed":
      return "For safety, sign out and use “Forgot password” to set a new one.";
    default:
      return fallback;
  }
}

/**
 * True for errors that would only tell someone an email has no account (or can't use a code).
 * Those screens act as if it worked, so the reply is the same either way.
 * @param error - What Supabase returned
 */
export function hidesAccountExistence(error: unknown): boolean {
  if (!isAuthError(error)) return false;
  return error.code === "otp_disabled" || error.code === "user_not_found" || error.code === "signup_disabled";
}
