import { useCallback, useEffect, useState } from "react";
import { buildQuery, opsGet, type QueryParams } from "@/lib/api";
import { useRefresh } from "@/lib/refresh";

/** State of one `/api/ops/*` fetch. */
export type OpsState<T> = {
  /** Last successful body; kept while a refresh is in flight so the screen does not flash. */
  data: T | undefined;
  error: Error | undefined;
  /** True while a request is in flight. */
  loading: boolean;
  /** Re-fetch just this resource. */
  reload: () => void;
};

/**
 * Fetches an `/api/ops/*` route and re-fetches when the path, params, or global refresh tick change.
 * @param path - Route below `/api/ops/`, or null to skip fetching
 * @param params - Query parameters
 * @returns The fetch state
 */
export function useOps<T>(path: string | null, params?: QueryParams): OpsState<T> {
  const { tick } = useRefresh();
  const [localTick, setLocalTick] = useState(0);
  const [state, setState] = useState<{ key: string | null; data?: T; error?: Error; loading: boolean }>({
    key: null,
    loading: path !== null,
  });
  const key = path === null ? null : `${path}${buildQuery(params)}`;

  useEffect(() => {
    if (path === null || key === null) {
      setState({ key: null, loading: false });
      return;
    }
    const controller = new AbortController();
    // Keep data only when re-fetching the same resource (refresh), not when the query changed.
    setState((prev) => ({ key, data: prev.key === key ? prev.data : undefined, error: undefined, loading: true }));
    opsGet<T>(path, params, controller.signal)
      .then((data) => setState({ key, data, loading: false }))
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setState((prev) => ({ key, data: prev.key === key ? prev.data : undefined, error, loading: false }));
      });
    return () => controller.abort();
    // `params` is captured through `key`, which serialises it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, localTick]);

  const reload = useCallback(() => setLocalTick((t) => t + 1), []);
  return { data: state.data, error: state.error, loading: state.loading, reload };
}
