export type { DemoCourse, Stop } from "../data/types";

/** How stops are spread along the route. */
export type PlacementMode = "even" | "clustered";

/** A placed stop: where it sits on the map and how far along the route it is. */
export type Placement = { x: number; y: number; angle: number; t: number };

/** The route file the Designer delivers, in map pixel coordinates. */
export type RouteFile = {
  map: string;
  width: number;
  height: number;
  routes: { main: string; long: string };
};
