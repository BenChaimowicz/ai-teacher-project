import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Auto-refresh choices in ms; 0 means off. */
export const AUTO_REFRESH_OPTIONS = [0, 15_000, 30_000, 60_000] as const;

/** What the refresh context exposes. */
type RefreshState = {
  /** Increments on every refresh; data hooks re-fetch when it changes. */
  tick: number;
  /** When the last refresh was triggered. */
  refreshedAt: number;
  /** Re-fetch everything on screen. */
  refresh: () => void;
  /** Current auto-refresh interval (0 = off). */
  autoMs: number;
  /** Change the auto-refresh interval. */
  setAutoMs: (ms: number) => void;
};

const RefreshContext = createContext<RefreshState | null>(null);

/**
 * Holds the global refresh tick and the optional auto-refresh timer.
 * @param props.children - The app
 */
export function RefreshProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(() => Date.now());
  const [autoMs, setAutoMs] = useState(0);

  const refresh = useCallback(() => {
    setTick((t) => t + 1);
    setRefreshedAt(Date.now());
  }, []);

  useEffect(() => {
    if (!autoMs) return;
    const timer = window.setInterval(refresh, autoMs);
    return () => window.clearInterval(timer);
  }, [autoMs, refresh]);

  const value = useMemo(() => ({ tick, refreshedAt, refresh, autoMs, setAutoMs }), [tick, refreshedAt, refresh, autoMs]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

/**
 * Reads the refresh context.
 * @returns The refresh state
 * @throws Error when used outside RefreshProvider
 */
export function useRefresh(): RefreshState {
  const value = useContext(RefreshContext);
  if (!value) throw new Error("[refresh: useRefresh] Used outside RefreshProvider || provider=missing || n/a");
  return value;
}
