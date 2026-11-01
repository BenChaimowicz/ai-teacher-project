import { createClient } from "@supabase/supabase-js";

/**
 * Reads the error Supabase puts on the URL when an email link fails (expired, already used), e.g.
 * `#error=access_denied&error_code=otp_expired&error_description=...`. Read once, before the client
 * clears the URL, so the sign-in screen can say what happened.
 */
function readLinkError(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const query = new URLSearchParams(window.location.search);
  const code = params.get("error_code") ?? query.get("error_code");
  const description = params.get("error_description") ?? query.get("error_description");
  if (!code && !description) return null;
  if (code === "otp_expired") return "That email link has run out or was already used. Ask for a new one below.";
  return description ?? "That email link didn't work. Try signing in below.";
}

/** What went wrong with the email link that opened the app, if one did. Null otherwise. */
export const linkError = readLinkError();

if (!__SUPABASE_URL__ || !__SUPABASE_PUBLISHABLE_KEY__) {
  throw new Error(
    `[supabase.ts: createClient] Missing Supabase settings || SUPABASE_URL=${__SUPABASE_URL__ ? "set" : "missing"} || SUPABASE_PUBLISHABLE_KEY=${__SUPABASE_PUBLISHABLE_KEY__ ? "set" : "missing"} || Add both to the root .env and restart Vite`,
  );
}

/**
 * The browser's Supabase client. Signs people in, keeps the session in localStorage and refreshes the access
 * token (ADR 0026). `detectSessionInUrl` picks up the session an email link (welcome, reset) brings back.
 */
export const supabase = createClient(__SUPABASE_URL__, __SUPABASE_PUBLISHABLE_KEY__, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: "implicit",
  },
});
