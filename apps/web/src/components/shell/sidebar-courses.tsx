import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CourseRow } from "@/components/ui/course-row.tsx";
import { sidebarCourses, type CourseListItem, type LibraryItem } from "@/lib/course-list.ts";

const MAX_ROWS = 5;

/**
 * Is this row the screen being shown?
 * @param course - Sidebar row
 * @param pathname - Current path
 */
function isActive(course: CourseListItem, pathname: string) {
  if (course.kind === "course") return pathname.startsWith(`/study/${course.id}`);
  return pathname === `/course-requests/${course.id}`;
}

/**
 * Sidebar course list: one line per course, at most five, then "see all on Home". Never scrolls.
 */
export function SidebarCourses() {
  const { pathname } = useLocation();
  const [items, setItems] = useState<CourseListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/library")
      .then((response) => {
        if (!response.ok) throw new Error("Could not load courses");
        return response.json() as Promise<{ items: LibraryItem[] }>;
      })
      .then((body) => {
        if (!cancelled) setItems(sidebarCourses(body.items));
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const shown = items?.slice(0, MAX_ROWS) ?? [];
  const more = items ? items.length - shown.length : 0;

  return (
    <nav className="courses" aria-label="Your courses">
      <p className="k-sec-h">
        your courses<span className="n">{items ? items.length : ""}</span>
      </p>
      {items && items.length === 0 ? <p className="k-empty-line">Nothing yet. Start one and it shows up here.</p> : null}
      <div className="k-clist">
        {shown.map((course) => (
          <CourseRow key={course.key} course={course} active={isActive(course, pathname)} />
        ))}
      </div>
      {more > 0 ? (
        <Link to="/" className="k-see-all">
          +{more} more · see all on Home →
        </Link>
      ) : null}
    </nav>
  );
}
