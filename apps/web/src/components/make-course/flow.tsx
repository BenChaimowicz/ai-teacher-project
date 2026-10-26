import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { Loader } from "@/components/ui/loader.tsx";
import { prefersReducedMotion } from "@/lib/cheer.ts";
import { cn } from "@/lib/utils";
import "./make-course.css";

/** The steps of making a Course, as the top bar names them. */
export const MAKE_STEPS = ["Topic", "Goal", "Level", "Plan", "Making"] as const;

/**
 * Steps for the top bar, a small diamond each (put it in `ShellActions`). Steps before `current` are ticked; `current` past the end
 * ticks them all.
 * @param current - Index of the step in progress
 */
export function FlowSteps({ current, steps = MAKE_STEPS }: { current: number; steps?: readonly string[] }) {
  return (
    <ol className="mk-steps" aria-label="Steps">
      {steps.map((name, index) => (
        <Fragment key={name}>
          {index > 0 ? <li className="sep" aria-hidden="true" /> : null}
          <li className={cn(index < current && "done", index === current && "now")} aria-current={index === current ? "step" : undefined}>
            <i className="dia" aria-hidden="true" />
            {name}
            {index < current ? <span className="sr-only"> (done)</span> : null}
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/**
 * A make-a-Course screen's title for the top bar (`ShellTitle`), in the display serif as the mock heads its screens.
 */
export function FlowTitle({ children }: { children: ReactNode }) {
  return <span className="mk-title">{children}</span>;
}

/**
 * Keeps the newest part of a thread in view: scrolls to this marker whenever `watch` changes.
 * @param watch - Anything that changes when the thread grows
 */
export function ThreadEnd({ watch }: { watch: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    // The first render lands at the top of history; later growth scrolls the new step into view.
    const behavior: ScrollBehavior = first.current || prefersReducedMotion() ? "auto" : "smooth";
    first.current = false;
    const timer = window.setTimeout(() => ref.current?.scrollIntoView({ block: "end", behavior }), 60);
    return () => window.clearTimeout(timer);
  }, [watch]);
  return <div ref={ref} aria-hidden="true" style={{ height: 1 }} />;
}

/* Server steps already started in this tab, so a remount (or React's dev double-mount) never sends one twice. */
const started = new Set<string>();

/**
 * Starts a server step the Learner does not need to trigger (spec §3), once per `key`. Pass null to start nothing.
 * The key should name the record and its status, so the same step can start again after the status moves on and back.
 * @param key - What is being started, or null
 * @param run - Starts it; failures are the caller's to show
 */
export function useAutoStep(key: string | null, run: () => Promise<unknown> | unknown) {
  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (!key || started.has(key)) return;
    started.add(key);
    void Promise.resolve(runRef.current()).finally(() => {
      // Let a later visit start it again if the step is still waiting then (e.g. after a failure and Try again).
      window.setTimeout(() => started.delete(key), 1000);
    });
  }, [key]);
}

/**
 * A server step in progress, said plainly, with the hopping loader.
 */
export function WorkingLine({ children }: { children: ReactNode }) {
  return (
    <span className="mk-working" role="status">
      <Loader size={24} />
      <span>{children}</span>
    </span>
  );
}
