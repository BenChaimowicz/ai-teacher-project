import { Check, DoorOpen, X } from "lucide-react";
import type { CourseRequestStatus } from "@senoy/db/course-request";
import { ThreadCard } from "@/components/ui/chat-thread.tsx";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { Loader } from "@/components/ui/loader.tsx";
import { ProgressBar } from "@/components/ui/progress.tsx";
import { pickCourseIcon } from "@/lib/brand-marks.ts";
import type { BlueprintView, GenerationView } from "@/lib/course-request-types.ts";
import { cn } from "@/lib/utils";

/** The three stages the Learner sees, in order (spec §5.2: research, then each Lesson, then whole-Course checks). */
const STAGES = ["Finding good sources", "Writing lessons", "Checking it all fits together"] as const;

/** Which stage is in progress: 0–2, or 3 once published. */
function stageIndex(status: CourseRequestStatus, generation: GenerationView | null, failureReason: string | null) {
  if (status === "published") return 3;
  if (!generation) return 0;
  if (generation.stage === "publish") return 2;
  if (generation.stage === "lesson") return 1;
  if (generation.stage === "research") return 0;
  // Not running (queued, stopped, failed): stages before the next unwritten Lesson are done.
  if (generation.finishedLessons >= generation.totalLessons && generation.totalLessons > 0) return 2;
  // Research runs for every Lesson before writing starts, so a stop is in writing unless it says otherwise.
  if (status === "generation_failed") return /research/i.test(failureReason ?? "") ? 0 : 1;
  return generation.finishedLessons > 0 ? 1 : 0;
}

/** Rough share of the work done, for the bar. Research ≈ 10%, each Lesson an equal share of 80%, checks the rest. */
function share(status: CourseRequestStatus, generation: GenerationView | null) {
  if (status === "published") return 1;
  if (!generation || generation.totalLessons === 0) return 0.02;
  if (generation.stage === "research") return 0.05;
  if (generation.stage === "publish") return 0.95;
  const lessons = generation.finishedLessons / generation.totalLessons;
  const writing = generation.stage === "lesson" ? 0.5 / generation.totalLessons : 0;
  return Math.min(0.92, 0.1 + 0.8 * (lessons + writing));
}

/**
 * The one line saying what is happening right now: never a draft, Sources, or a token stream (spec §3).
 * @param status - Request status
 * @param generation - The job's Waiting view
 */
export function nowLine(status: CourseRequestStatus, generation: GenerationView | null) {
  if (status === "published") return "All done.";
  if (!generation || generation.status === "queued") return "Waiting for a free writer. It starts in a moment.";
  if (status === "generation_cancelled") return `Stopped. ${generation.finishedLessons} of ${generation.totalLessons} lessons written.`;
  if (status === "generation_failed") return `Stopped. ${generation.finishedLessons} of ${generation.totalLessons} lessons written.`;
  if (generation.stage === "research") return "Reading up on the topic for every lesson before writing starts.";
  if (generation.stage === "publish") return `All ${generation.totalLessons} lessons are written. Checking that they fit together.`;
  if (generation.lessonNumber && generation.lessonTitle) {
    return `Writing lesson ${generation.lessonNumber} of ${generation.totalLessons}: “${generation.lessonTitle}”.`;
  }
  return `${generation.finishedLessons} of ${generation.totalLessons} lessons written.`;
}

type MakingCardProps = {
  view: BlueprintView;
  generation: GenerationView | null;
  status: CourseRequestStatus;
  /** Why a failed run stopped, to mark the right stage. */
  failureReason?: string | null;
};

/**
 * The waiting screen's card: the three stages, a bar, what is being written now, and every Lesson ticked as it is
 * written, so a half-hour run shows steady progress. Says plainly that the Learner can leave.
 */
export function MakingCard({ view, generation, status, failureReason = null }: MakingCardProps) {
  const slots = view.blueprint.modules.flatMap((module) => module.slots);
  const running = status === "generating";
  const stopped = status === "generation_cancelled" || status === "generation_failed";
  const stage = stageIndex(status, generation, failureReason);
  const pct = Math.round(share(status, generation) * 100);
  const finished = new Set(generation?.finishedSlotIds ?? []);
  const writingTitle = running && generation?.stage === "lesson" ? generation.lessonTitle : null;
  // A failed run stopped at the first Lesson not yet written, in writing order (Readings, then Quizzes).
  const stoppedAt = status === "generation_failed" && stage === 1
    ? [...slots.filter((slot) => slot.method === "reading"), ...slots.filter((slot) => slot.method !== "reading")].find((slot) => !finished.has(slot.id))?.id
    : undefined;

  return (
    <ThreadCard className="mk-making">
      <div className="flex items-start justify-between gap-3">
        <ol className="mk-stages" aria-label="Stages">
          {STAGES.map((name, index) => {
            const state = index < stage ? "done" : index === stage ? (stopped ? (status === "generation_failed" ? "miss" : "") : "now") : "";
            return (
              <li key={name} className={state} aria-current={state === "now" ? "step" : undefined}>
                <span className="mk-dot" aria-hidden="true">{state === "done" ? <Check /> : state === "miss" ? <X /> : null}</span>
                {name}
                {state === "done" ? <span className="sr-only"> (done)</span> : null}
              </li>
            );
          })}
        </ol>
        <span className="mk-pct-wrap">
          {running ? <Loader size={30} /> : status === "published" ? <span className="mk-cover" aria-hidden="true"><CourseIcon name={pickCourseIcon(view.blueprint.courseTitle)} size={20} /></span> : null}
          <span className="mk-pct" aria-hidden="true">{pct}%</span>
        </span>
      </div>
      <ProgressBar value={pct / 100} label="How much is done" />
      <div className="mk-meta">
        <span className="cur" role="status">{nowLine(status, generation)}</span>
        <span>{generation ? `${generation.finishedLessons}/${generation.totalLessons} written` : `0/${slots.length} written`}</span>
      </div>
      <ol className="mk-wlist" aria-label="Lessons">
        {slots.map((slot, index) => {
          const done = finished.has(slot.id) || status === "published";
          const now = !done && writingTitle !== null && generation?.lessonNumber === index + 1;
          const miss = slot.id === stoppedAt;
          return (
            <li key={slot.id} className={cn(done && "done", now && "now", miss && "miss")}>
              <span className="mk-dot" aria-hidden="true">{done ? <Check /> : miss ? <X /> : null}</span>
              <span className="min-w-0 flex-1">{slot.title}</span>
              <span className={cn("k-rib", done ? "done" : now ? "making" : miss ? "needs" : "stopped")}>
                {done ? "written" : now ? "writing now" : miss ? "stopped here" : "waiting"}
              </span>
            </li>
          );
        })}
      </ol>
      {running ? (
        <p className="mk-leave">
          <DoorOpen size={16} aria-hidden="true" />
          <span>This usually takes up to half an hour. You can leave: I'll keep writing, and the course will be on Home when it's ready.</span>
        </p>
      ) : null}
    </ThreadCard>
  );
}
