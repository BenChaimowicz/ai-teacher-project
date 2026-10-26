import { Link } from "react-router-dom";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import type { CourseListItem } from "@/lib/course-list.ts";
import { cn } from "@/lib/utils";

const STATUS_WORDS: Record<CourseListItem["status"], string> = {
  learning: "learning",
  making: "being made",
  needs: "needs you",
  done: "finished",
  stopped: "stopped",
};

/**
 * One line per course in the sidebar: icon (status dot on its corner), title, tiny progress, a small status ribbon.
 */
export function CourseRow({ course, active = false }: { course: CourseListItem; active?: boolean }) {
  const progress = course.progress && course.progress.total > 0 ? course.progress.completed / course.progress.total : null;
  const inner = (
    <>
      <span className={cn("k-cico", course.status)} aria-hidden="true">
        <CourseIcon name={course.icon} size={15} />
        <i className={cn("k-cdot", course.status)} />
      </span>
      <span className="t">{course.title}</span>
      {course.status === "making" ? (
        <span className="k-cbar writing" aria-hidden="true" />
      ) : progress !== null && course.status === "learning" ? (
        <span className="k-cbar" aria-hidden="true">
          <i style={{ width: `${Math.round(progress * 100)}%` }} />
        </span>
      ) : null}
      <span className={cn("k-rib st", course.status)}>{course.badge}</span>
      <span className="sr-only">, {STATUS_WORDS[course.status]}</span>
    </>
  );
  if (!course.href) return <div className="k-crow">{inner}</div>;
  return (
    <Link to={course.href} className={cn("k-crow", active && "active")} aria-current={active ? "page" : undefined}>
      {inner}
    </Link>
  );
}
