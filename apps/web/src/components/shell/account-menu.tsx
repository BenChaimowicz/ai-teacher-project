import { LogOut, UserRound } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/components/auth/auth-provider.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { useToast } from "@/components/ui/toast.tsx";

/**
 * The signed-in Learner's initials at the far right of the top bar, on every signed-in screen. It opens a small menu:
 * the display name and email, then Profile & settings and Sign out.
 *
 * A menu button: opening focuses the first item; Up/Down (and Home/End) move between items; Esc closes and returns
 * focus to the button; Tab or a click outside closes and lets focus go where it was headed.
 */
export function AccountMenu() {
  const { me, signOut } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const name = me?.displayName ?? null;
  const email = me?.email ?? null;

  /** The menu's items, in order. */
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

  /**
   * Closes the menu.
   * @param refocus - Put focus back on the avatar button (Esc, or an item that keeps you on this screen)
   */
  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) button.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const onDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    // Capture, so Esc closes this menu and nothing else (Study's focus mode also listens for Esc).
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  /** Arrow keys, Home and End move between items; Tab closes the menu and moves on as usual. */
  function onMenuKey(event: ReactKeyboardEvent) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const next =
      event.key === "ArrowDown" ? (at + 1) % list.length
      : event.key === "ArrowUp" ? (at - 1 + list.length) % list.length
      : event.key === "Home" ? 0
      : event.key === "End" ? list.length - 1
      : null;
    if (next === null) return;
    event.preventDefault();
    list[next]?.focus();
  }

  /** Down or Up on the closed button opens the menu, as a menu button should. */
  function onButtonKey(event: ReactKeyboardEvent) {
    if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    setOpen(true);
  }

  /** Signs out of this browser and lands on sign-in. */
  async function runSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut("local");
      navigate("/sign-in", { replace: true, state: null });
    } catch {
      setSigningOut(false);
      close(true);
      toast({ title: "Couldn't sign you out", body: "Check your connection and try again." });
    }
  }

  return (
    <div className="k-acct" ref={wrap}>
      <button
        ref={button}
        type="button"
        className="k-acct-btn"
        aria-label={name ? `Account menu for ${name}` : "Account menu"}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="account-menu-button"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={onButtonKey}
      >
        <Avatar name={name} size="sm" />
      </button>
      {open ? (
        <div className="k-acct-menu">
          <div className="who">
            <Avatar name={name} size="md" />
            <div className="min-w-0">
              <p className="name">{name ?? " "}</p>
              {email ? <p className="email">{email}</p> : null}
            </div>
          </div>
          <div id={menuId} ref={menu} role="menu" aria-label="Account" onKeyDown={onMenuKey}>
            <Link to="/profile" role="menuitem" tabIndex={-1} onClick={() => close(true)}>
              <UserRound aria-hidden="true" />
              Profile &amp; settings
            </Link>
            <button type="button" role="menuitem" tabIndex={-1} aria-disabled={signingOut || undefined} onClick={() => void runSignOut()}>
              <LogOut aria-hidden="true" />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
