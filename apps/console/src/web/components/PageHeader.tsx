import { RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { RangePicker } from "@/components/RangePicker";
import { Tip, TipBody } from "@/components/Tip";
import { useRefresh } from "@/lib/refresh";
import { formatAgo } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * A view's title row with the global controls (time range pill + refresh) on the right, so every view carries them.
 * @param props.title - The view name (or the Overview greeting)
 * @param props.description - What the view answers, in one line
 * @param props.actions - Extra view-specific controls, shown under the global ones
 */
export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <RangePicker />
          <RefreshButton />
        </div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** Re-fetches every panel; the icon flashes green on each refresh. */
function RefreshButton() {
  const { refresh, refreshedAt, tick } = useRefresh();
  const [, setNow] = useState(0);
  // Re-render every 10 s so "20s ago" stays honest.
  useEffect(() => {
    const timer = window.setInterval(() => setNow((n) => n + 1), 10_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <Tip content={<TipBody title="Refresh">Re-fetches every panel. Relative ranges slide forward to now.</TipBody>}>
      <button
        type="button"
        onClick={refresh}
        className="glass glow-focus inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors hover:border-ice/30"
      >
        <RefreshCw key={tick} className={cn("size-3.5", tick > 0 && "flash-ok")} />
        <span key={`t${tick}`} className={cn("tabular-nums text-muted-foreground", tick > 0 && "flash-ok")}>
          {formatAgo(new Date(refreshedAt).toISOString())}
        </span>
      </button>
    </Tip>
  );
}
