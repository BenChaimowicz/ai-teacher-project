import { initialsOf } from "@senoy/db/learner-name";
import { cn } from "@/lib/utils";

/** Avatar sizes: `sm` 30px (the top bar), `md` 40px (the account menu), `lg` 64px, `xl` 104px (the profile header). */
export type AvatarSize = "sm" | "md" | "lg" | "xl";

/**
 * The Learner's initials in a circle, Google-style (`Curious_Owl` → `CO`). Shows a blank circle while the name loads.
 * Decorative: put the name in text next to it.
 * @param name - Display name, or null while unknown
 * @param size - See {@link AvatarSize}
 */
export function Avatar({ name, size = "sm", className }: { name: string | null; size?: AvatarSize; className?: string }) {
  return (
    <span className={cn("k-avatar", size, className)} aria-hidden="true">
      {name ? initialsOf(name) : ""}
    </span>
  );
}
