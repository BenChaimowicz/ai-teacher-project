import { COURSE_ICON_PATHS, type CourseIconName } from "@/lib/brand-marks.ts";
import { cn } from "@/lib/utils";

/**
 * A course's icon by name, falling back to the generic sparkle.
 * Names come from `pickCourseIcon(subject)` for now; later the plan step stores one per Course.
 */
export function CourseIcon({ name, size = 18, className }: { name: CourseIconName | string; size?: number; className?: string }) {
  const paths = COURSE_ICON_PATHS[name as CourseIconName] ?? COURSE_ICON_PATHS.generic;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}
