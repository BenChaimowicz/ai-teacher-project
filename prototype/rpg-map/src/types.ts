/** One stop on the Course route: a Reading, a Quiz (boss battle) or the Goal Check (final boss). */
export type Stop =
  | { kind: "reading"; title: string; locationName: string }
  | { kind: "quiz"; title: string; bossName: string }
  | { kind: "goal_check"; title: string; bossName: string };

/** A Course as the demo shows it. */
export type DemoCourse = { id: string; subject: string; learningGoal: string; stops: Stop[] };

/** How stops are spread along the route. */
export type PlacementMode = "even" | "clustered";

/** A placed stop: where it sits on the map and how far along the route it is. */
export type Placement = { x: number; y: number; angle: number; t: number };

/** The route file the Designer delivers, in map pixel coordinates. */
export type RouteFile = {
  map: string;
  width: number;
  height: number;
  routes: { main: string; long?: string };
};
