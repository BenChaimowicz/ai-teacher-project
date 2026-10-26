import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/dialog.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { hideCourse, type CourseListItem } from "@/lib/course-list.ts";
import { cn } from "@/lib/utils";

/**
 * Wraps a course card or row with a small remove (×) button. Removing takes the course off Home and the
 * sidebar for good (the server marks it hidden; nothing is deleted).
 */
export function RemovableCourse({ course, className, children }: { course: Pick<CourseListItem, "kind" | "id" | "title">; className?: string; children: ReactNode }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const remove = async () => {
    setBusy(true);
    try {
      await hideCourse(course);
      setAsking(false);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Couldn't remove that course. Try again." });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={cn("k-removable", className)}>
      {children}
      <button type="button" className="k-remove" aria-label={`Remove ${course.title}`} title="Remove" onClick={() => setAsking(true)}>
        <X aria-hidden="true" />
      </button>
      <ConfirmDialog
        open={asking}
        title={`Remove ${course.title}?`}
        body="It disappears from Home and the sidebar."
        confirmLabel="Remove"
        danger
        busy={busy}
        onConfirm={() => void remove()}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}
