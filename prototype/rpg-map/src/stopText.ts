import type { Stop } from "./types";

/**
 * The badge text for a stop: Reading, Boss battle (Quiz) or Final boss (Goal Check).
 * @param stop - The stop
 * @returns The badge label
 */
export function stopBadge(stop: Stop): string {
  return stop.kind === "reading" ? "Reading" : stop.kind === "quiz" ? "Boss battle" : "Final boss";
}

/**
 * The subtitle of a stop: the location name for a Reading, the boss name for a Quiz or the Goal Check.
 * @param stop - The stop
 * @returns The subtitle text
 */
export function stopSubtitle(stop: Stop): string {
  return stop.kind === "reading" ? stop.locationName : stop.bossName;
}
