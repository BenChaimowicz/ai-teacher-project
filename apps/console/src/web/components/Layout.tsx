import { Activity, AlertOctagon, Gauge, History, Scale, GitBranch, ListTree, Network, NotebookPen, Users } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { PipelineEventDrawer } from "@/components/PipelineEventDrawer";
import { Tip, TipBody } from "@/components/Tip";
import { UsageRecordDrawer } from "@/components/UsageRecordDrawer";
import { AUTO_REFRESH_OPTIONS, useRefresh } from "@/lib/refresh";
import { useDrawers, useHref } from "@/lib/nav";
import { useOps } from "@/lib/useOps";
import { cn } from "@/lib/cn";

/** The views in the left nav. */
const NAV = [
  { to: "/", label: "Overview", icon: Gauge, end: true },
  { to: "/calls", label: "Calls", icon: Activity, hint: "Usage Records: every external model or research call." },
  { to: "/course-requests", label: "Course Requests", icon: GitBranch, hint: "Cost and timeline per Course Request." },
  { to: "/steps", label: "Pipeline steps", icon: ListTree, hint: "Pipeline Events: the platform's own steps." },
  { to: "/billing", label: "Billing check", icon: Scale, hint: "Vendor balances vs what the console recorded." },
  { to: "/openrouter", label: "OpenRouter history", icon: History, hint: "OpenRouter's own daily report for our key, imported once." },
  { to: "/failures", label: "Failures", icon: AlertOctagon, hint: "What failed and why, grouped by reason." },
  { to: "/activity", label: "Learner activity", icon: Users, hint: "Product Events: what Learners did." },
  { to: "/api", label: "API traffic", icon: Network, hint: "API Requests: hits on our own HTTP API." },
  { to: "/decisions", label: "Decisions", icon: NotebookPen, hint: "The team's decision log: what we decided, why, and when." },
] as const;

/**
 * The Usage Console shell: the sidebar (lockup, nav, live status, auto-refresh), the active view
 * with a fade/slide transition, and the URL-driven detail drawers.
 */
export function Layout() {
  const location = useLocation();
  const href = useHref();
  const { callId, stepId } = useDrawers();

  return (
    <div className="flex min-h-screen">
      <nav className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r bg-[#050911]/70 backdrop-blur-xl">
        <div className="flex items-center gap-2.5 px-4 pb-5 pt-5">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-cyan-300/30 via-sky-400/20 to-blue-600/20 text-base font-bold text-ice ring-1 ring-ice/35 shadow-[0_0_24px_-6px_rgba(103,232,249,0.7)]">
            K
          </span>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Knibbler</div>
            <div className="text-sm font-semibold">
              <span className="text-gradient">Usage Console</span>
            </div>
          </div>
        </div>
        <ul className="flex-1 space-y-1 px-3">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={href(item.to)}
                end={"end" in item ? item.end : false}
                title={"hint" in item ? item.hint : undefined}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-200",
                    isActive ? "pill-gradient text-foreground" : "text-muted-foreground hover:bg-ice/[0.05] hover:text-foreground",
                  )
                }
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        <SidebarFooter />
      </nav>

      <main key={location.pathname} className="animate-view-in min-w-0 flex-1 px-8 py-6">
        <div className="mx-auto max-w-[1600px]">
          <Outlet />
        </div>
      </main>

      {callId && <UsageRecordDrawer key={callId} id={callId} />}
      {stepId && !callId && <PipelineEventDrawer key={stepId} id={stepId} />}
    </div>
  );
}

/**
/** Sidebar footer: API health with a live dot and the auto-refresh interval. */
function SidebarFooter() {
  const { autoMs, setAutoMs } = useRefresh();
  const health = useOps<{ ok: boolean }>("health");
  const healthy = health.data?.ok === true;

  return (
    <div className="space-y-2 border-t p-3 text-xs">
      <Tip
        className="block"
        content={
          <TipBody
            title="Console API"
            rows={[
              ["Reachable", health.data ? "yes" : health.error ? "no" : "checking…"],
            ]}
          >
            {health.error ? health.error.message : "The console API (:3100), proxied under /api."}
          </TipBody>
        }
      >
        <div className="flex items-center gap-2">
          <span className={cn("size-2 shrink-0 rounded-full", healthy ? "live-dot" : health.error ? "bg-bad" : "bg-muted-foreground")} />
          <span className={healthy ? "text-foreground" : "text-muted-foreground"}>
            {healthy ? "Live" : health.error ? "API unreachable" : "Connecting…"}
          </span>
          {healthy && <span className="text-muted-foreground">· {autoMs ? `auto-refresh ${autoMs / 1000}s` : "manual refresh"}</span>}
        </div>
      </Tip>
      <select
        value={autoMs}
        onChange={(e) => setAutoMs(Number(e.target.value))}
        className="glow-focus h-7 w-full rounded-lg border bg-secondary px-2 text-xs text-foreground [&>option]:bg-card-solid"
        aria-label="Auto-refresh"
      >
        {AUTO_REFRESH_OPTIONS.map((ms) => (
          <option key={ms} value={ms}>
            {ms === 0 ? "Auto-refresh off" : `Auto-refresh every ${ms / 1000}s`}
          </option>
        ))}
      </select>
    </div>
  );
}
