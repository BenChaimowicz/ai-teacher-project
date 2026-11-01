import { useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { BookOpenCheck, CalendarDays, GraduationCap, LogOut, MonitorSmartphone, Pencil } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cleanDisplayName, DISPLAY_NAME_MAX_LENGTH } from "@senoy/db/learner-name";
import { useAuth, type Me } from "@/components/auth/auth-provider.tsx";
import { AuthField, AuthNotice, PasswordInput } from "@/components/auth/auth-screen.tsx";
import { Jongi } from "@/components/companion/jongi.tsx";
import { CountUp } from "@/components/learn/count-up.tsx";
import { ShellTitle } from "@/components/shell/app-shell.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { requestJson } from "@/lib/api.ts";
import { authErrorMessage, PASSWORD_RULE, passwordProblem } from "@/lib/auth-copy.ts";
import "@/styles/profile.css";

/**
 * "October 2026" for an ISO timestamp, or null when it can't be read.
 * @param iso - When the Learner joined
 */
function monthYear(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * The Learner's profile: a header with their initials, a name they can edit in place, when they joined, and what they
 * finished; then account settings (password, signing out here or everywhere).
 */
export function ProfilePage() {
  return (
    <div className="k-profile">
      <ShellTitle>Profile</ShellTitle>
      <ProfileHeader />
      <p className="k-sec-h">Account</p>
      <PasswordCard />
      <SignOutCard />
    </div>
  );
}

/**
 * The profile header: a big initials circle, the name (pencil to edit), email, member since, and two count-up tiles.
 */
function ProfileHeader() {
  const { me } = useAuth();
  const email = me?.email ?? null;
  const since = me ? monthYear(me.memberSince) : null;
  return (
    <section className="k-profile-head" aria-label="Your profile">
      <Jongi className="jongi" size={84} framing="bust" tile="round" track />
      <div className="id">
        <Avatar name={me?.displayName ?? null} size="xl" />
        <div className="min-w-0">
          <EditableName />
          {email ? <p className="email">{email}</p> : null}
          {since ? (
            <p className="since">
              <CalendarDays aria-hidden="true" />
              Member since {since}
            </p>
          ) : null}
        </div>
      </div>
      <div className="stats">
        <StatTile icon={<GraduationCap aria-hidden="true" />} label="Courses finished" value={me?.coursesFinished ?? null} />
        <StatTile icon={<BookOpenCheck aria-hidden="true" />} label="Lessons finished" value={me?.lessonsFinished ?? null} />
      </div>
    </section>
  );
}

/**
 * One count tile on the profile header. The number counts up once it loads (at once with reduced motion).
 * @param icon - Decorative icon
 * @param label - What is counted
 * @param value - The count, or null while it loads
 */
function StatTile({ icon, label, value }: { icon: ReactNode; label: string; value: number | null }) {
  return (
    <div className="k-stat">
      <span className="ic">{icon}</span>
      <span className="n">{value === null ? <span aria-hidden="true">–</span> : <CountUp to={value} durationMs={900} delayMs={200} />}</span>
      <span className="l">{label}</span>
    </div>
  );
}

/**
 * The display name as the header's title, edited in place: the pencil swaps it for a field; Enter saves through
 * `PATCH /api/me`, Esc cancels. Names don't have to be unique; it's just what Knibbler calls you.
 */
function EditableName() {
  const { me, setMe } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pencil = useRef<HTMLButtonElement>(null);

  /** Opens the field with the current name. */
  function start() {
    setName(me?.displayName ?? "");
    setError(null);
    setEditing(true);
  }

  /** Closes the field and puts focus back on the pencil. */
  function stop() {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => pencil.current?.focus());
  }

  /** Saves the new name; an unchanged name just closes the field. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    const clean = cleanDisplayName(name);
    if (!clean) {
      setError(`Use 1 to ${DISPLAY_NAME_MAX_LENGTH} characters.`);
      return;
    }
    if (clean === me?.displayName) {
      stop();
      return;
    }
    setBusy(true);
    try {
      const next = await requestJson<Me>("/api/me", "PATCH", { displayName: clean }, "Couldn't save your name. Try again.");
      setMe(next);
      toast({ title: "Name saved" });
      stop();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save your name. Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Esc cancels without saving (and doesn't reach the screen's own Esc handling). */
  function onKey(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    stop();
  }

  if (!editing) {
    return (
      <div className="name-row">
        <h1>{me?.displayName ?? " "}</h1>
        <Button ref={pencil} variant="quiet" size="icon" aria-label="Edit your name" disabled={!me} onClick={start}>
          <Pencil />
        </Button>
      </div>
    );
  }

  return (
    <form className="name-edit" onSubmit={(event) => void submit(event)} noValidate>
      <AuthField label="Display name" error={error}>
        {({ id, describedBy }) => (
          <Input
            id={id}
            value={name}
            maxLength={DISPLAY_NAME_MAX_LENGTH * 2}
            autoComplete="nickname"
            autoFocus
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={onKey}
            aria-describedby={describedBy}
            invalid={Boolean(error)}
            readOnly={busy}
          />
        )}
      </AuthField>
      <div className="name-actions">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={stop}>
          Cancel
        </Button>
      </div>
    </form>
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

  /** Saves the new password through the API. */
  async function submit(event: FormEvent) {
    event.preventDefault();
    setTried(true);
    setError(null);
    if (problem) return;
    setBusy(true);
    try {
      await requestJson<null>("/api/auth/password", "POST", { password }, "Couldn't change your password. Try again.");
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
    <Card tone="flat" className="k-profile-card">
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
   * Signs out and lands on sign-in (without a "come back to your profile" note).
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
    <Card tone="flat" className="k-profile-card">
      <h2>Sign out</h2>
      <p className="sub">Signing out everywhere ends every session, on every device. Other devices can take up to an hour to notice.</p>
      {error ? <AuthNotice tone="error">{error}</AuthNotice> : null}
      <div className="k-profile-actions">
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
