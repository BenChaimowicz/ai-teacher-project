import type { DemoCourse } from "./types";
import norse16Json from "./norse-16.json";
import norse30Json from "./norse-30.json";

/**
 * The real published 16-Lesson Norse Course plus its Goal Check, as the demo shows it.
 */
export const norse16: DemoCourse = norse16Json as DemoCourse;

/**
 * The 30-Lesson Norse Course used only to test crowding on the map, plus its Goal Check.
 */
export const norse30: DemoCourse = norse30Json as DemoCourse;
