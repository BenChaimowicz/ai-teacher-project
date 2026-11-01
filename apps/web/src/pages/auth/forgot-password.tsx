import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthField, AuthNotice, AuthScreen } from "@/components/auth/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { authErrorMessage, hidesAccountExistence } from "@/lib/auth-copy.ts";
import { supabase } from "@/lib/supabase.ts";
import type { AuthNavState } from "@/pages/auth/sign-in.tsx";

/**
 * Asks Supabase to email a reset link. The link signs the person in on /reset-password, where they pick a new
 * password. The reply is the same whether or not the email has an account.
 */
export function ForgotPasswordPage() {
  const location = useLocation();
  const navState = (location.state as AuthNavState | null) ?? {};
  const [email, setEmail] = useState(navState.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  /** Sends the reset link. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { error: failed } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (failed && !hidesAccountExistence(failed)) {
        setError(authErrorMessage(failed, "Couldn't send a reset link. Try again."));
        return;
      }
      setSentTo(address);
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't send a reset link. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Forgot your password?"
      lede="It happens. We'll email you a link to set a new one."
      mood={busy ? "think" : "idle"}
      footer={
        <p>
          Remembered it?{" "}
          <Link to="/sign-in" state={{ from: navState.from, email: email.trim() || undefined } satisfies AuthNavState}>
            Sign in
          </Link>
        </p>
      }
    >
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      {sentTo ? (
        <AuthNotice tone="note">If {sentTo} has an account, a reset link is on its way. It works once.</AuthNotice>
      ) : null}
      <form className="k-auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField label="Email">
          {({ id }) => (
            <Input id={id} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
          )}
        </AuthField>
        <Button type="submit" size="lg" className="w-full" disabled={busy || !email.trim()}>
          {busy ? "Sending…" : sentTo ? "Send it again" : "Send me a link"}
        </Button>
      </form>
    </AuthScreen>
  );
}
