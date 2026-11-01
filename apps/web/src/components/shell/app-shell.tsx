import { Home, Menu, PanelLeftClose, Plus, Settings, SlidersHorizontal } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { CompanionCard } from "@/components/companion/companion-card.tsx";
import { CourseRequestControl } from "@/components/course-request-control.tsx";
import { useAuth } from "@/components/auth/auth-provider.tsx";
import { SidebarCourses } from "@/components/shell/sidebar-courses.tsx";
import { Avatar } from "@/components/ui/avatar.tsx";
import { BrandLink } from "@/components/ui/logo.tsx";
import { cn } from "@/lib/utils";

export type ShellVariant = "workspace" | "study";

type Slots = {
  title: HTMLElement | null;
  actions: HTMLElement | null;
  outline: HTMLElement | null;
};

type ShellState = {
  variant: ShellVariant;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  /** Reading progress line under the Study header, 0 to 1 (null hides it). */
  setReadingProgress: (value: number | null) => void;
  slots: Slots;
};

const ShellContext = createContext<ShellState | null>(null);

const NARROW = "(max-width: 899px)";
const STORAGE_KEY = "knibbler-sidebar";

/**
 * True below the drawer breakpoint.
 */
function isNarrow() {
  return typeof matchMedia === "function" && matchMedia(NARROW).matches;
}

/**
 * Saved desktop sidebar preference; defaults to open.
 */
function savedOpen() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "closed";
  } catch {
    return true;
  }
}

/**
 * Top bar title when the screen sets none with `<ShellTitle>`.
 * @param pathname - Current path
 */
function defaultTitle(pathname: string) {
  if (pathname === "/") return "Home";
  if (pathname === "/teaching-profile") return "How you like to learn";
  if (pathname === "/new-course-request") return "New course";
  if (pathname.startsWith("/course-requests/")) return "New course";
  if (pathname === "/settings") return "Settings";
  if (pathname.startsWith("/dev/")) return "Components";
  return "";
}

/**
 * App shell for every screen: the sidebar (never scrolls), a top bar, and the content area.
 *
 * - `workspace`: sidebar shows New course, the course list, and "How you like to learn".
 * - `study`: sidebar shows the Course outline (fill it with `<ShellOutline>`); the header always has
 *   the sidebar toggle, Home, the title (`<ShellTitle>`), reading progress, and actions such as Aa
 *   (`<ShellActions>`).
 *
 * Both variants end with the Learner's initials and name (to Settings) and "How you like to learn".
 *
 * On narrow screens the sidebar is an overlay drawer; Esc and the backdrop close it.
 */
export function AppShell({ variant }: { variant: ShellVariant }) {
  const { pathname } = useLocation();
  const [narrow, setNarrow] = useState(isNarrow);
  const [desktopOpen, setDesktopOpen] = useState(savedOpen);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [readingProgress, setReadingProgress] = useState<number | null>(null);
  const [titleEl, setTitleEl] = useState<HTMLElement | null>(null);
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null);
  const [outlineEl, setOutlineEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const query = matchMedia(NARROW);
    const onChange = () => setNarrow(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
    setReadingProgress(null);
  }, [pathname]);

  const sidebarOpen = narrow ? drawerOpen : desktopOpen;

  const setSidebarOpen = useCallback(
    (open: boolean) => {
      if (narrow) {
        setDrawerOpen(open);
        return;
      }
      setDesktopOpen(open);
      try {
        localStorage.setItem(STORAGE_KEY, open ? "open" : "closed");
      } catch {
        // preference just won't persist
      }
    },
    [narrow],
  );

  useEffect(() => {
    if (!narrow || !drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [narrow, drawerOpen]);

  const value = useMemo<ShellState>(
    () => ({
      variant,
      sidebarOpen,
      setSidebarOpen,
      setReadingProgress,
      slots: { title: titleEl, actions: actionsEl, outline: outlineEl },
    }),
    [variant, sidebarOpen, setSidebarOpen, titleEl, actionsEl, outlineEl],
  );

  const study = variant === "study";
  const toggleLabel = study ? (sidebarOpen ? "Hide lessons" : "Show lessons") : sidebarOpen ? "Hide sidebar" : "Show sidebar";

  return (
    <ShellContext.Provider value={value}>
      <div className="k-app" data-sidebar={sidebarOpen ? "open" : "closed"} data-variant={variant}>
        <a className="k-skip" href="#main">
          Skip to content
        </a>
        <aside id="app-sidebar" className="k-side" aria-label="Sidebar" inert={!sidebarOpen || undefined}>
          <div className="k-side-in" data-testid="sidebar-inner">
            <div className="brand-row">
              <BrandLink />
            </div>
            <CompanionCard />
            {study ? (
              <div className="k-outline" ref={setOutlineEl} />
            ) : (
              <>
                <CourseRequestControl variant="sidebar">
                  <Plus aria-hidden="true" />
                  New course
                </CourseRequestControl>
                <SidebarCourses />
              </>
            )}
            <div className="foot">
              <AccountLink />
              <NavLink to="/teaching-profile" className={({ isActive }) => cn("k-foot-link", isActive && "active")}>
                <SlidersHorizontal aria-hidden="true" />
                How you like to learn
              </NavLink>
            </div>
          </div>
        </aside>
        <button
          type="button"
          className="k-drawer-backdrop"
          aria-label="Close sidebar"
          tabIndex={-1}
          onClick={() => setDrawerOpen(false)}
        />
        <div className="k-main">
          <header className="k-top">
            <button
              type="button"
              className="k-toggle"
              aria-label={toggleLabel}
              aria-controls="app-sidebar"
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              {sidebarOpen && !narrow ? <PanelLeftClose aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
            {study ? (
              <Link to="/" className="k-home">
                <Home aria-hidden="true" />
                Home
              </Link>
            ) : null}
            <div className="title">
              <span className="default-title">{defaultTitle(pathname)}</span>
              <span className="slot" ref={setTitleEl} />
            </div>
            <div className="actions" ref={setActionsEl} />
            {readingProgress !== null ? (
              <div className="read-prog" style={{ width: `${Math.round(readingProgress * 100)}%` }} aria-hidden="true" />
            ) : null}
          </header>
          <main id="main" className="k-content" tabIndex={-1}>
            <div className="k-page">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </ShellContext.Provider>
  );
}

/**
 * The signed-in Learner at the foot of the sidebar: initials circle and display name, linking to Settings.
 */
function AccountLink() {
  const { me } = useAuth();
  return (
    <NavLink
      to="/settings"
      className={({ isActive }) => cn("k-account", isActive && "active")}
      aria-label={me ? `Settings for ${me.displayName}` : "Settings"}
    >
      <Avatar name={me?.displayName ?? null} />
      <span className="name">{me?.displayName ?? ""}</span>
      <Settings aria-hidden="true" className="gear" />
    </NavLink>
  );
}

/**
 * Shell state for screens (sidebar open/close, reading progress).
 * @throws If used outside AppShell
 */
export function useShell() {
  const value = useContext(ShellContext);
  if (!value) throw new Error("[app-shell.tsx: useShell] Missing AppShell");
  return value;
}

/**
 * Renders into a shell slot once it exists.
 * @param target - Slot element
 * @param children - Slot content
 */
function SlotPortal({ target, children }: { target: HTMLElement | null; children: ReactNode }) {
  return target ? createPortal(children, target) : null;
}

/** Top bar title (text or a short node). */
export function ShellTitle({ children }: { children: ReactNode }) {
  return <SlotPortal target={useShell().slots.title}>{children}</SlotPortal>;
}

/** Top bar actions on the right (e.g. the Aa reading panel button, a course menu). */
export function ShellActions({ children }: { children: ReactNode }) {
  return <SlotPortal target={useShell().slots.actions}>{children}</SlotPortal>;
}

/** Study sidebar content below the companion card (the Course outline). Study variant only. */
export function ShellOutline({ children }: { children: ReactNode }) {
  return <SlotPortal target={useShell().slots.outline}>{children}</SlotPortal>;
}
