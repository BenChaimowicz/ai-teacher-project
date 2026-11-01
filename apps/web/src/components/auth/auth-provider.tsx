import type { Session } from "@supabase/supabase-js";
import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation, type Location } from "react-router-dom";
import { requestJson } from "@/lib/api.ts";
import { supabase } from "@/lib/supabase.ts";

/** The signed-in Learner, as `GET /api/me` returns it. The Learner is the account. */
export type Me = { id: string; displayName: string; email: string | null };

/** `loading` until Supabase has read the saved session; nothing account-shaped renders before then. */
export type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthState = {
  status: AuthStatus;
  session: Session | null;
  /** The Learner from `/api/me`; null while it loads or if it failed. */
  me: Me | null;
  /** Replaces the Learner after a change saved elsewhere, e.g. a new display name in Settings. */
  setMe: (me: Me) => void;
  /**
   * Signs out. `local` ends this browser's session; `global` also revokes every other session
   * (an access token already issued keeps working until it expires, at most an hour).
   */
  signOut: (scope: "local" | "global") => Promise<void>;
};

/** Where a signed-out person was headed, so sign-in can send them back. */
export type FromState = { from?: Location };

const AuthContext = createContext<AuthState | null>(null);

/**
 * Holds the Supabase session for the whole app and loads the signed-in Learner from `/api/me`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [me, setMeState] = useState<Me | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    // INITIAL_SESSION arrives first, once the saved session (or one from an email link) is read.
    // Supabase warns against calling its own methods inside this callback, so it only sets state.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setMeState(null);
    if (!userId) return;
    let cancelled = false;
    requestJson<Me>("/api/me", "GET", undefined, "Could not load your account")
      .then((next) => {
        if (!cancelled) setMeState(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const signOut = useCallback(async (scope: "local" | "global") => {
    const { error } = await supabase.auth.signOut({ scope });
    if (error) {
      throw new Error(`[auth-provider.tsx: signOut] Sign out failed || scope=${scope} || ${error.message}`);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status: session === undefined ? "loading" : session ? "signed-in" : "signed-out",
      session: session ?? null,
      me,
      setMe: setMeState,
      signOut,
    }),
    [session, me, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * The session, the signed-in Learner, and sign-out.
 * @throws If used outside AuthProvider
 */
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("[auth-provider.tsx: useAuth] Missing AuthProvider");
  return value;
}

/** A plain dark screen while the session is unknown, so neither the app nor sign-in flashes. */
function Waiting() {
  return <div className="k-auth-wait" aria-busy="true" />;
}

/**
 * Route guard for everything signed-in. Signed-out people go to /sign-in, which brings them back here after.
 * Keyed by the user, so nothing one account loaded survives into another.
 * @param children - Providers that need a signed-in Learner; they wrap the routes below
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, session } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Waiting />;
  if (status === "signed-out") return <Navigate to="/sign-in" replace state={{ from: location } satisfies FromState} />;
  return <Fragment key={session?.user.id}>{children}</Fragment>;
}

/**
 * Route guard for the signed-out screens. Someone already signed in goes on to where they were headed, or Home.
 */
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Waiting />;
  if (status === "signed-in") {
    const from = (location.state as FromState | null)?.from;
    return <Navigate to={from ? `${from.pathname}${from.search}${from.hash}` : "/"} replace />;
  }
  return <Outlet />;
}
