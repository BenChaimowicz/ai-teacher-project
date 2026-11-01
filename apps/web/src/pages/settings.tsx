import { useEffect, useState, type FormEvent } from "react";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cleanDisplayName, DISPLAY_NAME_MAX_LENGTH } from "@senoy/db/learner-name";
import { useAuth, type Me } from "@/components/auth/auth-provider.tsx";
import { AuthField, AuthNotice, PasswordInput } from "@/components/auth/auth-screen.tsx";
import { ShellTitle } from "@/components/shell/app-shell.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { requestJson } from "@/lib/api.ts";
import { authErrorMessage, PASSWORD_RULE, passwordProblem } from "@/lib/auth-copy.ts";
import { supabase } from "@/lib/supabase.ts";

/**
 * Settings: the Learner's display name, password, and signing out (here or everywhere).
 */
export function SettingsPage() {
  const { me, session } = useAuth();
  const email = me?.email ?? session?.user.email ?? null;
  return (
    <div className="k-settings">
      <ShellTitle>Settings</ShellTitle>
      <div className="k-settings-head">
        <Avatar name={me?.displayName ?? null} size="lg" />
        <div className="min-w-0">
          <h1>{me?.displayName ?? " "}</h1>
          {email ? <p>{email}</p> : null}
        </div>
      </div>
      <NameCard />
      <PasswordCard />
      <SignOutCard />
    </div>
  );
}

/**
 * Change the display name. Names don't have to be unique; it's just what Knibbler calls you.
 */
function NameCard() {
  const { me, setMe } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(me?.displayName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The Learner loads after the page can render; fill the field once it arrives.
  useEffect(() => {
    if (me) setName((typed) => typed || me.displayName);
  }, [me]);

  const clean = cleanDisplayName(name);
  const unchanged = clean !== null && clean === me?.displayName;

  /** Saves the new name through `PATCH /api/me`. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!clean) {
      setError(`Use 1 to ${DISPLAY_NAME_MAX_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      const next = await requestJson<Me>("/api/me", "PATCH", { displayName: clean }, "Couldn't save your name. Try again.");
      setMe(next);
      setName(next.displayName);
      toast({ title: "Name saved" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your name. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="flat" className="k-settings-card">
      <h2>Your name</h2>
      <p className="sub">What Knibbler calls you. Anything you like.</p>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <AuthField label="Display name" error={error}>
          {({ id, describedBy }) => (
            <Input
              id={id}
              value={name}
              maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
              autoComplete="nickname"
              onChange={(event) => setName(event.target.value)}
              aria-describedby={describedBy}
              invalid={Boolean(error)}
              disabled={!me}
              trailing={
                <Button type="submit" size="sm" disabled={busy || !me || unchanged}>
                  {busy ? "Saving…" : "Save"}
                </Button>
              }
            />
          )}
        </AuthField>
      </form>
    </Card>
  );
}

/**
 * Set a new password. Works for people who only ever signed in with a code, too.
 */
function PasswordCard() {
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = passwordProblem(password);

  /** Saves the new password with Supabase. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setError(null);
    if (problem) return;
    setBusy(true);
    try {
      const { error: failed } = await supabase.auth.updateUser({ password });
      if (failed) {
        setError(authErrorMessage(failed, "Couldn't change your password. Try again."));
        return;
      }
      setPassword("");
      setTried(false);
      toast({ title: "Password changed" });
    } catch (caught) {
      setError(authErrorMessage(caught, "Couldn't change your password. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card tone="flat" className="k-settings-card">
      <h2>Password</h2>
      <p className="sub">Pick a new one. You stay signed in.</p>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      <form onSubmit={(event) => void submit(event)} noValidate className="k-auth-form">
        <AuthField label="New password" hint={PASSWORD_RULE} error={tried ? problem : null}>
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
        <div>
          <Button type="submit" variant="secondary" disabled={busy || !password}>
            {busy ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * Sign out of this browser, or of every device at once.
 */
function SignOutCard() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"local" | "global" | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Signs out and lands on sign-in (without a "come back to Settings" note).
   * @param scope - `local` for this browser, `global` for every device
   */
  async function run(scope: "local" | "global") {
    setBusy(scope);
    setError(null);
    try {
      await signOut(scope);
      navigate("/sign-in", { replace: true, state: null });
    } catch {
      setError("Couldn't sign you out. Check your connection and try again.");
      setBusy(null);
    }
  }

  return (
    <Card tone="flat" className="k-settings-card">
      <h2>Sign out</h2>
      <p className="sub">Signing out everywhere ends every session, on every device. Other devices can take up to an hour to notice.</p>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      <div className="k-settings-actions">
        <Button variant="secondary" disabled={busy !== null} onClick={() => void run("local")}>
          <LogOut /> {busy === "local" ? "Signing out…" : "Sign out"}
        </Button>
        <Button variant="ghost" disabled={busy !== null} onClick={() => void run("global")}>
          <MonitorSmartphone /> {busy === "global" ? "Signing out…" : "Sign out everywhere"}
        </Button>
      </div>
    </Card>
  );
}
