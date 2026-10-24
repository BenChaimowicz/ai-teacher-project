import { AlertTriangle, Inbox, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";

/**
 * Placeholder shown while the first load of a block is in flight.
 * @param props.rows - Number of skeleton lines
 */
export function Loading({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2 p-4", className)} aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="shimmer h-3.5 rounded" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

/**
 * Inline error for a failed fetch, with a retry.
 * @param props.error - What failed
 * @param props.onRetry - Re-fetch
 */
export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  const status = error instanceof ApiError ? error.status : undefined;
  const unreachable = status === 0 || (status !== undefined && status >= 500);
  return (
    <div className="flex items-start gap-3 p-4 text-sm">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {unreachable ? "Couldn't reach the console API. It may be restarting." : "Couldn't load this."}
        </p>
        {unreachable && <p className="mt-0.5 text-xs text-muted-foreground">We tried a few times. Give it a moment, then try again.</p>}
        <p className="mt-1.5 break-words font-mono text-[10px] text-muted-foreground/70">{error.message}</p>
      </div>
      {onRetry && (
        <Button variant="primary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/**
 * Empty state explaining why there is nothing and what makes data appear.
 * @param props.title - What is empty
 * @param props.hint - What to do about it
 */
export function EmptyState({ title, hint, className }: { title: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center", className)}>
      <Inbox className="size-5 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      {hint && <p className="max-w-md text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * A small empty state for inside a chart card.
 * @param props.text - What is missing
 */
export function CardEmpty({ text = "No calls yet in this range." }: { text?: string }) {
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-1 px-4 py-6 text-center text-xs text-muted-foreground">
      <Inbox className="size-4 opacity-60" />
      {text}
    </div>
  );
}

/** The capture hint shared by empty states until migration 0016 and capture are live. */
export const CAPTURE_HINT =
  "Recording starts once migration 0016 is applied and the API/worker make AI calls. Try a wider time range if you expected data.";

/**
 * Renders loading / error / content for one fetch, so views don't repeat the branching.
 * @param props.state - The fetch state
 * @param props.children - Rendered with the data once loaded
 */
export function Async<T>({
  state,
  rows,
  children,
}: {
  state: { data: T | undefined; error: Error | undefined; loading: boolean; reload: () => void };
  rows?: number;
  children: (data: T) => ReactNode;
}) {
  if (state.error && state.data === undefined) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return <Loading rows={rows} />;
  return <>{children(state.data)}</>;
}

/** Tiny spinner for "refreshing in the background". */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-3.5 animate-spin text-muted-foreground", className)} />;
}
