import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { SegmentedProgress, type SegmentState } from "@/components/ui/progress.tsx";
import type { CourseListItem } from "@/lib/course-list.ts";
import { cn } from "@/lib/utils";

type CourseCardProps = {
  course: CourseListItem;
  /** Line under the title, e.g. "Next: Lesson 4 · Quick check". */
  sub?: ReactNode;
  /** Per-lesson segments; defaults to done/todo from progress. */
  segments?: SegmentState[];
  /** Footer left/right, in mono. */
  metaLeft?: ReactNode;
  metaRight?: ReactNode;
  className?: string;
};

/**
 * A course on Home, on a paper sheet: icon cover, title, status ribbon, lesson segments, meta line.
 */
export function CourseCard({ course, sub, segments, metaLeft, metaRight, className }: CourseCardProps) {
  const segs: SegmentState[] | null =
    segments ??
    (course.progress && course.progress.total > 0
      ? Array.from({ length: course.progress.total }, (_, index) => (index < course.progress!.completed ? "done" : "todo"))
      : null);
  const body = (
    <>
      <div className="h">
        <span className={cn("cov", course.status)} aria-hidden="true">
          <CourseIcon name={course.icon} size={20} />
        </span>
        <div className="min-w-0">
          <p className="t">{course.title}</p>
          {sub ? <p className="sub">{sub}</p> : null}
        </div>
        <span className={cn("k-rib badge", course.status)}>{course.badge}</span>
      </div>
      {segs ? (
        <SegmentedProgress
          segments={segs}
          label={course.progress ? `${course.progress.completed} of ${course.progress.total} lessons done` : "progress"}
        />
      ) : null}
      {metaLeft || metaRight ? (
        <div className="m">
          <span>{metaLeft}</span>
          <span>{metaRight}</span>
        </div>
      ) : null}
    </>
  );
  if (!course.href) return <div className={cn("k-ccard", className)}>{body}</div>;
  return (
    <Link to={course.href} className={cn("k-ccard", className)}>
      {body}
    </Link>
  );
}
