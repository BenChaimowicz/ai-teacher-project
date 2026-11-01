import { useId, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Jongi } from "@/components/companion/jongi.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Logo } from "@/components/ui/logo.tsx";
import { PRODUCT_NAME } from "@/lib/brand-marks.ts";

type AuthScreenProps = {
  title: string;
  /** One short line under the title. */
  lede?: ReactNode;
  children: ReactNode;
  /** Links under the card, e.g. "New here? Make an account". */
  footer?: ReactNode;
};

/**
 * The frame for every signed-out screen: the mark, Jongi, a title, and one paper card. No sidebar.
 */
export function AuthScreen({ title, lede, children, footer }: AuthScreenProps) {
  return (
    <main className="k-auth">
      <div className="k-auth-in">
        <div className="k-auth-brand">
          <Logo size={28} />
          <span className="k-wordmark">{PRODUCT_NAME.toLowerCase()}</span>
        </div>
        <div className="k-auth-head">
          <Jongi size={56} tile="round" />
          <div>
            <h1>{title}</h1>
            {lede ? <p>{lede}</p> : null}
          </div>
        </div>
        <div className="k-card k-auth-card">{children}</div>
        {footer ? <div className="k-auth-foot">{footer}</div> : null}
      </div>
    </main>
  );
}

type FieldProps = {
  label: string;
  /** Small help under the field, e.g. the password rule. */
  hint?: ReactNode;
  /** An inline error for this field. */
  error?: string | null;
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode;
};

/**
 * A labelled form row with optional hint and inline error, wired up for screen readers.
 */
export function AuthField({ label, hint, error, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="k-auth-row">
      <label htmlFor={id}>{label}</label>
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
