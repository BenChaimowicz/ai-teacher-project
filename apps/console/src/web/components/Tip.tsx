import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/** Delay before a tooltip shows, so sweeping the mouse across a table doesn't flash tooltips. */
const OPEN_DELAY_MS = 140;

/**
 * A rich hover/focus tooltip rendered in a portal, positioned above the trigger (or below when there's no room),
 * and clamped to the viewport.
 * @param props.content - Tooltip body; can hold several lines and key/value lists
 * @param props.children - The trigger
 * @param props.className - Classes for the trigger wrapper
 * @param props.underline - Dotted underline on the trigger to hint that it explains itself
 * @param props.style - Inline style for the trigger wrapper (e.g. a width when it is a flex item)
 */
export function Tip({
  content,
  children,
  className,
  underline,
  style,
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  underline?: boolean;
  style?: CSSProperties;
}) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
    setPos(null);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tipRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    const margin = 8;
    let top = t.top - tip.height - margin;
    if (top < margin) top = t.bottom + margin;
    let left = t.left + t.width / 2 - tip.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - tip.width - margin));
    setPos({ left, top });
  }, [open]);

  if (content === null || content === undefined || content === false) return <>{children}</>;

  return (
    <span
      ref={triggerRef}
      style={style}
      className={cn("inline-flex max-w-full", underline && "cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-2", className)}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className={cn(
              "pointer-events-none fixed z-[100] max-w-[22rem] rounded-lg border bg-popover px-3 py-2 text-xs leading-relaxed text-foreground shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-md",
              pos ? "animate-pop-in" : "opacity-0",
            )}
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0 }}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

/**
 * A tooltip body: optional title, a few lines of prose, and a key/value list.
 * @param props.title - Bold first line
 * @param props.rows - Key/value pairs (value may be any node)
 * @param props.children - Prose under the title
 */
export function TipBody({
  title,
  rows,
  children,
}: {
  title?: ReactNode;
  rows?: [ReactNode, ReactNode][];
  children?: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {title && <div className="font-semibold text-foreground">{title}</div>}
      {children && <div className="text-muted-foreground">{children}</div>}
      {rows && rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {rows.map(([k, v], i) => (
            <div key={i} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-right tabular-nums text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
