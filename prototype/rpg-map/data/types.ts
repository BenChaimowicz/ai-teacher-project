/** One stop on the Course route. */
export type Stop =
  | { kind: "reading"; title: string; locationName: string }
  | { kind: "quiz"; title: string; bossName: string }
  | { kind: "goal_check"; title: string; bossName: string };
/** A Course as the demo shows it. */
export type DemoCourse = { id: string; subject: string; learningGoal: string; stops: Stop[] };
