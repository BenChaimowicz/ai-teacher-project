import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthField, AuthNotice, AuthScreen, PasswordInput } from "@/components/auth/auth-screen.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { requestJson } from "@/lib/api.ts";
import { authErrorMessage, PASSWORD_RULE, passwordProblem } from "@/lib/auth-copy.ts";
import type { AuthNavState } from "@/pages/auth/sign-in.tsx";

/**
 * Make an account with email and password, through the API. Supabase then sends one welcome email whose button
 * confirms the address and signs the person in; this screen hands over to "check your email".
 */
export function SignUpPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const navState = (location.state as AuthNavState | null) ?? {};
  const [email, setEmail] = useState(navState.email ?? "");
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = passwordProblem(password);

  /** Creates the account, then shows "check your email". */
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setError(null);
    if (problem || !email.trim()) return;
    setBusy(true);
    try {
      // The API answers the same for an email that already has an account, so nobody learns which emails are taken.
      await requestJson<null>("/api/auth/sign-up", "POST", { email: email.trim(), password }, "Couldn't make your account. Try again.");
      navigate("/check-email", { replace: true, state: { email: email.trim(), from: navState.from } satisfies AuthNavState });
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't make your account. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthScreen
      title="Make an account"
      lede="Your courses and progress stay with you, on any device."
      mood={busy ? "think" : "idle"}
      footer={
        <p>
          Have an account?{" "}
          <Link to="/sign-in" state={{ from: navState.from, email: email.trim() || undefined } satisfies AuthNavState}>
            Sign in
          </Link>
        </p>
      }
    >
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      <form className="k-auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField label="Email" error={tried && !email.trim() ? "Add your email." : null}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-describedby={describedBy}
              invalid={tried && !email.trim()}
              required
              autoFocus
            />
          )}
        </AuthField>
        <AuthField label="Password" hint={PASSWORD_RULE} error={tried ? problem : null}>
          {({ id, describedBy }) => (
            <PasswordInput
              id={id}
              describedBy={describedBy}
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              invalid={tried && Boolean(problem)}
            />
          )}
        </AuthField>
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Making your account…" : "Make my account"}
        </Button>
      </form>
    </AuthScreen>
  );
}
