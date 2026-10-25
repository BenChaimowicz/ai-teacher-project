import { pickCourseIcon, type CourseIconName } from "@/lib/brand-marks.ts";

/** A row from `/api/library`: a published Course or an unpublished Course Request. */
export type LibraryItem = {
  id: string;
  kind: "course" | "course_request";
  title: string;
  status: string;
  href: string | null;
  learningGoal?: string;
  /** Published Courses only: completed / total Lessons. */
  progress?: { completed: number; total: number };
};

/** How a course reads to the Learner. Glossary statuses stay in code. */
export type CourseListStatus = "learning" | "making" | "needs" | "done" | "stopped";

/** What the sidebar rows and Home cards render. */
export type CourseListItem = {
  key: string;
  id: string;
  kind: LibraryItem["kind"];
  title: string;
  href: string | null;
  status: CourseListStatus;
  /** Short plain-words tag, e.g. "2/6", "writing", "your turn". */
  badge: string;
  icon: CourseIconName;
  progress?: { completed: number; total: number };
};

const MAKING = new Set(["awaiting_validity", "assessment_preparing", "blueprint_preparing", "generating"]);
const STOPPED = new Set(["rejected", "generation_cancelled"]);
const FAILED = new Set(["generation_failed", "assessment_failed"]);

/**
 * Maps a Library row to plain words and a status group.
 * @param item - Library row
 */
export function toCourseListItem(item: LibraryItem): CourseListItem {
  const base = { key: `${item.kind}-${item.id}`, id: item.id, kind: item.kind, title: item.title, href: item.href, icon: pickCourseIcon(item.title) };
  if (item.kind === "course") {
    const progress = item.progress ?? { completed: 0, total: 0 };
    if (item.status === "Completed") return { ...base, status: "done", badge: "✓ done", progress };
    return { ...base, status: "learning", badge: `${progress.completed}/${progress.total}`, progress };
  }
  if (MAKING.has(item.status)) return { ...base, status: "making", badge: item.status === "generating" ? "writing" : "preparing" };
  if (STOPPED.has(item.status)) return { ...base, status: "stopped", badge: item.status === "rejected" ? "declined" : "stopped" };
  if (FAILED.has(item.status)) return { ...base, status: "needs", badge: "couldn't finish" };
  return { ...base, status: "needs", badge: "your turn" };
}

const ORDER: Record<CourseListStatus, number> = { learning: 0, making: 1, needs: 2, done: 3, stopped: 4 };

/**
 * Sidebar order: learning, being made, needs you, finished; stopped ones are left to Home.
 * @param items - Library rows (newest first from the API)
 */
export function sidebarCourses(items: LibraryItem[]): CourseListItem[] {
  return items
    .map(toCourseListItem)
    .filter((row) => row.status !== "stopped")
    .sort((a, b) => ORDER[a.status] - ORDER[b.status]);
}
