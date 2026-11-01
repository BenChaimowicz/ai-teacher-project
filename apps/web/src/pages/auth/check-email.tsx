import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { AuthNotice, AuthScreen } from "@/components/auth/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { authErrorMessage } from "@/lib/auth-copy.ts";
import { supabase } from "@/lib/supabase.ts";
import type { AuthNavState } from "@/pages/auth/sign-in.tsx";

/**
 * After sign-up: the welcome email is on its way, and its button confirms the address and signs you in.
 */
export function CheckEmailPage() {
  const location = useLocation();
  const navState = (location.state as AuthNavState | null) ?? {};
  const email = navState.email ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** Sends the welcome email again. */
  async function resend() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { error: failed } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/` },
      });
      if (failed) {
        setError(authErrorMessage(failed, "Couldn't send it again. Try again in a minute."));
        return;
      }
      setNote("Sent again. It can take a minute to arrive.");
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't send it again. Try again in a minute."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Check your email"
      mood={busy ? "think" : "idle"}
      lede={
        email ? (
          <>
            We sent a welcome email to <b>{email}</b>. Tap its button to finish, and you're in.
          </>
        ) : (
          "We sent you a welcome email. Tap its button to finish, and you're in."
        )
      }
      footer={
        <p>
          Wrong email?{" "}
          <Link to="/sign-up" state={{ from: navState.from } satisfies AuthNavState}>
            Start again
          </Link>{" "}
          ·{" "}
          <Link to="/sign-in" state={{ from: navState.from, email: email || undefined } satisfies AuthNavState}>
            Sign in
          </Link>
        </p>
      }
    >
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      {note ? <AuthNotice tone="note">{note}</AuthNotice> : null}
      <p className="k-auth-text">Nothing there? Look in spam, or send it again.</p>
      {email ? (
        <Button variant="secondary" className="w-full" disabled={busy} onClick={() => void resend()}>
          {busy ? "Sending…" : "Send it again"}
        </Button>
      ) : null}
    </AuthScreen>
  );
}
