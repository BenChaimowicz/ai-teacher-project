import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { cn } from "@/lib/utils";

/** Why New course waits, in plain words (spec §3: the Profile comes first). */
const PROFILE_FIRST = "Before your first course: a few quick choices about how I teach you. It takes about a minute, and Home stays open meanwhile.";

/**
 * New Course Request control that blocks until the Teaching Profile is saved.
 * `sidebar` is the shell's primary "New course" button.
 */
export function CourseRequestControl({
  variant,
  children,
}: {
  variant: "nav" | "button" | "sidebar";
  children: ReactNode;
}) {
  const { loading, present } = useTeachingProfile();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const dialog = (
    <ConfirmDialog
      open={open}
      title="First, how you like to learn"
      body={PROFILE_FIRST}
      confirmLabel="Set it up"
      cancelLabel="Not now"
      onConfirm={() => {
        setOpen(false);
        navigate("/teaching-profile");
      }}
      onCancel={() => setOpen(false)}
    />
  );

  if (variant === "sidebar") {
    if (present) {
      return (
        <Link to="/new-course-request" className="k-new">
          {children}
        </Link>
      );
    }
    return (
      <>
        <button type="button" className="k-new" disabled={loading} onClick={() => setOpen(true)}>
          {children}
        </button>
        {dialog}
      </>
    );
  }

  if (variant === "nav") {
    if (present) {
      return (
        <NavLink
          to="/new-course-request"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              isActive && "bg-accent text-foreground",
            )
          }
        >
          <Plus className="size-4" />
          {children}
        </NavLink>
      );
    }
    return (
      <>
        <button
          type="button"
          disabled={loading}
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          <Plus className="size-4" />
          {children}
        </button>
        {dialog}
      </>
    );
  }

  if (present) {
    return (
      <Button asChild>
        <Link to="/new-course-request">{children}</Link>
      </Button>
    );
  }

  return (
    <>
      <Button type="button" disabled={loading} onClick={() => setOpen(true)}>
        {children}
      </Button>
      {dialog}
    </>
  );
}
