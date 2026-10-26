import { pickCourseIcon, type CourseIconName } from "@/lib/brand-marks.ts";

/** Window event that makes the sidebar course list reload; fire it with `notifyLibraryChanged()`. */
export const LIBRARY_CHANGED_EVENT = "knibbler:library-changed";

/** Tells the sidebar course list to reload, e.g. after an action that changes a course's status. */
export function notifyLibraryChanged() {
  window.dispatchEvent(new Event(LIBRARY_CHANGED_EVENT));
}

const HIDDEN_KEY = "knibbler-hidden-courses";

/** Course keys (`kind-id`) the Learner removed from the UI in this browser. */
export function readHiddenCourses(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/**
 * Hides a course from Home and the sidebar (this browser only; nothing is deleted).
 * @param key - `CourseListItem.key`
 */
export function hideCourse(key: string) {
  const hidden = readHiddenCourses();
  hidden.add(key);
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden]));
  } catch {
    // Private mode can refuse storage; the course comes back on reload.
  }
  notifyLibraryChanged();
}

/**
 * Drops the rows the Learner removed.
 * @param items - Library rows
 */
export function withoutHidden(items: LibraryItem[]): LibraryItem[] {
  const hidden = readHiddenCourses();
  return items.filter((item) => !hidden.has(`${item.kind}-${item.id}`));
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
