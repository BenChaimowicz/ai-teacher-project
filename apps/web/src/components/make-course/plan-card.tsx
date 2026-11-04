import { List, Shuffle } from "lucide-react";
import type { CSSProperties } from "react";
import { GOAL_CHECK_METHOD_ID } from "@senoy/db/goal-check";
import type { SequenceMode } from "@senoy/db/sequence-mode";
import { ThreadCard } from "@/components/ui/chat-thread.tsx";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { pickCourseIcon } from "@/lib/brand-marks.ts";
import type { BlueprintView } from "@/lib/course-request-types.ts";
import { cn } from "@/lib/utils";

/** Learner-facing names for a slot's Teaching method. */
const METHOD_LABELS: Record<string, string> = { reading: "Read", quiz: "Quiz", [GOAL_CHECK_METHOD_ID]: "Goal Check" };

/** Keeps a row without a tick in line with the rows that have one. */
const CHECK_SPACER = { width: 20, flex: "none" } as const satisfies CSSProperties;

type PlanCardProps = {
  view: BlueprintView;
  subject: string;
  /** Slot ids the Learner unticked (marked not relevant). */
  unticked?: ReadonlySet<string>;
  /** Untick or tick a Lesson; omit for a read-only plan. */
  onToggle?: (slotId: string) => void;
  /** Change Step by step / Jump around; omit to show the pick read-only. */
  onSequenceMode?: (mode: SequenceMode) => void;
  busy?: boolean;
  className?: string;
};

/** Plain words for a Sequence mode. */
export function sequenceModeName(mode: SequenceMode) {
  return mode === "free_jump" ? "Jump around" : "Step by step";
}

/**
 * The plan (Course Blueprint) in the thread: titles and Lesson goals only (spec §4.4), a tick per Lesson to mark it
 * not relevant, and Step by step / Jump around. The Goal Check (SEN-81) shows as the Course's last item with no tick:
 * it checks the Learning Goal itself, so it cannot be marked, and it is not counted as a Lesson.
 */
export function PlanCard({ view, subject, unticked = new Set(), onToggle, onSequenceMode, busy = false, className }: PlanCardProps) {
  const slots = view.blueprint.modules.flatMap((module) => module.slots);
  const kept = slots.filter((slot) => !unticked.has(slot.id) && slot.method !== GOAL_CHECK_METHOD_ID);
  const reads = kept.filter((slot) => slot.method === "reading").length;
  const quizzes = kept.length - reads;
  const goalChecks = slots.length - slots.filter((slot) => slot.method !== GOAL_CHECK_METHOD_ID).length;
  const multiModule = view.blueprint.modules.length > 1;
  let number = 0;

  return (
    <ThreadCard className={className}>
      <div className="mk-plan-head">
        <div className="min-w-0">
          <h4>{view.blueprint.courseTitle}</h4>
          <p className="sub">{onToggle ? "Untick anything that isn't useful to you, and I'll redo the plan around it." : "Your plan."}</p>
        </div>
        <span className="mk-cover" aria-hidden="true"><CourseIcon name={pickCourseIcon(`${view.blueprint.courseTitle} ${subject}`)} size={22} /></span>
      </div>
      <div className="mk-summary" aria-label="Plan summary">
        <span><b>{kept.length}</b> lessons</span>
        <span><b>{reads}</b> reading</span>
        <span><b>{quizzes}</b> {quizzes === 1 ? "quiz" : "quizzes"}</span>
        {goalChecks ? <span><b>{goalChecks}</b> goal check</span> : null}
      </div>
      <div className="mk-plan-bar" aria-hidden="true">
        {slots.map((slot) => <i key={slot.id} className={cn(slot.method !== "reading" && "q", unticked.has(slot.id) && "off")} />)}
      </div>
      {view.blueprint.modules.map((module) => (
        <div key={module.title}>
          {multiModule ? <p className="mk-module">{module.title}</p> : null}
          <ol className="mk-lessons" aria-label={multiModule ? module.title : "Lessons"}>
            {module.slots.map((slot) => {
              number += 1;
              const goalCheck = slot.method === GOAL_CHECK_METHOD_ID;
              const off = !goalCheck && unticked.has(slot.id);
              const body = (
                <>
                  {onToggle ? (goalCheck ? <span style={CHECK_SPACER} aria-hidden="true" /> : <span className={cn("mk-check", !off && "on")} aria-hidden="true" />) : null}
                  <span className="n">{String(number).padStart(2, "0")}</span>
                  <span className="lt">{slot.title}<small>{slot.lessonGoal}</small></span>
                  <span className={cn("k-rib", slot.method === "quiz" && "done", goalCheck && "making")}>{METHOD_LABELS[slot.method] ?? slot.method}</span>
                </>
              );
              const style = { "--i": number } as CSSProperties;
              return (
                <li key={slot.id}>
                  {onToggle && !goalCheck ? (
                    <label className={cn("mk-lesson", off && "off")} style={style}>
                      <input type="checkbox" checked={!off} disabled={busy} onChange={() => onToggle(slot.id)} aria-label={`Keep lesson ${number}: ${slot.title}`} />
                      {body}
                    </label>
                  ) : (
                    <div className="mk-lesson" style={style}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      <fieldset className="mk-seg" disabled={busy || !onSequenceMode}>
        <legend>How lessons open</legend>
        {(["linear", "free_jump"] as const).map((mode) => (
          <label key={mode}>
            <input
              type="radio"
              name={`sequence-${view.blueprint.courseTitle}`}
              checked={view.sequenceMode === mode}
              onChange={() => onSequenceMode?.(mode)}
            />
            {mode === "linear" ? <List aria-hidden="true" /> : <Shuffle aria-hidden="true" />}
            {sequenceModeName(mode)}
          </label>
        ))}
      </fieldset>
      <p className="mk-hint">
        {view.sequenceMode === "linear"
          ? "Lessons open in order. A quick check unlocks the next part."
          : onSequenceMode
            ? "Every lesson is open from the start. Once the course is made, you can't switch back to step by step."
            : "Every lesson is open from the start."}
      </p>
    </ThreadCard>
  );
}
