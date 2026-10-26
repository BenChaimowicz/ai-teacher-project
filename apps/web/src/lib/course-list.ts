import { pickCourseIcon, type CourseIconName } from "@/lib/brand-marks.ts";

/** Window event that makes the sidebar course list reload; fire it with `notifyLibraryChanged()`. */
export const LIBRARY_CHANGED_EVENT = "knibbler:library-changed";

/** Tells the sidebar course list to reload, e.g. after an action that changes a course's status. */
export function notifyLibraryChanged() {
  window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
}

/**
 * Removes a course from the Library (Home and the sidebar) for good. Nothing is deleted on the server;
 * it's marked hidden. Throws with a plain message when the server refuses.
 * @param course - The row's kind and id
 */
export async function hideCourse(course: Pick<CourseListItem, "kind" | "id">) {
  const response = await fetch("/api/library/hide", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: course.kind, id: course.id }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Couldn't remove that course. Try again.");
  }
  notifyLibraryChanged();
}

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
  // Everything else waits on the Learner: a clarification, focusing questions or a proposed focus (SEN-90), the
  // Starting Level check, the plan. validity_passed and goal_focused land here too, as the screen moves them on.
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
