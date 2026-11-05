import { PLACEHOLDER_ROUTE } from "./placeholder-route";
import { makePlaceholderCourse } from "./placeholder-course";
import type { DemoCourse, RouteFile } from "./types";

/** The six marker pieces of art, by file name without ".svg". */
export type ArtName = "hero" | "location" | "location-visited" | "location-locked" | "boss" | "final-boss";

// These globs match nothing until the Designer's and Content creator's files land: no code change needed then.
const artFiles = import.meta.glob("../art/*.svg", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const routeFiles = import.meta.glob("../art/route-01.json", { eager: true, import: "default" }) as Record<string, RouteFile>;
const dataFiles = import.meta.glob("../data/index.ts", { eager: true }) as Record<
  string,
  { norse16?: DemoCourse; norse30?: DemoCourse }
>;

/**
 * The URL of a marker's SVG, or null when the art has not landed yet.
 * @param name - Which marker
 * @returns The bundled URL or null
 */
export function artUrl(name: ArtName): string | null {
  return artFiles[`../art/${name}.svg`] ?? null;
}

/**
 * The route paths: from `art/route-01.json` when present, otherwise the placeholder path.
 * @returns The path data for the main route and, when the file has one, the long route
 */
export function loadRoutes(): { main: string; long?: string; fromFile: boolean } {
  const file = Object.values(routeFiles)[0];
  if (file?.routes?.main) return { main: file.routes.main, long: file.routes.long, fromFile: true };
  return { main: PLACEHOLDER_ROUTE, fromFile: false };
}

/**
 * The two showcase Courses: from `data/index.ts` when present, otherwise placeholder Courses.
 * @returns The 16-Lesson and 30-Lesson Courses and whether they came from the data file
 */
export function loadCourses(): { norse16: DemoCourse; norse30: DemoCourse; fromFile: boolean } {
  const mod = Object.values(dataFiles)[0];
  if (mod?.norse16 && mod?.norse30) return { norse16: mod.norse16, norse30: mod.norse30, fromFile: true };
  return {
    norse16: makePlaceholderCourse("placeholder-16", 16, 4),
    norse30: makePlaceholderCourse("placeholder-30", 30, 3),
    fromFile: false,
  };
}

/**
 * A 3-Lesson Course made by slicing the first three Lessons off a longer Course; the Goal Check stays last.
 * @param course - The Course to slice
 * @returns A Course with 3 Lessons plus the Goal Check
 */
export function sliceCourse(course: DemoCourse, lessons: number): DemoCourse {
  const goal = course.stops[course.stops.length - 1];
  return { ...course, id: `${course.id}-${lessons}`, stops: [...course.stops.slice(0, lessons), goal] };
}
