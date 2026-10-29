import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { CourseRow } from "@/components/ui/course-row.tsx";
import { RemovableCourse } from "@/components/ui/remove-course.tsx";
import { LIBRARY_CHANGED_EVENT, currentCourse, sidebarCourses, type CourseListItem, type LibraryItem } from "@/lib/course-list.ts";

/** Other courses listed under the current one; the rest are on Home. */
const MAX_OTHERS = 3;
/** How often to re-check while a course is being made or a Course Request screen is open. */
const POLL_MS = 5000;

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
 * Sidebar courses (SEN-97): the current course, the one opened most recently, as a large card; up to three others as
 * single lines under it, then "see all on Home". Never scrolls.
 */
export function SidebarCourses() {
  const { pathname } = useLocation();
  const [items, setItems] = useState<CourseListItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch("/api/library")
        .then((response) => {
          if (!response.ok) throw new Error("Could not load courses");
          return response.json() as Promise<{ items: LibraryItem[] }>;
        })
        .then((body) => {
          if (!cancelled) setItems(sidebarCourses(body.items));
        })
        .catch(() => {
          if (!cancelled) setItems((current) => current ?? []);
        });
    };
    load();
    window.addEventListener(LIBRARY_CHANGED_EVENT, load);
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener(LIBRARY_CHANGED_EVENT, load);
      window.removeEventListener("focus", load);
    };
  }, [pathname]);

  // Statuses move on the server (validity, planning, writing) without a navigation, so keep checking while they can.
  const moving = pathname.startsWith("/course-requests/") || (items?.some((course) => course.status === "making") ?? false);
  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT)), POLL_MS);
    return () => window.clearInterval(timer);
  }, [moving]);

  const current = items ? currentCourse(items) : null;
  const others = items?.filter((course) => course !== current) ?? [];
  const shown = others.slice(0, MAX_OTHERS);
  const more = others.length - shown.length;

  return (
    <nav className="courses" aria-label="Your courses">
      {items && items.length === 0 ? (
        <>
          <p className="k-sec-h">your course</p>
          <p className="k-empty-line">Nothing yet. Start one and it shows up here.</p>
        </>
      ) : null}
      {current ? (
        <>
          <p className="k-sec-h">your course</p>
          <RemovableCourse course={current} className="cur">
            <CourseRow course={current} active={isActive(current, pathname)} current />
          </RemovableCourse>
        </>
      ) : null}
      {shown.length > 0 ? (
        <>
          <p className="k-sec-h others">
            also on your desk<span className="n">{others.length}</span>
          </p>
          <div className="k-clist">
            {shown.map((course) => (
              <RemovableCourse key={course.key} course={course} className="row">
                <CourseRow course={course} active={isActive(course, pathname)} />
              </RemovableCourse>
            ))}
          </div>
        </>
      ) : null}
      {more > 0 ? (
        <Link to="/" className="k-see-all">
          +{more} more · see all on Home →
        </Link>
      ) : null}
    </nav>
  );
}
