import { useEffect, useState, type ReactNode } from "react";
import { COMPANION_NAME } from "@/lib/brand-marks.ts";
import { prefersReducedMotion } from "@/lib/cheer.ts";
import { Nibbles, type NibblesMood } from "@/components/ui/nibbles.tsx";
import { cn } from "@/lib/utils";

/**
 * Chat-like column: the companion's lines, the Learner's echoed picks, and cards.
 * History scrolls up; put the current step's OptionTiles right after the latest NibblesLine.
 */
export function ChatThread({ children, className, label = `Conversation with ${COMPANION_NAME}` }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn("k-thread", className)} role="log" aria-label={label} aria-live="polite">
      {children}
    </div>
  );
}

type NibblesLineProps = {
  children: ReactNode;
  /** Show typing dots first, for `delayMs`. Use for new lines, not for history on reload. */
  typing?: boolean;
  delayMs?: number;
  /** A follow-up line from the same speaker: no avatar, no top gap. */
  continued?: boolean;
  mood?: NibblesMood;
  /** Called once the text is visible (e.g. to show the options after it). */
  onShown?: () => void;
};

/**
 * One line from the companion. Low-key and brief: one or two sentences.
 */
export function NibblesLine({ children, typing = false, delayMs = 520, continued = false, mood = "idle", onShown }: NibblesLineProps) {
  const [shown, setShown] = useState(!typing);

  useEffect(() => {
    if (shown) {
      onShown?.();
      return;
    }
    const timer = window.setTimeout(() => setShown(true), prefersReducedMotion() ? 0 : delayMs);
    return () => window.clearTimeout(timer);
    // onShown is a notification; re-running for a new callback identity would fire it twice.
  }, [shown, delayMs]);

  return (
    <div className={cn("k-trow", !continued && "grouped-start")}>
      <span className={cn("av", continued && "empty")} aria-hidden="true">
        {continued ? null : <Nibbles size={32} mood={mood} />}
      </span>
      <div className="k-msg">
        <span className="sr-only">{COMPANION_NAME}: </span>
        {shown ? (
          children
        ) : (
          <span className="k-typing" aria-label={`${COMPANION_NAME} is typing`}>
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The Learner's pick, echoed on the right. good/miss tint it for quiz answers.
 */
export function LearnerEcho({ children, verdict }: { children: ReactNode; verdict?: "good" | "miss" }) {
  return (
    <div className={cn("k-trow me grouped-start", verdict)}>
      <div className="k-msg">
        <span className="sr-only">You: </span>
        {children}
        {verdict === "good" ? <span className="mark" aria-label="right">✓</span> : null}
        {verdict === "miss" ? <span className="mark" aria-label="not quite">✕</span> : null}
      </div>
    </div>
  );
}

type ThreadCardProps = {
  title?: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  /** No left indent. */
  flush?: boolean;
  className?: string;
};

/**
 * A card inside the thread (a plan, a progress panel, a score).
 */
export function ThreadCard({ title, sub, children, flush = false, className }: ThreadCardProps) {
  return (
    <div className={cn("k-tcard", flush && "flush", className)}>
      {title ? <h4>{title}</h4> : null}
      {sub ? <p className="sub">{sub}</p> : null}
      {children}
    </div>
  );
}
