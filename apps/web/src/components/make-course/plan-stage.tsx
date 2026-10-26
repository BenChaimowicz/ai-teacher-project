import { Check, Home, Lightbulb, Pencil, Play, RefreshCw, SkipForward, Sparkles, Square, Target, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { IrrelevantReason } from "@senoy/db/blueprint";
import type { SequenceMode } from "@senoy/db/sequence-mode";
import { ThreadEnd, WorkingLine, useAutoStep } from "@/components/make-course/flow.tsx";
import { MakingCard } from "@/components/make-course/making-card.tsx";
import { PlanCard, sequenceModeName } from "@/components/make-course/plan-card.tsx";
import { announceRequest, errorText, requestAction } from "@/components/make-course/request-api.ts";
import { LearnerEcho, CompanionLine, ThreadCard } from "@/components/ui/chat-thread.tsx";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import { useToast } from "@/components/ui/toast.tsx";
import { requestJson } from "@/lib/api.ts";
import { pickCourseIcon } from "@/lib/brand-marks.ts";
import { confettiAt } from "@/lib/cheer.ts";
import type { BlueprintView, CourseRequestRecord, GenerationView } from "@/lib/course-request-types.ts";

/** Statuses this stage owns: the plan, then making the Course. */
export const PLAN_STATUSES = new Set([
  "starting_level_confirmed", "blueprint_preparing", "blueprint_review", "generating", "published", "generation_failed", "generation_cancelled",
]);

/** Statuses that move on by themselves, so the stage looks again. */
const WORKING = new Set(["blueprint_preparing", "generating"]);

/** How often a plan being designed, or a Course being written, is looked at again. */
const POLL_MS = 3000;

/** What the Blueprint route returns. */
type BlueprintReply = {
  courseRequest: CourseRequestRecord;
  blueprint: BlueprintView | null;
  course?: { href: string | null } | null;
  generation?: GenerationView | null;
};

/**
 * The plan and the making of the Course: the plan is designed by itself once the starting point is confirmed; the
 * Learner unticks what isn't useful (the plan is redone around it) or makes the Course; then the waiting screen,
 * Stop / Resume, Try again, and the finished Course.
 */
export function PlanStage({ record }: { record: CourseRequestRecord }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [view, setView] = useState<BlueprintView | null>(null);
  const [courseHref, setCourseHref] = useState<string | null>(null);
  const [generation, setGeneration] = useState<GenerationView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [askWhy, setAskWhy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [loadKey, setLoadKey] = useState(0);
  const firstStatus = useRef(record.status);
  const readyCard = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (record.status === "starting_level_confirmed") return;
    let cancelled = false;
    let timer: number | undefined;
    /** Loads the plan and the job; while either is being worked on, looks again shortly. */
    async function load() {
      try {
        const body = await requestJson<BlueprintReply>(`/api/course-requests/${record.id}/blueprint`, "GET", undefined, "Could not load your plan.");
        if (cancelled) return;
        setLoadError(null);
        setView(body.blueprint);
        setCourseHref(body.course?.href ?? null);
        setGeneration(body.generation ?? null);
        if (body.courseRequest.status !== record.status) {
          announceRequest(body.courseRequest);
          return;
        }
        if (WORKING.has(body.courseRequest.status)) timer = window.setTimeout(() => void load(), POLL_MS);
      } catch (caught: unknown) {
        if (cancelled) return;
        setLoadError(errorText(caught, "Could not load your plan."));
        // Keep looking while the server is working; a blip should not strand the waiting screen.
        if (WORKING.has(record.status)) timer = window.setTimeout(() => void load(), POLL_MS * 2);
      }
    }
    void load();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [record.id, record.status, loadKey]);

  useEffect(() => {
    // A new plan arrives with every Lesson ticked again.
    setUnticked(new Set());
    setAskWhy(false);
  }, [view?.blueprint.courseTitle, record.status]);

  /**
   * Sends one plan or making action and applies what it returns.
   * @returns Whether it worked
   */
  async function send(method: "POST" | "PUT", path: string, body: object, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      const reply = await requestAction<Partial<BlueprintReply>>(`/${record.id}${path}`, method, body, fallback);
      if (reply.blueprint) setView(reply.blueprint);
      if (reply.generation !== undefined) setGeneration(reply.generation ?? null);
      return true;
    } catch (caught: unknown) {
      setError(errorText(caught));
      setAttempt((n) => n + 1);
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Runs an action for a tile; the tile unlocks through `attempt` when it fails. */
  const run = (method: "POST" | "PUT", path: string, body: object, fallback: string) => send(method, path, body, fallback).then(() => undefined);
  const design = () => run("POST", "/blueprint", {}, "I couldn't start the plan. Try again.");
  // Designing the plan is a server step the Learner does not trigger (spec §3).
  useAutoStep(record.status === "starting_level_confirmed" && !record.failureReason ? `blueprint:${record.id}` : null, design);

  /** Saves Step by step / Jump around right away; a failed save puts the old pick back. */
  async function pickSequenceMode(mode: SequenceMode) {
    if (!view || view.sequenceMode === mode) return;
    const previous = view;
    setView({ ...view, sequenceMode: mode });
    if (!await send("PUT", "/blueprint/sequence-mode", { sequenceMode: mode }, "Couldn't save that. Try again.")) setView(previous);
  }

  /** Marks the unticked Lessons not relevant; the worker redoes the plan around them (spec §4.4). */
  async function redo(reason: IrrelevantReason | null) {
    await send("POST", "/blueprint/revise", { irrelevantSlotIds: [...unticked], reason }, "I couldn't redo the plan. Try again.");
  }

  const isPublished = record.status === "published";
  useEffect(() => {
    if (!isPublished || firstStatus.current === "published" || !view) return;
    const timer = window.setTimeout(() => {
      if (readyCard.current) confettiAt(readyCard.current, { count: 70 });
      toast({ title: "Course ready", body: view.blueprint.courseTitle, tone: "celebrate" });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [isPublished, view, toast]);

  const errorLine = error ? <CompanionLine mood="think"><span role="alert">{error}</span></CompanionLine> : null;
  const homeTile: OptionTile = { id: "home", label: "Back to Home", description: "It's saved; come back anytime", icon: <Home />, tone: "quiet" };

  // ---------- designing the plan ----------
  if (record.status === "starting_level_confirmed") {
    const failure = error ?? (busy ? null : record.failureReason);
    return (
      <>
        {failure ? (
          <>
            <CompanionLine mood="think"><span role="alert">{failure}</span></CompanionLine>
            <OptionTiles key={`${record.status}-t0`}
              label="The plan didn't finish"
              resetKey={attempt}
              options={[{ id: "retry", label: "Try again", description: "A fresh design", icon: <RefreshCw />, tone: "primary" }, homeTile]}
              onPick={(option) => (option.id === "retry" ? design() : navigate("/"))}
            />
          </>
        ) : (
          <CompanionLine mood="think"><WorkingLine>Putting a plan together…</WorkingLine></CompanionLine>
        )}
        <ThreadEnd watch={`${failure}|${busy}`} />
      </>
    );
  }

  if (record.status === "blueprint_preparing") {
    return (
      <>
        {view ? (
          <>
            <CompanionLine mood="think"><WorkingLine>Redoing the plan without those lessons… This takes a minute or two.</WorkingLine></CompanionLine>
            <PlanCard view={view} subject={record.subject} className="mk-dim" />
          </>
        ) : (
          <CompanionLine mood="think">
            <WorkingLine>Putting a plan together. This takes a minute or two; you can leave and come back.</WorkingLine>
          </CompanionLine>
        )}
        {loadError ? <CompanionLine continued><span className="mk-faint">{loadError} Still trying…</span></CompanionLine> : null}
        <ThreadEnd watch={`${record.status}|${Boolean(view)}`} />
      </>
    );
  }

  if (!view) {
    if (!loadError) return <CompanionLine typing>…</CompanionLine>;
    return (
      <>
        <CompanionLine mood="think"><span role="alert">{loadError}</span></CompanionLine>
        <OptionTiles key={`${record.status}-t1`} label="Couldn't load" options={[{ id: "retry", label: "Try again", icon: <RefreshCw />, tone: "primary" }, homeTile]}
          onPick={(option) => (option.id === "retry" ? setLoadKey((n) => n + 1) : navigate("/"))} />
      </>
    );
  }

  // ---------- reviewing the plan ----------
  if (record.status === "blueprint_review" && !view.approved) {
    const slotCount = view.blueprint.modules.reduce((sum, module) => sum + module.slots.length, 0);
    const allOut = unticked.size >= slotCount;
    const reviewTiles: OptionTile[] = unticked.size === 0
      ? [{ id: "make", label: "Make my course", description: "Up to half an hour; you can leave while I write", icon: <Sparkles />, tone: "primary" }]
      : [
        {
          id: "redo", label: "Redo the plan without these", icon: <RefreshCw />, tone: "primary", disabled: allOut,
          description: allOut ? "Keep at least one lesson" : `${unticked.size} out; I'll adjust the rest`,
        },
        { id: "keep", label: "Keep everything", description: "Tick them all again", icon: <Undo2 />, tone: "quiet" },
      ];
    return (
      <>
        {record.failureReason ? <CompanionLine mood="think"><span role="alert">{record.failureReason}</span></CompanionLine> : null}
        <CompanionLine>Here's a plan. Your call.</CompanionLine>
        <ScopeNote record={record} />
        <PlanCard
          view={view}
          subject={record.subject}
          unticked={unticked}
          busy={busy || askWhy}
          onToggle={(slotId) => setUnticked((current) => {
            const next = new Set(current);
            if (next.has(slotId)) next.delete(slotId);
            else next.add(slotId);
            return next;
          })}
          onSequenceMode={(mode) => void pickSequenceMode(mode)}
        />
        {askWhy ? (
          <>
            <LearnerEcho>Redo the plan without these</LearnerEcho>
            <CompanionLine typing delayMs={360}>Sure. Why skip them? <span className="mk-faint">Optional, but it helps me redo it.</span></CompanionLine>
            <OptionTiles key={`${record.status}-t2`}
              label="Why skip them?"
              resetKey={attempt}
              cols={3}
              options={[
                { id: "already_know", label: "I know these already", icon: <Check /> },
                { id: "not_my_goal", label: "Not what I'm after", icon: <Target /> },
                { id: "skip", label: "Just skip them", icon: <SkipForward />, tone: "quiet" },
              ]}
              onPick={(option) => redo(option.id === "skip" ? null : option.id as IrrelevantReason)}
            />
          </>
        ) : (
          <OptionTiles key={`${record.status}-t3`}
            label="Your plan"
            resetKey={`${unticked.size === 0}-${attempt}`}
            cols={reviewTiles.length === 1 ? 1 : 2}
            options={reviewTiles}
            onPick={(option) => {
              if (option.id === "keep") {
                setUnticked(new Set());
                return;
              }
              if (option.id === "redo") {
                setAskWhy(true);
                return;
              }
              return run("POST", "/blueprint/approve", { sequenceMode: view.sequenceMode }, "I couldn't start making it. Try again.");
            }}
          />
        )}
        {errorLine}
        <ThreadEnd watch={`${askWhy}|${busy}|${error}|${unticked.size === 0}`} />
      </>
    );
  }

  // ---------- making the Course ----------
  const total = generation?.totalLessons ?? view.blueprint.modules.reduce((sum, module) => sum + module.slots.length, 0);
  const history = (
    <>
      <CompanionLine>Here's the plan: <b>{view.blueprint.courseTitle}</b>. <span className="mk-faint">{total} lessons · {sequenceModeName(view.sequenceMode).toLowerCase()}</span></CompanionLine>
      <LearnerEcho>Make my course</LearnerEcho>
    </>
  );

  if (record.status === "generating") {
    return (
      <>
        {history}
        <CompanionLine mood="think">On it. You can leave; I'll keep going.</CompanionLine>
        <MakingCard view={view} generation={generation} status={record.status} />
        <OptionTiles key={`${record.status}-t4`}
          label="While it's being made"
          resetKey={attempt}
          options={[
            { id: "home", label: "Back to Home", description: "It keeps going without you", icon: <Home />, tone: "quiet" },
            { id: "stop", label: "Stop making this course", description: "Keeps what's written so far", icon: <Square />, tone: "quiet" },
          ]}
          onPick={(option) => {
            if (option.id === "home") {
              toast({ title: "Still writing", body: "Your course keeps going. It'll be on Home." });
              navigate("/");
              return;
            }
            return run("POST", "/generation/cancel", {}, "I couldn't stop it. Try again.");
          }}
        />
        {errorLine}
        <ThreadEnd watch={`${record.status}|${error}`} />
      </>
    );
  }

  if (record.status === "generation_cancelled") {
    const kept = generation?.finishedLessons ?? 0;
    return (
      <>
        {history}
        <CompanionLine>
          Stopped. {kept ? `The ${kept} of ${generation?.totalLessons ?? total} lessons already written are kept, and Resume picks up from the next one.` : "Resume starts again from the first lesson."}
          {" "}<span className="mk-faint">It won't restart by itself.</span>
        </CompanionLine>
        <MakingCard view={view} generation={generation} status={record.status} />
        <OptionTiles key={`${record.status}-t5`}
          label="Stopped"
          resetKey={attempt}
          options={[{ id: "resume", label: "Resume", description: "Carry on writing", icon: <Play />, tone: "primary" }, homeTile]}
          onPick={(option) => (option.id === "home" ? navigate("/") : run("POST", "/generation/resume", {}, "I couldn't resume it. Try again."))}
        />
        {errorLine}
        <ThreadEnd watch={`${record.status}|${error}`} />
      </>
    );
  }

  if (record.status === "generation_failed") {
    // Retry needs a failed or interrupted job; a plan that can't reach the goal needs a new start instead (spec §5.1).
    const retryable = generation?.status === "failed" || generation?.status === "interrupted";
    const tiles: OptionTile[] = [
      ...(retryable ? [{ id: "retry", label: "Retry", description: "Keeps what's written", icon: <RefreshCw />, tone: "primary" as const }] : []),
      { id: "revise", label: "Revise request", description: "Start again from the topic", icon: <Pencil />, tone: retryable ? "default" : "primary" },
      homeTile,
    ];
    return (
      <>
        {history}
        <CompanionLine mood="think"><span role="alert">{record.failureReason ?? "I couldn't finish making this course."}</span></CompanionLine>
        <MakingCard view={view} generation={generation} status={record.status} failureReason={record.failureReason} />
        <OptionTiles key={`${record.status}-t6`}
          label="Couldn't finish"
          resetKey={attempt}
          cols={tiles.length === 3 ? 3 : 2}
          options={tiles}
          onPick={async (option) => {
            if (option.id === "home") return navigate("/");
            if (option.id === "retry") return run("POST", "/generation/retry", {}, "I couldn't try again. Try once more.");
            try {
              const { courseRequest } = await requestAction(`/${record.id}/revise`, "POST", {}, "Could not start a revised request. This one is unchanged.");
              navigate(`/course-requests/${courseRequest.id}`);
            } catch (caught: unknown) {
              setError(errorText(caught));
              setAttempt((n) => n + 1);
            }
          }}
        />
        {errorLine}
        <ThreadEnd watch={`${record.status}|${error}`} />
      </>
    );
  }

  // Published.
  const first = view.blueprint.modules[0]?.slots[0];
  return (
    <>
      {history}
      <CompanionLine mood="cheer">Your course is ready.</CompanionLine>
      <div ref={readyCard}>
        <ThreadCard>
          <div className="mk-ready">
            <span className="mk-cover big" aria-hidden="true"><CourseIcon name={pickCourseIcon(`${view.blueprint.courseTitle} ${record.subject}`)} size={36} /></span>
            <div className="min-w-0">
              <h4>{view.blueprint.courseTitle}</h4>
              <p className="sub">{total} lessons · {sequenceModeName(view.sequenceMode).toLowerCase()} · on Home with your other courses</p>
            </div>
          </div>
        </ThreadCard>
      </div>
      <OptionTiles key={`${record.status}-t7`}
        label="Your course is ready"
        options={[
          { id: "start", label: "Start lesson 1", description: first?.title, icon: <Lightbulb />, tone: "primary", disabled: !courseHref },
          { id: "home", label: "Back to Home", description: "It'll be waiting", icon: <Home />, tone: "quiet" },
        ]}
        onPick={(option) => navigate(option.id === "start" && courseHref ? courseHref : "/")}
      />
      <ThreadEnd watch={record.status} />
    </>
  );
}

/**
 * One line under the plan's header saying the scope the Learner settled before the Starting Level check (SEN-90), so
 * they can see the plan kept to it. Nothing for a precise goal.
 */
function ScopeNote({ record }: { record: CourseRequestRecord }) {
  const focus = record.focus;
  if (focus?.outcome === "broad_overview") return <CompanionLine continued><span className="mk-faint">A broad overview, as you asked.</span></CompanionLine>;
  if (focus?.outcome !== "focused" || !focus.scope) return null;
  const { inScope, outOfScope } = focus.scope;
  return (
    <CompanionLine continued>
      <span className="mk-faint">
        Focused on: {inScope.join(", ")}
        {outOfScope.length ? <> · Leaving out: {outOfScope.join(", ")}</> : null}
      </span>
    </CompanionLine>
  );
}
