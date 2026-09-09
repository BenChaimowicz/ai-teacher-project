import { Plus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { COURSE_REQUEST_BLOCKED } from "@/lib/teaching-profile-copy.ts";
import { cn } from "@/lib/utils";

/**
 * New Course Request control that blocks until the Teaching Profile is saved.
 */
export function CourseRequestControl({
  variant,
  children,
}: {
  variant: "nav" | "button";
  children: ReactNode;
}) {
  const { loading, present } = useTeachingProfile();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const dialog = (
    <ConfirmDialog
      open={open}
      title="Teaching Profile comes first"
      body={COURSE_REQUEST_BLOCKED}
      confirmLabel="Go to Teaching Profile"
      cancelLabel="Not now"
      onConfirm={() => {
        setOpen(false);
        navigate("/teaching-profile");
      }}
      onCancel={() => setOpen(false)}
    />
  );

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
