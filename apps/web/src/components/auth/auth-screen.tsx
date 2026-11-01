import { useId, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AuthStage, type AuthMood } from "@/components/auth/auth-stage.tsx";
import { Input } from "@/components/ui/input.tsx";

type AuthScreenProps = {
  title: string;
  /** One short line under the title. */
  lede?: ReactNode;
  children: ReactNode;
  /** Links under the form, e.g. "New to Knibbler? Make an account". */
  footer?: ReactNode;
  /** Jongi's mood on the left panel: `think` while a request runs, `cheer` when it worked. */
  mood?: AuthMood;
};

/**
 * The frame for every signed-out screen: the "Night desk" split. The left panel (mark, pitch, Jongi on his desk)
 * is the same everywhere; the right side is this screen's title and form, without a card. No sidebar.
 */
export function AuthScreen({ title, lede, children, footer, mood = "idle" }: AuthScreenProps) {
  return (
    <div className="k-auth">
      <AuthStage mood={mood} />
      <main className="k-auth-main">
        <div className="k-auth-in">
          <div className="k-auth-head">
            <h1>{title}</h1>
            {lede ? <p>{lede}</p> : null}
          </div>
          <div className="k-auth-body">{children}</div>
          {footer ? <div className="k-auth-foot">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}

type FieldProps = {
  label: string;
  /** Small help under the field, e.g. the password rule. */
  hint?: ReactNode;
  /** An inline error for this field. */
  error?: string | null;
  /** A small link beside the label, e.g. "Forgot it?". Kept outside the <label> so the field's name stays the label. */
  aside?: ReactNode;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
};

/**
 * A labelled form row with optional hint and inline error, wired up for screen readers.
 */
export function AuthField({ label, hint, error, aside, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="k-auth-row">
      {aside ? (
        <div className="k-auth-label">
          <label htmlFor={id}>{label}</label>
          {aside}
        </div>
      ) : (
        <label htmlFor={id}>{label}</label>
      )}
      {children({ id, describedBy })}
      {hint ? (
        <p id={hintId} className="k-auth-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="k-auth-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type PasswordInputProps = {
  id: string;
  describedBy: string | undefined;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  invalid?: boolean;
  autoFocus?: boolean;
};

/**
 * Password field with a show/hide toggle.
 */
export function PasswordInput({ id, describedBy, value, onChange, autoComplete, invalid, autoFocus }: PasswordInputProps) {
  const [shown, setShown] = useState(false);
  return (
    <Input
      id={id}
      type={shown ? "text" : "password"}
      autoComplete={autoComplete}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-describedby={describedBy}
      invalid={invalid}
      autoFocus={autoFocus}
      required
      trailing={
        <button
          type="button"
          className="k-auth-eye"
          aria-label={shown ? "Hide password" : "Show password"}
          aria-pressed={shown}
          onClick={() => setShown((now) => !now)}
        >
          {shown ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      }
    />
  );
}

/**
 * A form-level message: an error (red edge) or a calm note.
 * @param tone - `error` or `note`
 */
export function AuthNotice({ tone, children }: { tone: "error" | "note"; children: ReactNode }) {
  return (
    <div className={`k-auth-notice ${tone}`} role={tone === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}
