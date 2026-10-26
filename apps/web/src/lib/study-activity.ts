/*
 * Client-side study activity for the companion card: minutes studied per day and the day streak.
 * Placeholder until the server records study time (follow-up); stored in this browser only.
 */

const STORAGE_KEY = "knibbler-activity";
export const DAILY_GOAL_MINUTES = 20;

type ActivityLog = { days: Record<string, number> };

/**
 * Local calendar day as YYYY-MM-DD.
 * @param date - Day to format
 */
export function dayKey(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Reads the saved log; a broken or missing value is an empty log.
 */
function readLog(): ActivityLog {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (parsed && typeof parsed === "object" && "days" in parsed) return parsed as ActivityLog;
  } catch {
    // fall through to an empty log
  }
  return { days: {} };
}

/**
 * Adds minutes to today.
 * @param minutes - Whole minutes studied
 */
export function addStudyMinutes(minutes: number) {
  const log = readLog();
  const today = dayKey();
  log.days[today] = (log.days[today] ?? 0) + minutes;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    // storage full or blocked: this minute is not counted
  }
}

export type ActivitySummary = { minutesToday: number; goalMinutes: number; streakDays: number };

/**
 * Today's minutes and the streak: consecutive days with any study, ending today (or yesterday,
 * so a streak does not look broken before today's first lesson).
 */
export function readActivity(): ActivitySummary {
  const log = readLog();
  const cursor = new Date();
  const minutesToday = log.days[dayKey(cursor)] ?? 0;
  if (!minutesToday) cursor.setDate(cursor.getDate() - 1);
  let streakDays = 0;
  while ((log.days[dayKey(cursor)] ?? 0) > 0) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return { minutesToday, goalMinutes: DAILY_GOAL_MINUTES, streakDays };
}
