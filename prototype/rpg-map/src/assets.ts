import bossUrl from "../art/boss.svg";
import finalBossUrl from "../art/final-boss.svg";
import heroUrl from "../art/hero.svg";
import locationLockedUrl from "../art/location-locked.svg";
import locationVisitedUrl from "../art/location-visited.svg";
import locationUrl from "../art/location.svg";
import routeFile from "../art/route-01.json";
import { norse16, norse30 } from "../data";
import type { ArtName } from "./design";
import type { DemoCourse, RouteFile } from "./types";

/** The URL of each marker's SVG. */
export const ART_URL: Record<ArtName, string> = {
  hero: heroUrl,
  location: locationUrl,
  "location-visited": locationVisitedUrl,
  "location-locked": locationLockedUrl,
  boss: bossUrl,
  "final-boss": finalBossUrl,
};

/** The hand-drawn routes (`main` for the 16-Lesson Course, `long` for the 30-Lesson test) in map pixel coordinates. */
export const ROUTES: RouteFile["routes"] = (routeFile as RouteFile).routes;

/** The showcase Courses. */
export const COURSES = { norse16, norse30 };

/**
 * A short Course made by slicing the first Lessons off a longer Course; the Goal Check stays last.
 * @param course - The Course to slice
 * @param lessons - How many Lessons to keep
 * @returns A Course with `lessons` Lessons plus the Goal Check
 */
export function sliceCourse(course: DemoCourse, lessons: number): DemoCourse {
  const goal = course.stops[course.stops.length - 1];
  return { ...course, id: `${course.id}-${lessons}`, stops: [...course.stops.slice(0, lessons), goal] };
}
