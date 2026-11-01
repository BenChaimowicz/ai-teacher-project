import { createClient, type AuthError, type EmailOtpType, type Session } from "@supabase/supabase-js";

/** A Supabase session as the API keeps it: the access token (`kn_at`) and the refresh token (`kn_rt`). */
export type SessionTokens = { accessToken: string; refreshToken: string };

/** The kinds of email link `GET /api/auth/confirm` accepts; the templates send `email` (welcome) and `recovery` (reset). */
export const LINK_TYPES = ["email", "recovery", "signup", "magiclink", "invite", "email_change"] as const;

/** One of {@link LINK_TYPES}. */
export type LinkType = (typeof LINK_TYPES)[number];

/** Which sessions sign-out revokes: this one, or every session the user has. */
export type SignOutScope = "local" | "global";

/**
 * Supabase Auth refused a call, or could not be reached. `code` is Supabase's error code (`invalid_credentials`,
 * `email_not_confirmed`, `weak_password`, …) when it sent one; `status` is the HTTP status, 0 when nothing came back.
 */
export class AuthServiceError extends Error {
  /**
   * @param message - What failed, in the repo's error format
   * @param code - Supabase's error code, if any
   * @param status - The HTTP status Supabase answered, or 0
   */
  constructor(message: string, readonly code: string | undefined, readonly status: number) {
    super(message);
  }

  /** True when Supabase could not answer (network or 5xx), so the call says nothing about the credential. */
  get unavailable() {
    return this.status === 0 || this.status >= 500;
  }
}

/**
 * Every Supabase Auth call the API makes (ADR 0027). The server passes {@link supabaseAuthService}; tests pass a
 * stand-in so they never reach the network. Every method throws {@link AuthServiceError} on failure.
 */
export type AuthService = {
  /** Creates an unconfirmed user and sends the welcome email linking to `redirectTo`. */
  signUp(email: string, password: string, redirectTo: string): Promise<void>;
  /** Sends the welcome email again. */
  resendConfirmation(email: string, redirectTo: string): Promise<void>;
  /** Checks an email and password. */
  signIn(email: string, password: string): Promise<SessionTokens>;
  /** Emails a 6-digit sign-in code, never creating a user. */
  sendCode(email: string): Promise<void>;
  /** Checks a 6-digit code. */
  verifyCode(email: string, code: string): Promise<SessionTokens>;
  /** Sends the password-reset email linking to `redirectTo`. */
  sendPasswordReset(email: string, redirectTo: string): Promise<void>;
  /** Checks the token hash an email link carries. */
  verifyLink(tokenHash: string, type: LinkType): Promise<SessionTokens>;
  /** Trades a refresh token for a new session. */
  refresh(refreshToken: string): Promise<SessionTokens>;
  /** Sets a signed-in user's password. */
  changePassword(session: SessionTokens, password: string): Promise<void>;
  /** Revokes this session or all of the user's sessions. */
  signOut(session: SessionTokens, scope: SignOutScope): Promise<void>;
};

/**
 * The tokens of a Supabase session, or a failure when a call that should sign in returned none.
 * @param session - The session Supabase returned
 * @param fn - The calling method, for the error
 */
function tokensOf(session: Session | null, fn: string): SessionTokens {
  if (!session) throw new AuthServiceError(`[supabase-auth.ts: ${fn}] Supabase returned no session`, undefined, 0);
  return { accessToken: session.access_token, refreshToken: session.refresh_token };
}

/**
 * The Supabase Auth client over a project's publishable key (ADR 0027). Each call gets its own client that keeps
 * nothing between calls, so one Learner's session never leaks into another's request. A signed-in action sets that
 * Learner's session on its client first. The secret key never reaches the API.
 * @param supabaseUrl - `SUPABASE_URL`
 * @param publishableKey - `SUPABASE_PUBLISHABLE_KEY`
 * @throws Error at startup when either is missing
 */
export function supabaseAuthService(supabaseUrl: string | undefined, publishableKey: string | undefined): AuthService {
  if (!supabaseUrl?.trim() || !publishableKey?.trim()) {
    throw new Error(
      "[supabase-auth.ts: supabaseAuthService] SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY is not set || Set both in the root .env (see .env.example)",
    );
  }
  const url = supabaseUrl.trim();
  const key = publishableKey.trim();

  /** A fresh client that stores no session and never refreshes on its own. */
  const client = () => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  /**
   * Runs one Supabase call and turns its `error`, or anything it throws, into an {@link AuthServiceError}.
   * @param fn - The calling method, for the error
   * @param detail - `key=value` context for the error (never a password or token)
   * @param call - The call; resolves with Supabase's `{ data, error }`, which is returned when `error` is null
   */
  async function run<R extends { error: AuthError | null }>(fn: string, detail: string, call: () => Promise<R>): Promise<R> {
    let result: R;
    try {
      result = await call();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new AuthServiceError(`[supabase-auth.ts: ${fn}] Supabase Auth call threw || ${detail} || ${message}`, undefined, 0);
    }
    if (result.error) {
      const { code, status, message } = result.error;
      throw new AuthServiceError(
        `[supabase-auth.ts: ${fn}] Supabase Auth refused || ${detail} || code=${code ?? "none"} || status=${status ?? 0} || ${message}`,
        code,
        status ?? 0,
      );
    }
    return result;
  }

  /**
   * A client with a Learner's session set on it, for a signed-in action.
   * @param session - The Learner's tokens
   * @param fn - The calling method, for the error
   */
  async function signedIn(session: SessionTokens, fn: string) {
    const auth = client().auth;
    await run(fn, "step=setSession", () => auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken }));
    return auth;
  }

  return {
    async signUp(email, password, redirectTo) {
      await run("signUp", `email=${email}`, () => client().auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } }));
    },
    async resendConfirmation(email, redirectTo) {
      await run("resendConfirmation", `email=${email}`, () =>
        client().auth.resend({ type: "signup", email, options: { emailRedirectTo: redirectTo } }));
    },
    async signIn(email, password) {
      const { data } = await run("signIn", `email=${email}`, () => client().auth.signInWithPassword({ email, password }));
      return tokensOf(data.session, "signIn");
    },
    async sendCode(email) {
      await run("sendCode", `email=${email}`, () => client().auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
    },
    async verifyCode(email, code) {
      const { data } = await run("verifyCode", `email=${email}`, () => client().auth.verifyOtp({ email, token: code, type: "email" }));
      return tokensOf(data.session, "verifyCode");
    },
    async sendPasswordReset(email, redirectTo) {
      await run("sendPasswordReset", `email=${email}`, () => client().auth.resetPasswordForEmail(email, { redirectTo }));
    },
    async verifyLink(tokenHash, type) {
      const { data } = await run("verifyLink", `type=${type}`, () =>
        client().auth.verifyOtp({ token_hash: tokenHash, type: type satisfies EmailOtpType }));
      return tokensOf(data.session, "verifyLink");
    },
    async refresh(refreshToken) {
      const { data } = await run("refresh", "step=refreshSession", () => client().auth.refreshSession({ refresh_token: refreshToken }));
      return tokensOf(data.session, "refresh");
    },
    async changePassword(session, password) {
      const auth = await signedIn(session, "changePassword");
      await run("changePassword", "step=updateUser", () => auth.updateUser({ password }));
    },
    async signOut(session, scope) {
      const auth = await signedIn(session, "signOut");
      await run("signOut", `scope=${scope}`, () => auth.signOut({ scope }));
    },
  };
}
