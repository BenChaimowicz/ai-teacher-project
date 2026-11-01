import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useAuth, type FromState } from "@/components/auth/auth-provider.tsx";
import { AuthField, AuthNotice, AuthScreen, PasswordInput } from "@/components/auth/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ApiError, requestJson } from "@/lib/api.ts";
import { authErrorMessage, LINK_EXPIRED } from "@/lib/auth-copy.ts";
import { PRODUCT_NAME } from "@/lib/brand-marks.ts";
import { holdCheer } from "@/lib/cheer.ts";

/** Location state the signed-out screens hand each other: where to go after, and the email typed so far. */
export type AuthNavState = FromState & { email?: string };

type Mode = "password" | "code";

/**
 * Sign in with email and password, or with a 6-digit code sent by email, through the API, which sets the session
 * cookies. On success Jongi cheers for a moment, then the route guard sends the person on to where they were headed.
 * A bad email link lands here as `?link=expired`.
 */
export function SignInPage() {
  const { refresh } = useAuth();
  const location = useLocation();
  const [params] = useSearchParams();
  const navState = (location.state as AuthNavState | null) ?? {};
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(navState.email ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("link") === "expired" ? LINK_EXPIRED : null);
  const [note, setNote] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);
  // Signed in: Jongi cheers while the route guard sends the person on.
  const [done, setDone] = useState(false);

  /**
   * Switches between password and email code, clearing messages from the other mode.
   * @param next - The mode to show
   */
  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNote(null);
    setUnconfirmed(false);
    setCodeSent(false);
    setCode("");
  }

  /**
   * After the API set the session cookies: Jongi cheers for a moment, then the auth provider learns who signed in and
   * the route guard moves on. If that check fails, the cheer stops and the caller shows the error.
   */
  async function finish() {
    setDone(true);
    try {
      await holdCheer();
      if (!(await refresh())) {
        throw new Error(`[sign-in.tsx: finish] Signed in, but the API doesn't see the session || email=${email.trim()} || GET /api/me answered 401`);
      }
    } catch (error) {
      setDone(false);
      throw error;
    }
  }

  /** Signs in with email and password. */
  async function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    setUnconfirmed(false);
    try {
      await requestJson<null>("/api/auth/sign-in", "POST", { email: email.trim(), password }, "Couldn't sign you in. Try again.");
      await finish();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403 && caught.code === "email_not_confirmed") setUnconfirmed(true);
      setError(
        authErrorMessage(caught, "Couldn't sign you in. Try again.", {
          401: "That email and password don't match.",
          403: "Confirm your email first. The link is in the welcome email we sent.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  /** Sends the welcome (confirmation) email again, for an account that hasn't confirmed yet. */
  async function resendWelcome() {
    setBusy(true);
    setError(null);
    try {
      await requestJson<null>("/api/auth/resend", "POST", { email: email.trim() }, "Couldn't send it. Try again in a minute.");
      setUnconfirmed(false);
      setNote("Sent. Open the email and tap the button to finish.");
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't send it. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  }

  /** Emails a 6-digit code. Says the same thing whether or not the email has an account. */
  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      // The API answers the same whether or not the email has an account.
      await requestJson<null>("/api/auth/code", "POST", { email: email.trim() }, "Couldn't send a code. Try again.");
      setCodeSent(true);
      setNote(`If ${email.trim()} has an account, a 6-digit code is on its way.`);
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't send a code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  /** Checks the code and signs in. */
  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestJson<null>("/api/auth/code/verify", "POST", { email: email.trim(), code: code.trim() }, "Couldn't sign you in. Try again.");
      await finish();
    } catch (caught) {
      setError(
        authErrorMessage(caught, "Couldn't sign you in. Try again.", {
          401: "That code didn't work or has run out. Ask for a new one.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  const passOn: AuthNavState = { from: navState.from, email: email.trim() || undefined };

  return (
    <AuthScreen
      title="Welcome back"
      lede="Sign in to pick up where you left off."
      mood={done ? "cheer" : busy ? "think" : "idle"}
      footer={
        <p>
          New to {PRODUCT_NAME}?{" "}
          <Link to="/sign-up" state={passOn}>
            Make an account
          </Link>
        </p>
      }
    >
      <div className="k-auth-switch" role="group" aria-label="How to sign in">
        <button type="button" aria-pressed={mode === "password"} onClick={() => switchMode("password")}>
          Password
        </button>
        <button type="button" aria-pressed={mode === "code"} onClick={() => switchMode("code")}>
          Email me a code
        </button>
      </div>

      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      {note ? <AuthNotice tone="note">{note}</AuthNotice> : null}
      {unconfirmed ? (
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void resendWelcome()}>
          Send the welcome email again
        </Button>
      ) : null}

      {mode === "password" ? (
        <form className="k-auth-form" onSubmit={(event) => void signInWithPassword(event)} noValidate>
          <AuthField label="Email">
            {({ id }) => (
              <Input id={id} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
            )}
          </AuthField>
          <AuthField
            label="Password"
            aside={
              <Link className="k-auth-aside" to="/forgot-password" state={passOn}>
                Forgot it?
              </Link>
            }
          >
            {({ id, describedBy }) => (
              <PasswordInput id={id} describedBy={describedBy} value={password} onChange={setPassword} autoComplete="current-password" />
            )}
          </AuthField>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim() || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      ) : codeSent ? (
        <form className="k-auth-form" onSubmit={(event) => void verifyCode(event)} noValidate>
          <AuthField label="6-digit code" hint={`Sent to ${email.trim()}. It works once and runs out after a while.`}>
            {({ id, describedBy }) => (
              <Input
                id={id}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                className="k-auth-code"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                aria-describedby={describedBy}
                autoFocus
                required
              />
            )}
          </AuthField>
          <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : "Sign in"}
          </Button>
          <div className="k-auth-row-actions">
            <Button variant="link" disabled={busy} onClick={() => void sendCode()}>
              Send a new code
            </Button>
            <Button variant="link" disabled={busy} onClick={() => switchMode("code")}>
              Use another email
            </Button>
          </div>
        </form>
      ) : (
        <form className="k-auth-form" onSubmit={(event) => void sendCode(event)} noValidate>
          <AuthField label="Email" hint="We'll send a 6-digit code. No password needed.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                aria-describedby={describedBy}
                required
                autoFocus
              />
            )}
          </AuthField>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim()}>
            {busy ? "Sending…" : "Send me a code"}
          </Button>
        </form>
      )}
    </AuthScreen>
  );
}
