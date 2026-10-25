import { Check, ChevronsRight, Home, MessageCircle, Pencil, RefreshCw, Scissors } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { DiagnosticAnswer } from "@senoy/db/starting-level";
import { ThreadEnd, WorkingLine, useAutoStep } from "@/components/make-course/flow.tsx";
import { announceRequest, errorText, requestAction } from "@/components/make-course/request-api.ts";
import { Button } from "@/components/ui/button.tsx";
import { LearnerEcho, NibblesLine } from "@/components/ui/chat-thread.tsx";
import { OptionTiles, type OptionTile } from "@/components/ui/option-tiles.tsx";
import { requestJson } from "@/lib/api.ts";
import { cheer } from "@/lib/cheer.ts";
import type { CourseRequestRecord, DiagnosticView } from "@/lib/course-request-types.ts";

/** Statuses this stage owns; later statuses show it as history. */
export const LEVEL_STATUSES = new Set(["validity_passed", "assessment_preparing", "assessment_failed", "assessment_ready", "awaiting_gap_confirmation"]);

/** Statuses before the check exists, so there is nothing to load. */
const UNPREPARED = new Set(["validity_passed", "assessment_failed"]);

/** How often a check being prepared is looked at again. */
const POLL_MS = 3000;

/** Answers in progress, kept in this browser only until the last one (ADR 0006). */
type SavedProgress = { index: number; answers: Record<string, DiagnosticAnswer> };

/** Browser storage key for one diagnostic attempt. */
function storageKey(attemptId: string) {
  return `starting-level-diagnostic:${attemptId}`;
}

/** Saved progress for an attempt; anything unreadable starts over. */
function readProgress(attemptId: string): SavedProgress {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey(attemptId)) ?? "null") as SavedProgress | null;
    if (saved && typeof saved.index === "number" && saved.answers && typeof saved.answers === "object") return saved;
  } catch {
    // Unreadable progress starts the check over.
  }
  return { index: 0, answers: {} };
}

/** Writes progress for an attempt. */
function writeProgress(attemptId: string, progress: SavedProgress) {
  try {
    window.localStorage.setItem(storageKey(attemptId), JSON.stringify(progress));
  } catch {
    // Storage can be full or blocked; the answers still go up together at the end.
  }
}

/** How an answer reads in the thread. */
function answerText(item: DiagnosticView["items"][number], answer: DiagnosticAnswer | undefined) {
  if (answer === "dont_know") return "I don't know";
  return typeof answer === "number" ? item.options[answer] ?? "" : "";
}

/**
 * The Starting Level check (spec §4.3): it is prepared by itself after Validity passes, then asked one question at a
 * time with I don't know always offered, then where the Course would start, with Looks right or Too easy (or, near
 * the ceiling, a short Course or a new goal). After confirming, it stays above as history.
 */
export function LevelStage({ record }: { record: CourseRequestRecord }) {
  const navigate = useNavigate();
  const [diagnostic, setDiagnostic] = useState<DiagnosticView | null>(null);
  const [progress, setProgress] = useState<SavedProgress>({ index: 0, answers: {} });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"prepare" | "submit" | "confirm" | "widen" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [loadKey, setLoadKey] = useState(0);
  const live = LEVEL_STATUSES.has(record.status);

  useEffect(() => {
    if (UNPREPARED.has(record.status)) return;
    let cancelled = false;
    let timer: number | undefined;
    /** Loads the latest attempt; while it is being prepared, looks again shortly. */
    async function load() {
      try {
        const body = await requestJson<{ courseRequest: CourseRequestRecord; diagnostic: DiagnosticView | null }>(
          `/api/course-requests/${record.id}/diagnostic`, "GET", undefined, "Could not load your questions.");
        if (cancelled) return;
        setLoadError(null);
        if (body.courseRequest.status !== record.status) {
          announceRequest(body.courseRequest);
          return;
        }
        if (body.courseRequest.status === "assessment_preparing") {
          timer = window.setTimeout(() => void load(), POLL_MS);
          return;
        }
        setDiagnostic(body.diagnostic);
        if (body.diagnostic) setProgress(readProgress(body.diagnostic.id));
      } catch (caught: unknown) {
        if (!cancelled) setLoadError(errorText(caught, "Could not load your questions."));
      }
    }
    void load();
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [record.id, record.status, loadKey]);

  /** Prepares the check (a server step; it can take a minute or two). */
  async function prepare() {
    setBusy("prepare");
    setError(null);
    try {
      const reply = await requestAction<{ diagnostic: DiagnosticView | null }>(`/${record.id}/diagnostic`, "POST", {}, "I couldn't prepare your questions. Try again.");
      if (reply.diagnostic) setDiagnostic(reply.diagnostic);
    } catch (caught: unknown) {
      setError(errorText(caught));
      setAttempt((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  useAutoStep(record.status === "validity_passed" && !record.failureReason ? `diagnostic:${record.id}` : null, prepare);

  /** Records one answer and moves on; after the last, sends them all. */
  async function answer(itemId: string, value: DiagnosticAnswer) {
    if (!diagnostic) return;
    const answers = { ...progress.answers, [itemId]: value };
    const last = progress.index >= diagnostic.items.length - 1;
    const next = { index: last ? progress.index : progress.index + 1, answers };
    setProgress(next);
    writeProgress(diagnostic.id, next);
    if (last && diagnostic.items.every((item) => answers[item.id] !== undefined)) await submit(answers);
  }

  /** Sends every answer together, then forgets the browser copy. */
  async function submit(answers: Record<string, DiagnosticAnswer>) {
    if (!diagnostic) return;
    setBusy("submit");
    setError(null);
    try {
      const reply = await requestAction<{ diagnostic: DiagnosticView }>(`/${record.id}/diagnostic/answers`, "POST", { answers }, "I couldn't send your answers. They're kept here; try again.");
      setDiagnostic(reply.diagnostic);
      window.localStorage.removeItem(storageKey(diagnostic.id));
    } catch (caught: unknown) {
      setError(errorText(caught));
      setAttempt((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  /** One gap action: confirm, too easy, or change goal. */
  async function gapAction(path: "/confirm" | "/too-easy" | "/change-goal", body: object = {}) {
    setBusy(path === "/too-easy" ? "widen" : "confirm");
    setError(null);
    try {
      const reply = await requestAction<{ diagnostic?: DiagnosticView }>(`/${record.id}/diagnostic${path}`, "POST", body, "Something went wrong. Please try again.");
      if (path === "/change-goal") navigate(`/course-requests/${reply.courseRequest.id}`);
      else if (reply.diagnostic) setDiagnostic(reply.diagnostic);
    } catch (caught: unknown) {
      setError(errorText(caught));
      setAttempt((n) => n + 1);
    } finally {
      setBusy(null);
    }
  }

  const intro = (
    <>
      <NibblesLine mood={live ? "think" : "idle"}>A few quick questions so I don't start too easy.</NibblesLine>
      <NibblesLine continued>
        <span className="mk-faint">It's not a quiz or a grade, just a quick look at where to start. If you're not reasonably sure, “I don't know” is the right answer.</span>
      </NibblesLine>
    </>
  );
  const errorLine = error ? <NibblesLine mood="think"><span role="alert">{error}</span></NibblesLine> : null;
  const retryTiles = (label: string, onRetry: () => void | Promise<void>, retryLabel = "Try again") => (
    <OptionTiles key={`${record.status}-t0`}
      label={label}
      resetKey={`${attempt}-${record.status}`}
      options={[
        { id: "retry", label: retryLabel, icon: <RefreshCw />, tone: "primary" },
        { id: "home", label: "Back to Home", description: "It's saved; come back anytime", icon: <Home />, tone: "quiet" },
      ]}
      onPick={(option) => (option.id === "retry" ? onRetry() : navigate("/"))}
    />
  );

  if (record.status === "validity_passed" || record.status === "assessment_preparing") {
    const working = busy === "prepare" || record.status === "assessment_preparing";
    const failure = error ?? (!working ? record.failureReason : null);
    return (
      <>
        {intro}
        {working ? <NibblesLine mood="think"><WorkingLine>Writing your questions… This can take a minute or two.</WorkingLine></NibblesLine> : null}
        {!working && failure ? (
          <>
            <NibblesLine mood="think"><span role="alert">{failure}</span></NibblesLine>
            {retryTiles("Preparing didn't finish", prepare)}
          </>
        ) : null}
        <ThreadEnd watch={`${record.status}|${working}|${failure}`} />
      </>
    );
  }

  if (record.status === "assessment_failed") {
    return (
      <>
        {intro}
        <NibblesLine mood="think"><span role="alert">{error ?? record.failureReason ?? "I couldn't write questions for this goal that passed my checks."}</span></NibblesLine>
        {busy === "prepare"
          ? <NibblesLine mood="think"><WorkingLine>Writing a fresh set… This can take a minute or two.</WorkingLine></NibblesLine>
          : retryTiles("The questions didn't pass", prepare, "Retry diagnostic")}
        <ThreadEnd watch={`${busy}|${error}`} />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        {live ? intro : null}
        <NibblesLine mood="think"><span role="alert">{loadError}</span></NibblesLine>
        {retryTiles("Couldn't load", () => setLoadKey((n) => n + 1))}
      </>
    );
  }
  if (!diagnostic) return live ? <>{intro}<NibblesLine typing>…</NibblesLine></> : null;

  const total = diagnostic.items.length;
  if (record.status === "assessment_ready") {
    const index = Math.min(progress.index, total - 1);
    const item = diagnostic.items[index]!;
    const allAnswered = diagnostic.items.every((candidate) => progress.answers[candidate.id] !== undefined);
    const sending = busy === "submit" || (error !== null && allAnswered && index === total - 1);
    const options: OptionTile<DiagnosticAnswer>[] = [
      ...item.options.map((option, optionIndex) => ({ id: `o${optionIndex}`, label: option, value: optionIndex as DiagnosticAnswer })),
      { id: "dont_know", label: "I don't know", description: "A fine answer", unsure: true, value: "dont_know" as const },
    ];
    return (
      <>
        {intro}
        {diagnostic.items.slice(0, index).map((past, pastIndex) => (
          <QuestionHistory key={past.id} n={pastIndex + 1} total={total} stem={past.stem} answer={answerText(past, progress.answers[past.id])} />
        ))}
        {sending ? (
          <>
            <QuestionHistory n={index + 1} total={total} stem={item.stem} answer={answerText(item, progress.answers[item.id])} />
            {busy === "submit" ? <NibblesLine mood="think"><WorkingLine>Thanks. Working out where to start…</WorkingLine></NibblesLine> : null}
            {errorLine}
            {error ? retryTiles("Sending didn't finish", () => submit(progress.answers)) : null}
          </>
        ) : (
          <>
            <NibblesLine typing delayMs={380} key={item.id}>
              <span className="mk-qhead"><span className="mk-qnum">{index + 1} of {total}</span><b>{item.stem}</b></span>
            </NibblesLine>
            <OptionTiles
              key={item.id}
              label={`Question ${index + 1} of ${total}`}
              cols={1}
              options={options}
              onPick={(option) => answer(item.id, option.value!)}
            />
            {index > 0 ? (
              <div className="mk-back">
                <Button variant="link" size="sm" onClick={() => {
                  const back = { ...progress, index: index - 1 };
                  setProgress(back);
                  writeProgress(diagnostic.id, back);
                }}>Change my last answer</Button>
              </div>
            ) : null}
          </>
        )}
        <ThreadEnd watch={`${index}|${busy}|${error}`} />
      </>
    );
  }

  const result = diagnostic.result;
  if (!result) return null;
  const ceiling = result.extremity === "ceiling";
  const gapLine = (
    <>
      <NibblesLine>Thanks. {result.remainingGapStatement}</NibblesLine>
      <NibblesLine continued>
        <span className="mk-faint">This is a small sample, not a certificate. {result.coverageNote} Quizzes later in the course don't change where it starts.</span>
      </NibblesLine>
    </>
  );

  if (!live) {
    // History: where the Course starts, and what the Learner chose.
    return (
      <>
        {intro}
        {gapLine}
        <LearnerEcho>{diagnostic.confirmation === "short_course" ? "Make me a short course" : "Looks right"}</LearnerEcho>
      </>
    );
  }

  const tiles: OptionTile[] = ceiling
    ? [
      { id: "short", label: "Make me a short course", description: "A few lessons toward the goal", icon: <Scissors />, tone: "primary" },
      { id: "goal", label: "Change my goal", description: "Aim for something harder", icon: <Pencil /> },
    ]
    : [{ id: "right", label: "Looks right", description: "Start there", icon: <Check />, tone: "primary" }];
  if (result.canExpandGap) tiles.push({ id: "easy", label: "Too easy, cover more", description: "Start a little earlier", icon: <ChevronsRight /> });

  return (
    <>
      {intro}
      {diagnostic.items.map((item, itemIndex) => (
        <QuestionHistory key={item.id} n={itemIndex + 1} total={total} stem={item.stem} answer="" compact />
      ))}
      {gapLine}
      {ceiling ? <NibblesLine continued>You answered nearly everything. I can still make a short course toward your goal, or you can set a harder one.</NibblesLine> : null}
      {busy === "widen" ? <NibblesLine mood="think"><WorkingLine>Covering a bit more…</WorkingLine></NibblesLine> : (
        <OptionTiles key={`${record.status}-t1`}
          label="Where your course starts"
          resetKey={`${result.remainingGapStatement}-${attempt}`}
          cols={tiles.length === 3 ? 3 : 2}
          options={tiles}
          onPick={(option) => {
            if (option.id === "easy") return gapAction("/too-easy");
            if (option.id === "goal") return gapAction("/change-goal");
            const el = document.activeElement;
            cheer(el, "starting point set");
            return gapAction("/confirm", { choice: option.id === "short" ? "short_course" : "looks_right" });
          }}
        />
      )}
      {errorLine}
      <ThreadEnd watch={`${result.remainingGapStatement}|${busy}|${error}`} />
    </>
  );
}

/** One answered question, as history. `compact` collapses the set once the Learner has seen where to start. */
function QuestionHistory({ n, total, stem, answer, compact = false }: { n: number; total: number; stem: string; answer: string; compact?: boolean }) {
  if (compact) return n === total ? <LearnerEcho><span className="mk-faint"><MessageCircle className="mr-1 inline size-3.5" aria-hidden="true" />{total} questions answered</span></LearnerEcho> : null;
  return (
    <>
      <NibblesLine continued={n > 1}>
        <span className="mk-qhead"><span className="mk-qnum">{n} of {total}</span><span className="mk-faint">{stem}</span></span>
      </NibblesLine>
      <LearnerEcho>{answer}</LearnerEcho>
    </>
  );
}
