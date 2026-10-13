import { useEffect, useRef, useState } from "react";
import type { SequenceMode } from "@senoy/db/sequence-mode";
import { Button } from "@/components/ui/button.tsx";
import { ChoiceCard } from "@/components/choice-card.tsx";
import type { BlueprintView, CourseRequestRecord } from "@/lib/course-request-types.ts";

/** Statuses this component owns on the Course Request screen. */
export const BLUEPRINT_STATUSES = new Set(["starting_level_confirmed", "blueprint_preparing", "blueprint_review", "generating"]);

/** How often the page checks whether a Blueprint that is being designed is ready. */
const POLL_MS = 3000;

/** Learner-facing names for a slot's Teaching method. */
const METHOD_LABELS: Record<string, string> = { reading: "Reading", quiz: "Quiz" };

type Props = {
  record: CourseRequestRecord;
  onRecord: (record: CourseRequestRecord) => void;
};

/** The Course Blueprint on the Course Request screen: design it, review titles and Lesson goals, pick Sequence mode, Approve. */
export function CourseBlueprintReview({ record, onRecord }: Props) {
  const [view, setView] = useState<BlueprintView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (record.status === "starting_level_confirmed") return;
    let cancelled = false;
    let timer: number | undefined;
    /** Loads the saved Blueprint; while it is being designed, checks again shortly. */
    async function load() {
      try {
        const response = await fetch(`/api/course-requests/${record.id}/blueprint`);
        const body = await response.json() as { courseRequest?: CourseRequestRecord; blueprint?: BlueprintView | null; error?: string };
        if (!response.ok || !body.courseRequest) throw new Error(body.error ?? "Could not load your Course Blueprint.");
        if (cancelled) return;
        if (body.courseRequest.status !== record.status) onRecord(body.courseRequest);
        if (body.courseRequest.status === "blueprint_preparing") {
          timer = window.setTimeout(() => void load(), POLL_MS);
          return;
        }
        setView(body.blueprint ?? null);
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load your Course Blueprint.");
      }
    }
    void load();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [record.id, record.status, onRecord]);

  /** Sends one Blueprint action and applies the returned Request and Blueprint. Returns whether it succeeded. */
  async function send(method: "POST" | "PUT", path: string, payload: unknown = {}) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/course-requests/${record.id}/blueprint${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { courseRequest?: CourseRequestRecord; blueprint?: BlueprintView; error?: string };
      if (!response.ok || !body.courseRequest) throw new Error(body.error ?? "Something went wrong. Please try again.");
      if (!mounted.current) return true;
      if (body.blueprint) setView(body.blueprint);
      if (body.courseRequest.status !== record.status) onRecord(body.courseRequest);
      return true;
    } catch (caught: unknown) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
      return false;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  /** Saves the pick right away so closing and returning keeps it; a failed save restores the previous pick. */
  async function pickSequenceMode(sequenceMode: SequenceMode) {
    if (!view || view.sequenceMode === sequenceMode) return;
    const previous = view;
    setView({ ...view, sequenceMode });
    if (!await send("PUT", "/sequence-mode", { sequenceMode }) && mounted.current) setView(previous);
  }

  const errorLine = error ? <p role="alert" className="mt-4 whitespace-pre-wrap break-words text-sm text-red-400">{error}</p> : null;

  if (record.status === "starting_level_confirmed" || record.status === "blueprint_preparing") {
    const preparing = busy || record.status === "blueprint_preparing";
    return (
      <section className="mt-6" aria-labelledby="blueprint-heading">
        <h2 id="blueprint-heading" className="font-medium">Course Blueprint</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The Blueprint lists the Lessons your Course would have, starting where your check left off. You review it before anything is generated.
        </p>
        {preparing ? (
          <p role="status" className="mt-4 text-sm">Designing your Course Blueprint… This can take a few minutes.</p>
        ) : (
          <Button type="button" className="mt-4" onClick={() => void send("POST", "")}>Design my Course Blueprint</Button>
        )}
        {errorLine}
      </section>
    );
  }

  if (!view) return error ? errorLine : <p role="status" className="mt-6 text-sm text-muted-foreground">Loading your Course Blueprint…</p>;

  const reviewing = record.status === "blueprint_review" && !view.approved;
  return (
    <section className="mt-6" aria-labelledby="blueprint-heading">
      <h2 id="blueprint-heading" className="font-medium">{reviewing ? "Review your Course Blueprint" : "Your approved Course Blueprint"}</h2>
      {reviewing ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Check that each Lesson is relevant to your Learning Goal. The Lessons are written only after you approve.
        </p>
      ) : null}
      <p className="mt-4 text-lg font-semibold">{view.blueprint.courseTitle}</p>
      {view.blueprint.modules.map((module) => (
        <div key={module.title} className="mt-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{module.title}</h3>
          <ol className="mt-2 space-y-3">
            {module.slots.map((slot, index) => (
              <li key={slot.id} className="rounded-lg border border-border px-4 py-3">
                <p className="text-xs text-muted-foreground">Lesson {index + 1} · {METHOD_LABELS[slot.method] ?? slot.method}</p>
                <p className="mt-1 whitespace-pre-wrap break-words font-medium">{slot.title}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{slot.lessonGoal}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}
      {reviewing ? (
        <>
          <fieldset disabled={busy} className="mt-6 space-y-2">
            <legend className="text-sm font-medium">Lesson order</legend>
            <ChoiceCard name="sequence-mode" type="radio" checked={view.sequenceMode === "linear"} onChange={() => void pickSequenceMode("linear")}
              hint="Lessons open in order; a Quiz opens the Lessons after it once you pass it.">
              Linear
            </ChoiceCard>
            <ChoiceCard name="sequence-mode" type="radio" checked={view.sequenceMode === "free_jump"} onChange={() => void pickSequenceMode("free_jump")}
              hint="Every Lesson opens, in any order. Progress still counts a Quiz only once you pass it.">
              Free jump
            </ChoiceCard>
            {view.sequenceMode === "free_jump" ? (
              <p className="text-sm text-muted-foreground">Once you approve with free jump, you can't switch this Course back to linear order.</p>
            ) : null}
          </fieldset>
          <Button type="button" className="mt-6" disabled={busy} onClick={() => void send("POST", "/approve", { sequenceMode: view.sequenceMode })}>
            {busy ? "Approving…" : "Approve"}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-4 text-sm">Lesson order: {view.sequenceMode === "free_jump" ? "free jump" : "linear"}.</p>
          {record.status === "generating" ? (
            <p role="status" className="mt-4 text-sm">Your Course is being generated. It opens in Study once every Lesson is ready; you can close this page.</p>
          ) : null}
        </>
      )}
      {errorLine}
    </section>
  );
}
