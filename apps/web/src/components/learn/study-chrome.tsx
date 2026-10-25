import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import {
  DEFAULT_READING_SETTINGS,
  LOCAL_LEARNER_KEY,
  loadReadingSettings,
  saveReadingSettings,
  withMode,
  type ReadingModeKey,
  type ReadingSettings,
} from "@/components/learn/reading-settings.ts";

type StudyChrome = {
  settings: ReadingSettings;
  /** Change fine controls (the mode label turns "custom" when they no longer match a mode). */
  update: (patch: Partial<ReadingSettings>) => void;
  applyMode: (key: ReadingModeKey) => void;
  reset: () => void;
  /** Sections of the open reading Lesson the Learner has scrolled past, for the sidebar ticks. */
  sectionsRead: boolean[];
  setSectionsRead: (read: boolean[]) => void;
};

const StudyChromeContext = createContext<StudyChrome | null>(null);

/**
 * Shared state between the Study header (Aa panel), the sidebar outline, and the lesson body.
 * @param learnerKey - Whose reading settings to load and save
 */
export function StudyChromeProvider({ children, learnerKey = LOCAL_LEARNER_KEY }: { children: ReactNode; learnerKey?: string }) {
  const [settings, setSettings] = useState<ReadingSettings>(() => loadReadingSettings(learnerKey));
  const [sectionsRead, setSectionsRead] = useState<boolean[]>([]);

  const commit = useCallback(
    (next: (current: ReadingSettings) => ReadingSettings) => {
      setSettings((current) => {
        const value = next(current);
        saveReadingSettings(learnerKey, value);
        return value;
      });
    },
    [learnerKey],
  );

  const value = useMemo<StudyChrome>(
    () => ({
      settings,
      update: (patch) => commit((current) => ({ ...current, ...patch })),
      applyMode: (key) => commit((current) => withMode(current, key)),
      reset: () => commit(() => ({ ...DEFAULT_READING_SETTINGS })),
      sectionsRead,
      setSectionsRead,
    }),
    [settings, commit, sectionsRead],
  );

  return <StudyChromeContext.Provider value={value}>{children}</StudyChromeContext.Provider>;
}

/**
 * Study chrome state. Outside the provider (e.g. a plugin rendered elsewhere) it falls back to defaults.
 */
export function useStudyChrome(): StudyChrome {
  const value = useContext(StudyChromeContext);
  if (value) return value;
  return {
    settings: DEFAULT_READING_SETTINGS,
    update: () => undefined,
    applyMode: () => undefined,
    reset: () => undefined,
    sectionsRead: [],
    setSectionsRead: () => undefined,
  };
}
