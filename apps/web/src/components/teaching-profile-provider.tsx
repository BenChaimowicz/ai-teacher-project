import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { TeachingProfileAnswers } from "@senoy/db/teaching-profile";
import { parseTeachingProfileAnswers, resolveTeachingProfile, type ResolvedTeachingProfile } from "@senoy/db/teaching-profile";

const HOME_REACHABLE_KEY = "senoy.teaching-profile.home-reachable";

/** Payload returned by `/api/teaching-profile`. */
export type TeachingProfileRecord = {
  present: boolean;
  version: number | null;
  assessedAt: string | null;
  updatedAt: string | null;
  answers: TeachingProfileAnswers | null;
  resolved: ResolvedTeachingProfile | null;
};

type TeachingProfileContextValue = {
  loading: boolean;
  error: string | null;
  present: boolean;
  record: TeachingProfileRecord | null;
  refresh: () => Promise<void>;
  save: (answers: TeachingProfileAnswers, action: "save" | "reassess") => Promise<void>;
  reset: () => Promise<void>;
};

const TeachingProfileContext = createContext<TeachingProfileContextValue | null>(null);

/**
 * Reads the empty GET payload when the Teaching Profile is not present.
 */
function emptyRecord(): TeachingProfileRecord {
  return {
    present: false,
    version: null,
    assessedAt: null,
    updatedAt: null,
    answers: null,
    resolved: null,
  };
}

/**
 * Loads GET JSON into a record. Invalid bodies become not present.
 * @param body - Fetch JSON
 */
function readRecord(body: unknown): TeachingProfileRecord {
  if (!body || typeof body !== "object") return emptyRecord();
  const row = body as Partial<TeachingProfileRecord>;
  if (!row.present || row.answers == null) return emptyRecord();
  const answers = parseTeachingProfileAnswers(row.answers);
  return {
    present: true,
    version: typeof row.version === "number" ? row.version : 1,
    assessedAt: typeof row.assessedAt === "string" ? row.assessedAt : null,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : null,
    answers,
    resolved: row.resolved ?? resolveTeachingProfile(answers),
  };
}

/**
 * Fetches the current Teaching Profile.
 * @throws When the request fails
 */
async function fetchProfile(): Promise<TeachingProfileRecord> {
  try {
    const response = await fetch("/api/teaching-profile");
    if (!response.ok) throw new Error("Could not load Teaching Profile");
    return readRecord(await response.json());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[teaching-profile-provider.tsx: fetchProfile] Failed to load Teaching Profile || ${message}`,
    );
  }
}

type ProviderProps = { children: ReactNode };

/**
 * Teaching Profile presence for Workspace gates, plus save/reset.
 */
export function TeachingProfileProvider({ children }: ProviderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [record, setRecord] = useState<TeachingProfileRecord | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await fetchProfile();
      setRecord(next);
      setError(null);
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not load Teaching Profile";
      setError(message);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchProfile()
      .then((next) => {
        if (!cancelled) {
          setRecord(next);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load Teaching Profile");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
    if (record?.present) return;
    if (location.pathname !== "/") return;
    try {
      if (sessionStorage.getItem(HOME_REACHABLE_KEY)) return;
      sessionStorage.setItem(HOME_REACHABLE_KEY, "1");
    } catch {
      // sessionStorage can throw in locked-down browsers; still land on Teaching Profile.
    }
    navigate("/teaching-profile", { replace: true });
  }, [loading, record?.present, location.pathname, navigate]);

  useEffect(() => {
    if (location.pathname !== "/teaching-profile") return;
    try {
      sessionStorage.setItem(HOME_REACHABLE_KEY, "1");
    } catch {
      // ignore
    }
  }, [location.pathname]);

  const save = useCallback(async (answers: TeachingProfileAnswers, action: "save" | "reassess") => {
    try {
      const response = await fetch("/api/teaching-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, action }),
      });
      if (!response.ok) throw new Error("Could not save Teaching Profile");
      setRecord(readRecord(await response.json()));
      setError(null);
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new Error(
        `[teaching-profile-provider.tsx: save] Failed to save Teaching Profile || ${message}`,
      );
    }
  }, []);

  const reset = useCallback(async () => {
    try {
      const response = await fetch("/api/teaching-profile", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not reset Teaching Profile");
      setRecord(emptyRecord());
      setError(null);
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new Error(
        `[teaching-profile-provider.tsx: reset] Failed to reset Teaching Profile || ${message}`,
      );
    }
  }, []);

  const value = useMemo<TeachingProfileContextValue>(
    () => ({
      loading,
      error,
      present: Boolean(record?.present),
      record,
      refresh,
      save,
      reset,
    }),
    [loading, error, record, refresh, save, reset],
  );

  return <TeachingProfileContext.Provider value={value}>{children}</TeachingProfileContext.Provider>;
}

/**
 * Access the Teaching Profile workspace state.
 * @throws If used outside the provider
 */
export function useTeachingProfile() {
  const value = useContext(TeachingProfileContext);
  if (!value) {
    throw new Error(
      "[teaching-profile-provider.tsx: useTeachingProfile] Missing TeachingProfileProvider",
    );
  }
  return value;
}
