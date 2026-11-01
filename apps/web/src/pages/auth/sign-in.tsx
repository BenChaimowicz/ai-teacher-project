import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { isAuthError } from "@supabase/supabase-js";
import { AuthField, AuthNotice, AuthScreen, PasswordInput } from "@/components/auth/auth-screen.tsx";
import type { FromState } from "@/components/auth/auth-provider.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { authErrorMessage, hidesAccountExistence } from "@/lib/auth-copy.ts";
import { linkError, supabase } from "@/lib/supabase.ts";

/** Location state the signed-out screens hand each other: where to go after, and the email typed so far. */
export type AuthNavState = FromState & { email?: string };

type Mode = "password" | "code";

/**
 * Sign in with email and password, or with a 6-digit code sent by email. On success the route guard sends the
 * person on to where they were headed.
 */
export function SignInPage() {
  const location = useLocation();
  const navState = (location.state as AuthNavState | null) ?? {};
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(navState.email ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(linkError);
  const [note, setNote] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

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

  /** Signs in with email and password. */
  async function signInWithPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    setUnconfirmed(false);
    try {
      const { error: failed } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (failed) {
        if (isAuthError(failed) && failed.code === "email_not_confirmed") setUnconfirmed(true);
        setError(authErrorMessage(failed, "Couldn't sign you in. Try again."));
      }
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't sign you in. Try again."));
    } finally {
      setBusy(false);
    }
  }

  /** Sends the welcome (confirmation) email again, for an account that hasn't confirmed yet. */
  async function resendWelcome() {
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (failed) {
        setError(authErrorMessage(failed, "Couldn't send it. Try again in a minute."));
        return;
      }
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
      const { error: failed } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
      if (failed && !hidesAccountExistence(failed)) {
        setError(authErrorMessage(failed, "Couldn't send a code. Try again."));
        return;
      }
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
      const { error: failed } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (failed) setError(authErrorMessage(failed, "That code didn't work. Check it, or ask for a new one."));
    } catch (caught) {
      setError(authErrorMessage(caught, "That code didn't work. Check it, or ask for a new one."));
    } finally {
      setBusy(false);
    }
  }

  const passOn: AuthNavState = { from: navState.from, email: email.trim() || undefined };

  return (
    <AuthScreen
      title="Welcome back"
      lede="Sign in to pick up where you left off."
      footer={
        <p>
          New here?{" "}
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
          <AuthField label="Password">
            {({ id, describedBy }) => (
              <PasswordInput id={id} describedBy={describedBy} value={password} onChange={setPassword} autoComplete="current-password" />
            )}
          </AuthField>
          <Link className="k-auth-aside" to="/forgot-password" state={passOn}>
            Forgot password?
          </Link>
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
