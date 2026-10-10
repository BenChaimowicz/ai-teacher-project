import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DiagnosticAnswer } from "@senoy/db/starting-level";
import { Button } from "@/components/ui/button.tsx";
import { ChoiceCard } from "@/components/choice-card.tsx";
import type { CourseRequestRecord, DiagnosticView } from "@/lib/course-request-types.ts";

/** Statuses this component owns on the Course Request screen. */
export const DIAGNOSTIC_STATUSES = new Set([
  "validity_passed", "assessment_preparing", "assessment_ready", "awaiting_gap_confirmation", "starting_level_confirmed",
]);

/** How often the page checks whether a check that is being prepared is ready. */
const POLL_MS = 3000;

/** Answers in progress, kept in this browser only until Finish (ADR 0006). */
type SavedProgress = { index: number; answers: Record<string, DiagnosticAnswer> };

/** Browser storage key for one diagnostic attempt. */
function storageKey(attemptId: string) {
  return `starting-level-diagnostic:${attemptId}`;
}

/** Reads saved progress for an attempt, ignoring anything unreadable. */
function readProgress(attemptId: string): SavedProgress {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(attemptId)) ?? "null") as SavedProgress | null;
    if (saved && typeof saved.index === "number" && saved.answers && typeof saved.answers === "object") return saved;
  } catch {
    // Unreadable progress starts the check over.
  }
  return { index: 0, answers: {} };
}

/** Course Guide copy shown before the items (spec §4.3). */
function HonestyCopy() {
  return (
    <p className="text-sm text-muted-foreground">
      This is a short check of knowledge related to your Learning Goal so we can start the Course in the right place.
      It is not a Quiz, not a grade, and not a test of intelligence. If you are not reasonably sure, choose <strong>I don’t know</strong>.
      You will review the Course Blueprint before anything is generated.
    </p>
  );
}

type Props = {
  record: CourseRequestRecord;
  onRecord: (record: CourseRequestRecord) => void;
};

/** The Starting Level diagnostic on the Course Request screen: prepare, answer one item per screen, confirm the gap. */
export function StartingLevelDiagnostic({ record, onRecord }: Props) {
  const navigate = useNavigate();
  const [diagnostic, setDiagnostic] = useState<DiagnosticView | null>(null);
  const [progress, setProgress] = useState<SavedProgress>({ index: 0, answers: {} });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (record.status === "validity_passed") return;
    let cancelled = false;
    let timer: number | undefined;
    /** Loads the latest attempt; while it is being prepared, checks again shortly. */
    async function load() {
      try {
        const response = await fetch(`/api/course-requests/${record.id}/diagnostic`);
        const body = await response.json() as { courseRequest?: CourseRequestRecord; diagnostic?: DiagnosticView | null; error?: string };
        if (!response.ok || !body.courseRequest) throw new Error(body.error ?? "Could not load your Starting Level check.");
        if (cancelled) return;
        if (body.courseRequest.status !== record.status) onRecord(body.courseRequest);
        if (body.courseRequest.status === "assessment_preparing") {
          timer = window.setTimeout(() => void load(), POLL_MS);
          return;
        }
        setDiagnostic(body.diagnostic ?? null);
        if (body.diagnostic) setProgress(readProgress(body.diagnostic.id));
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load your Starting Level check.");
      }
    }
    void load();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [record.id, record.status, onRecord]);

  /** Posts one diagnostic action and applies the returned Request and attempt. */
  async function post(path: string, payload: unknown = {}) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/course-requests/${record.id}/diagnostic${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { courseRequest?: CourseRequestRecord; diagnostic?: DiagnosticView; error?: string };
      if (!response.ok || !body.courseRequest) throw new Error(body.error ?? "Something went wrong. Please try again.");
      if (!mounted.current) return null;
      if (body.diagnostic) setDiagnostic(body.diagnostic);
      return body.courseRequest;
    } catch (caught: unknown) {
      if (mounted.current) setError(caught instanceof Error ? caught.message : "Something went wrong. Please try again.");
      return null;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  /** Records one answer in this browser and moves to the next item. */
  function choose(itemId: string, answer: DiagnosticAnswer) {
    if (!diagnostic) return;
    const next = { ...progress, answers: { ...progress.answers, [itemId]: answer } };
    setProgress(next);
    window.localStorage.setItem(storageKey(diagnostic.id), JSON.stringify(next));
  }

  /** Moves between items, remembering the position in this browser. */
  function goTo(index: number) {
    if (!diagnostic) return;
    const next = { ...progress, index };
    setProgress(next);
    window.localStorage.setItem(storageKey(diagnostic.id), JSON.stringify(next));
  }

  /** Sends all eight answers together, then forgets the browser copy. */
  async function finish() {
    if (!diagnostic) return;
    const updated = await post("/answers", { answers: progress.answers });
    if (!updated) return;
    window.localStorage.removeItem(storageKey(diagnostic.id));
    onRecord(updated);
  }

  const errorLine = error ? <p role="alert" className="mt-4 whitespace-pre-wrap break-words text-sm text-red-400">{error}</p> : null;

  if (record.status === "validity_passed" || record.status === "assessment_preparing") {
    const preparing = busy || record.status === "assessment_preparing";
    return (
      <section className="mt-6" aria-labelledby="diagnostic-heading">
        <h2 id="diagnostic-heading" className="font-medium">Starting Level check</h2>
        <div className="mt-2"><HonestyCopy /></div>
        {preparing ? (
          <p role="status" className="mt-4 text-sm">Preparing your check… This can take a few minutes.</p>
        ) : (
          <Button type="button" className="mt-4" onClick={async () => {
            const updated = await post("");
            if (updated) onRecord(updated);
          }}>Start the check</Button>
        )}
        {errorLine}
      </section>
    );
  }

  if (!diagnostic) return error ? errorLine : <p role="status" className="mt-6 text-sm text-muted-foreground">Loading your check…</p>;

  if (record.status === "assessment_ready") {
    const total = diagnostic.items.length;
    const index = Math.min(progress.index, total - 1);
    const item = diagnostic.items[index]!;
    const selected = progress.answers[item.id];
    const last = index === total - 1;
    return (
      <section className="mt-6" aria-labelledby="diagnostic-heading">
        <h2 id="diagnostic-heading" className="font-medium">Starting Level check</h2>
        <div className="mt-2"><HonestyCopy /></div>
        <fieldset disabled={busy} className="mt-6 space-y-3">
          <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Question {index + 1} of {total}</legend>
          <p className="whitespace-pre-wrap break-words font-medium">{item.stem}</p>
          {item.options.map((option, optionIndex) => (
            <ChoiceCard key={optionIndex} name={item.id} type="radio" checked={selected === optionIndex} onChange={() => choose(item.id, optionIndex)}>
              {option}
            </ChoiceCard>
          ))}
          <div className="pt-1">
            <ChoiceCard name={item.id} type="radio" checked={selected === "dont_know"} onChange={() => choose(item.id, "dont_know")}>
              I don’t know
            </ChoiceCard>
          </div>
          <div className="flex gap-3 pt-3">
            <Button type="button" variant="outline" disabled={index === 0} onClick={() => goTo(index - 1)}>Back</Button>
            {last ? (
              <Button type="button" disabled={selected === undefined || diagnostic.items.some((candidate) => progress.answers[candidate.id] === undefined)} onClick={() => void finish()}>
                {busy ? "Finishing…" : "Finish"}
              </Button>
            ) : (
              <Button type="button" disabled={selected === undefined} onClick={() => goTo(index + 1)}>Next</Button>
            )}
          </div>
        </fieldset>
        {errorLine}
      </section>
    );
  }

  const result = diagnostic.result;
  if (!result) return null;
  const ceiling = result.extremity === "ceiling";
  return (
    <section className="mt-6" aria-labelledby="diagnostic-heading">
      <h2 id="diagnostic-heading" className="font-medium">Where your Course would start</h2>
      <p className="mt-2 whitespace-pre-wrap break-words">{result.remainingGapStatement}</p>
      <p className="mt-3 text-sm text-muted-foreground">
        This is a small sample, not a certificate that you can already do the full goal in the real world. {result.coverageNote} Quizzes later in the Course do not change this starting point.
      </p>
      {record.status === "starting_level_confirmed" ? (
        <p role="status" className="mt-4 text-sm">Your starting point is confirmed. The Course Blueprint comes next.</p>
      ) : (
        <>
          {ceiling ? <p className="mt-4 text-sm">You answered nearly everything. We can still build a short Course toward your goal, or you can set a harder goal.</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {ceiling ? (
              <>
                <Button type="button" disabled={busy} onClick={async () => {
                  const updated = await post("/confirm", { choice: "short_course" });
                  if (updated) onRecord(updated);
                }}>Make me a short Course</Button>
                <Button type="button" variant="outline" disabled={busy} onClick={async () => {
                  const draft = await post("/change-goal");
                  if (draft) navigate(`/course-requests/${draft.id}`);
                }}>Change my goal</Button>
              </>
            ) : (
              <Button type="button" disabled={busy} onClick={async () => {
                const updated = await post("/confirm", { choice: "looks_right" });
                if (updated) onRecord(updated);
              }}>Looks right</Button>
            )}
            {result.canExpandGap ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void post("/too-easy")}>
                {busy ? "Updating…" : "Too easy — cover more"}
              </Button>
            ) : null}
          </div>
        </>
      )}
      {errorLine}
    </section>
  );
}
