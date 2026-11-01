import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/auth-provider.tsx";
import { AuthField, AuthNotice, AuthScreen, PasswordInput } from "@/components/auth/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { authErrorMessage, PASSWORD_RULE, passwordProblem } from "@/lib/auth-copy.ts";
import { linkError, supabase } from "@/lib/supabase.ts";

/**
 * Where the reset email's link lands. The link has already signed the person in, so they only pick a new password.
 * Without a session (link expired or already used) it points back to "forgot password".
 */
export function ResetPasswordPage() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Saved: Jongi cheers as the screen hands over to Home.
  const [done, setDone] = useState(false);

  const problem = passwordProblem(password);

  /** Saves the new password, then goes Home. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setError(null);
    if (problem) return;
    setBusy(true);
    try {
      const { error: failed } = await supabase.auth.updateUser({ password });
      if (failed) {
        setError(authErrorMessage(failed, "Couldn't save your new password. Try again."));
        return;
      }
      setDone(true);
      toast({ title: "Password changed", body: "You're signed in." });
      navigate("/", { replace: true });
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't save your new password. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (status === "loading") return <div className="k-auth-wait" aria-busy="true" />;

  if (status === "signed-out") {
    return (
      <AuthScreen title="That link has run out" lede={linkError ?? "Reset links work once, for a short while. Ask for a fresh one."}>
        <Button asChild size="lg" className="w-full">
          <Link to="/forgot-password">Send me a new link</Link>
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Pick a new password" lede="Then you're back in." mood={done ? "cheer" : busy ? "think" : "idle"}>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      <form className="k-auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField label="New password" hint={PASSWORD_RULE} error={tried ? problem : null}>
          {({ id, describedBy }) => (
            <PasswordInput
              id={id}
              describedBy={describedBy}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              invalid={tried && Boolean(problem)}
              autoFocus
            />
          )}
        </AuthField>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Save and continue"}
        </Button>
      </form>
    </AuthScreen>
  );
}
