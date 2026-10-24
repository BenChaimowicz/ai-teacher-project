import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { RANGE_PARAM_KEYS } from "@/lib/range";
import type { QueryParams } from "@/lib/api";

/** URL param that opens the Usage Record drawer. */
export const CALL_PARAM = "call";
/** URL param that opens the Pipeline Event drawer. */
export const STEP_PARAM = "step";

/**
 * Builds a link to another view that keeps the current time range and drops everything else.
 * @returns `(path, params) => href`
 */
export function useHref(): (path: string, params?: QueryParams) => string {
  const [search] = useSearchParams();
  return useCallback(
    (path: string, params: QueryParams = {}) => {
      const next = new URLSearchParams();
      for (const key of RANGE_PARAM_KEYS) {
        const value = search.get(key);
        if (value) next.set(key, value);
      }
      for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === "" || value === false) next.delete(key);
        else next.set(key, String(value));
      }
      const text = next.toString();
      return text ? `${path}?${text}` : path;
    },
    [search],
  );
}

/**
 * Updates some URL params on the current view, keeping the rest.
 * @returns `(params, opts) => void`; an empty value removes the param. Changing a filter resets `page` unless the
 *   caller sets it.
 */
export function useSetParams(): (params: QueryParams, opts?: { keepPage?: boolean }) => void {
  const [, setSearch] = useSearchParams();
  return useCallback(
    (params: QueryParams, opts?: { keepPage?: boolean }) =>
      setSearch((prev) => {
        const next = new URLSearchParams(prev);
        if (!opts?.keepPage && !("page" in params)) next.delete("page");
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null || value === "" || value === false) next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      }),
    [setSearch],
  );
}

/**
 * Opens and closes the detail drawers. Their ids live in the URL (`?call=` / `?step=`) so a drawer is linkable and
 * survives refresh; only one is open at a time.
 * @returns Drawer controls and the open ids
 */
export function useDrawers(): {
  callId: string | null;
  stepId: string | null;
  openCall: (id: string) => void;
  openStep: (id: string) => void;
  close: () => void;
} {
  const [search, setSearch] = useSearchParams();
  const set = useCallback(
    (call: string | null, step: string | null) =>
      setSearch((prev) => {
        const next = new URLSearchParams(prev);
        if (call) next.set(CALL_PARAM, call);
        else next.delete(CALL_PARAM);
        if (step) next.set(STEP_PARAM, step);
        else next.delete(STEP_PARAM);
        return next;
      }),
    [setSearch],
  );
  return {
    callId: search.get(CALL_PARAM),
    stepId: search.get(STEP_PARAM),
    openCall: useCallback((id: string) => set(id, null), [set]),
    openStep: useCallback((id: string) => set(null, id), [set]),
    close: useCallback(() => set(null, null), [set]),
  };
}

/**
 * Navigates to another view, keeping the time range.
 * @returns `(path, params) => void`
 */
export function useGo(): (path: string, params?: QueryParams) => void {
  const navigate = useNavigate();
  const href = useHref();
  const location = useLocation();
  return useCallback(
    (path: string, params?: QueryParams) => {
      const target = href(path, params);
      if (target !== `${location.pathname}${location.search}`) navigate(target);
    },
    [navigate, href, location],
  );
}
