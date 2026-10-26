import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { JongiMood } from "@/components/companion/jongi.tsx";
import { addStudyMinutes, readActivity, type ActivitySummary } from "@/lib/study-activity.ts";

/** Low-key lines for when a screen sets none. Kind, brief, never childish. */
export const DEFAULT_COMPANION_LINES = [
  "I'm here if you need me.",
  "Small steps add up.",
  "A short break helps things stick.",
  "Curious about something? We can make a course of it.",
  "No rush. Go at your pace.",
];

type CompanionState = {
  /** What the companion is saying now. */
  line: string;
  /** Changes on every new line, so the bubble can replay its typing dots. */
  lineId: number;
  mood: JongiMood;
  activity: ActivitySummary;
  /** Say something now. A "cheer" mood falls back to idle after a moment. */
  say: (text: string, mood?: JongiMood) => void;
  /** Next line from the current context (the card calls this on click). */
  next: () => void;
  setMood: (mood: JongiMood) => void;
  /** Replace the context lines (null restores the defaults). Says the first one. */
  setLines: (lines: string[] | null) => void;
};

const CompanionContext = createContext<CompanionState | null>(null);

/**
 * Companion state for the sidebar card: current line, mood, context lines, and study activity.
 * Counts a study minute every 60s while a Study page is open and visible.
 */
export function CompanionProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const [lines, setLinesState] = useState<string[]>(DEFAULT_COMPANION_LINES);
  const [line, setLine] = useState(DEFAULT_COMPANION_LINES[0]!);
  const [lineId, setLineId] = useState(0);
  const [mood, setMoodState] = useState<JongiMood>("idle");
  const [activity, setActivity] = useState<ActivitySummary>(() => readActivity());
  const index = useRef(0);
  const moodTimer = useRef<number | undefined>(undefined);

  const setMood = useCallback((next: JongiMood) => {
    setMoodState(next);
    window.clearTimeout(moodTimer.current);
    if (next === "cheer") moodTimer.current = window.setTimeout(() => setMoodState("idle"), 2200);
  }, []);

  const say = useCallback(
    (text: string, nextMood?: JongiMood) => {
      setLine(text);
      setLineId((id) => id + 1);
      if (nextMood) setMood(nextMood);
    },
    [setMood],
  );

  const setLines = useCallback(
    (next: string[] | null) => {
      const list = next && next.length > 0 ? next : DEFAULT_COMPANION_LINES;
      setLinesState(list);
      index.current = 0;
      say(list[0]!);
    },
    [say],
  );

  const next = useCallback(() => {
    if (lines.length === 0) return;
    let candidate = line;
    for (let i = 0; i < lines.length; i += 1) {
      index.current = (index.current + 1) % lines.length;
      candidate = lines[index.current]!;
      if (candidate !== line || lines.length === 1) break;
    }
    say(candidate);
  }, [lines, line, say]);

  useEffect(() => {
    if (!pathname.startsWith("/study/")) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      addStudyMinutes(1);
      setActivity(readActivity());
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  const value = useMemo<CompanionState>(
    () => ({ line, lineId, mood, activity, say, next, setMood, setLines }),
    [line, lineId, mood, activity, say, next, setMood, setLines],
  );
  return <CompanionContext.Provider value={value}>{children}</CompanionContext.Provider>;
}

/**
 * Companion controls for screens: `say`, `setMood`, `setLines`.
 * @throws If used outside CompanionProvider
 */
export function useCompanion() {
  const value = useContext(CompanionContext);
  if (!value) throw new Error("[companion-provider.tsx: useCompanion] Missing CompanionProvider");
  return value;
}

/**
 * Sets the companion's context lines while a screen is mounted (the first is said right away).
 * Pass a stable array (module constant or useMemo).
 * @param lines - Short lines for this screen
 */
export function useCompanionLines(lines: string[]) {
  const { setLines } = useCompanion();
  useEffect(() => {
    setLines(lines);
    return () => setLines(null);
  }, [lines, setLines]);
}
