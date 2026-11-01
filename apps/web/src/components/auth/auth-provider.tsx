import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation, type Location } from "react-router-dom";
import { apiFetch, requestJson, setUnauthorizedHandler } from "@/lib/api.ts";

/** The signed-in Learner, as `GET /api/me` returns it. The Learner is the account. */
export type Me = {
  id: string;
  displayName: string;
  email: string | null;
  /** When the Learner was created, as an ISO timestamp. */
  memberSince: string;
  /** Courses and Lessons the Learner finished, for the profile. */
  coursesFinished: number;
  lessonsFinished: number;
};

/** `loading` until the first `GET /api/me` answers; nothing account-shaped renders before then. */
export type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthState = {
  status: AuthStatus;
  /** The Learner from `/api/me`; set whenever `status` is `signed-in`. */
  me: Me | null;
  /** Replaces the Learner after a change saved elsewhere, e.g. a new display name on the profile. */
  setMe: (me: Me) => void;
  /**
   * Asks `GET /api/me` who is signed in, e.g. right after sign-in set the session cookies.
   * @returns True when someone is signed in
   * @throws When the API can't answer (anything but `200` or `401`)
   */
  refresh: () => Promise<boolean>;
  /**
   * Signs out through the API, which clears the session cookies. `local` ends this browser's session; `global` also
   * revokes every other session (an access token already issued keeps working until it expires, at most an hour).
   */
  signOut: (scope: "local" | "global") => Promise<void>;
};

/** Where a signed-out person was headed, so sign-in can send them back. */
export type FromState = { from?: Location };

const AuthContext = createContext<AuthState | null>(null);

/** Waits before the first probe tries again, in ms; one entry per retry. */
const PROBE_RETRIES = [500, 1500, 3000];

/**
 * Asks the API who is signed in. The session is in httpOnly cookies (ADR 0027), so only the API can tell.
 * @returns The Learner, or null when signed out
 * @throws When the API answers anything but `200` or `401`, or can't be reached
 */
async function fetchMe(): Promise<Me | null> {
  // This call handles its own 401, so apiFetch doesn't also report it.
  const response = await apiFetch("/api/me", {}, { signOutOn401: false });
  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`[auth-provider.tsx: fetchMe] Could not load the signed-in Learner || status=${response.status} || ${response.statusText}`);
  }
  return (await response.json()) as Me;
}

/**
 * Knows who is signed in for the whole app: asks `GET /api/me` on load and after sign-in, and hears about any later
 * `401` from `apiFetch`, which flips the app to signed out.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [me, setMeState] = useState<Me | null>(null);

  /** Records the answer from `/api/me`. */
  const apply = useCallback((next: Me | null) => {
    setMeState(next);
    setStatus(next ? "signed-in" : "signed-out");
  }, []);

  useEffect(() => setUnauthorizedHandler(() => apply(null)), [apply]);

  useEffect(() => {
    let cancelled = false;
    /** The first probe; retries a few times if the API is briefly away, then shows sign-in. */
    async function probe() {
      for (let attempt = 0; ; attempt += 1) {
        try {
          const next = await fetchMe();
          if (!cancelled) apply(next);
          return;
        } catch {
          const wait = PROBE_RETRIES[attempt];
          if (wait === undefined) {
            if (!cancelled) apply(null);
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, wait));
          if (cancelled) return;
        }
      }
    }
    void probe();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  const refresh = useCallback(async () => {
    const next = await fetchMe();
    apply(next);
    return next !== null;
  }, [apply]);

  const signOut = useCallback(
    async (scope: "local" | "global") => {
      try {
        await requestJson<null>("/api/auth/sign-out", "POST", { scope }, "Couldn't sign you out.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`[auth-provider.tsx: signOut] Sign out failed || scope=${scope} || ${message}`);
      }
      apply(null);
    },
    [apply],
  );

  const value = useMemo<AuthState>(
    () => ({ status, me, setMe: setMeState, refresh, signOut }),
    [status, me, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Who is signed in, the Learner, and sign-in / sign-out.
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
 * Keyed by the Learner, so nothing one account loaded survives into another.
 * @param children - Providers that need a signed-in Learner; they wrap the routes below
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, me } = useAuth();
  const location = useLocation();
  if (status === "loading") return <Waiting />;
  if (status === "signed-out") return <Navigate to="/sign-in" replace state={{ from: location } satisfies FromState} />;
  return <Fragment key={me?.id}>{children}</Fragment>;
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
