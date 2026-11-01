import { initialsOf } from "@senoy/db/learner-name";
import { cn } from "@/lib/utils";

/**
 * The Learner's initials in a circle, Google-style (`Curious_Owl` → `CO`). Shows a blank circle while the name loads.
 * Decorative: put the name in text next to it.
 * @param name - Display name, or null while unknown
 * @param size - `sm` for the sidebar, `lg` for Settings
 */
export function Avatar({ name, size = "sm", className }: { name: string | null; size?: "sm" | "lg"; className?: string }) {
  return (
    <span className={cn("k-avatar", size, className)} aria-hidden="true">
      {name ? initialsOf(name) : ""}
    </span>
  );
}
