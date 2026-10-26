import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/dialog.tsx";
import { hideCourse, type CourseListItem } from "@/lib/course-list.ts";
import { cn } from "@/lib/utils";

/**
 * Wraps a course card or row with a small remove (×) button. Removing hides the course from Home and the
 * sidebar in this browser only; nothing is deleted on the server.
 */
export function RemovableCourse({ course, className, children }: { course: Pick<CourseListItem, "key" | "title">; className?: string; children: ReactNode }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className={cn("k-removable", className)}>
      {children}
      <button type="button" className="k-remove" aria-label={`Remove ${course.title}`} title="Remove" onClick={() => setAsking(true)}>
        <X aria-hidden="true" />
      </button>
      <ConfirmDialog
        open={asking}
        title={`Remove ${course.title}?`}
        body="It disappears from Home and the sidebar. Nothing is deleted."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          setAsking(false);
          hideCourse(course.key);
        }}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
