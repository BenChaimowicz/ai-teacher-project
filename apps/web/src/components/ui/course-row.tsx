import { ChevronRight } from "lucide-react";
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

/** What the current course card's call to action says, by status. */
const ACTION_WORDS: Record<CourseListItem["status"], string> = {
  learning: "Continue",
  making: "See how it's going",
  needs: "Pick up where you left off",
  done: "Look back",
  stopped: "Open",
};

/**
 * Icon tile with the status dot on its corner.
 * @param course - The course
 * @param size - Icon size in px
 */
function CourseIco({ course, size }: { course: CourseListItem; size: number }) {
  return (
    <span className={cn("k-cico", course.status)} aria-hidden="true">
      <CourseIcon name={course.icon} size={size} />
      <i className={cn("k-cdot", course.status)} />
    </span>
  );
}

/**
 * Progress bar: a shimmer while the course is being written, the share of Lessons done while learning, else nothing.
 * @param course - The course
 */
function CourseBar({ course }: { course: CourseListItem }) {
  if (course.status === "making") return <span className="k-cbar writing" aria-hidden="true" />;
  if (course.status !== "learning" || !course.progress || course.progress.total === 0) return null;
  return (
    <span className="k-cbar" aria-hidden="true">
      <i style={{ width: `${Math.round((course.progress.completed / course.progress.total) * 100)}%` }} />
    </span>
  );
}

/**
 * One course in the sidebar. The current course (SEN-97: the one opened most recently) is a large sheet with its
 * progress and a call to action; every other course is a quiet single line under it.
 */
export function CourseRow({ course, active = false, current = false }: { course: CourseListItem; active?: boolean; current?: boolean }) {
  const inner = current ? (
    <>
      <span className="top">
        <CourseIco course={course} size={20} />
        <span className="t">{course.title}</span>
      </span>
      <span className="m">
        <span className={cn("k-rib st", course.status)}>{course.badge}</span>
        <CourseBar course={course} />
      </span>
      {course.href ? (
        <span className="go">
          {ACTION_WORDS[course.status]}
          <ChevronRight />
        </span>
      ) : null}
      <span className="sr-only">, {STATUS_WORDS[course.status]}</span>
    </>
  ) : (
    <>
      <CourseIco course={course} size={13} />
      <span className="t">{course.title}</span>
      <span className="b">{course.badge}</span>
      <span className="sr-only">, {STATUS_WORDS[course.status]}</span>
    </>
  );
  const className = cn(current ? "k-ccur" : "k-crow", active && "active");
  if (!course.href) return <div className={className}>{inner}</div>;
  return (
    <Link to={course.href} className={className} aria-current={active ? "page" : undefined}>
      {inner}
    </Link>
  );
}
