import { Home, UserRound } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { CourseRequestControl } from "@/components/course-request-control.tsx";
import { OpenItems } from "@/components/open-items.tsx";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/teaching-profile", label: "Teaching Profile", icon: UserRound, end: true },
];

/**
 * Dark Workspace chrome: sidebar plus the current screen.
 */
export function WorkspaceLayout() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/60">
        <div className="px-4 py-5 text-sm font-semibold tracking-wide">Workspace</div>
        <nav className="flex flex-col gap-1 px-2" aria-label="Workspace">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  isActive && "bg-accent text-foreground",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
          <CourseRequestControl variant="nav">New Course Request</CourseRequestControl>
        </nav>
        <OpenItems />
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
