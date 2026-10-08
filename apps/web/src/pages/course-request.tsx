import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { DIAGNOSTIC_STATUSES, StartingLevelDiagnostic } from "@/components/starting-level-diagnostic.tsx";
import { courseRequestStatusLabel, type CourseRequestRecord } from "@/lib/course-request-types.ts";

/** Opens a persisted Request for explicit validity review, clarification, or revision. */
export function CourseRequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const route = useMemo(() => ({ requestId }), [requestId]);
  const currentRoute = useRef(route);
  currentRoute.current = route;
  const mounted = useRef(false);
  const submitting = useRef<object | null>(null);
  const [record, setRecord] = useState<CourseRequestRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState("");
  const [subject, setSubject] = useState("");
  const [learningGoal, setLearningGoal] = useState("");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setRecord(null);
    setError(null);
    setBusy(false);
    submitting.current = null;
    /** Loads only the saved record; opening this page never invokes validity review. */
    async function load() {
      try {
        const response = await fetch(`/api/course-requests/${requestId}`, { signal: controller.signal });
        const body = await response.json() as { courseRequest?: CourseRequestRecord; error?: string };
        if (!response.ok || !body.courseRequest) throw new Error(body.error ?? "Could not load Course Request.");
        if (!cancelled && currentRoute.current === route) {
          setRecord(body.courseRequest);
          setSubject(body.courseRequest.subject);
          setLearningGoal(body.courseRequest.learningGoal);
          setAnswer(body.courseRequest.clarification?.answer ?? "");
        }
      } catch (caught: unknown) {
        if (!cancelled && currentRoute.current === route) setError(caught instanceof Error ? caught.message : "Could not load Course Request.");
      }
    }
    void load();
    return () => { cancelled = true; controller.abort(); };
  }, [requestId, route, retry]);

  /** Sends a single explicit action, preserving the current record and input if it fails. */
  async function act(action: "validity" | "revise" | "save", event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (submitting.current || !record || record.id !== requestId) return;
    if (action === "save" && (!subject.trim() || !learningGoal.trim())) {
      setError("Enter a subject and Learning Goal.");
      return;
    }
    if (action === "validity" && record.status === "awaiting_clarification" && !answer.trim()) {
      setError("Answer the clarification question before submitting.");
      return;
    }
    const actionToken = {};
    submitting.current = actionToken;
    setBusy(true);
    setError(null);
    try {
      const payload = action === "save" ? { subject: subject.trim(), learningGoal: learningGoal.trim() }
        : action === "validity" && record.status === "awaiting_clarification" ? { answer: answer.trim() } : {};
      const response = await fetch(`/api/course-requests/${requestId}${action === "save" ? "" : `/${action}`}`, {
        method: action === "save" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json() as { courseRequest?: CourseRequestRecord; error?: string };
      if (!response.ok || !body.courseRequest) throw new Error(body.error ?? "Could not update Course Request. Please try again.");
      if (!mounted.current || currentRoute.current !== route) return;
      if (action === "revise") navigate(`/course-requests/${body.courseRequest.id}`);
      else setRecord(body.courseRequest);
    } catch (caught: unknown) {
      if (mounted.current && currentRoute.current === route) setError(caught instanceof Error ? caught.message : "Could not update Course Request. Please try again.");
    } finally {
      if (submitting.current === actionToken) submitting.current = null;
      if (mounted.current && currentRoute.current === route) setBusy(false);
    }
  }

  const visibleRecord = record?.id === requestId ? record : null;
  const inputClass = "mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <p className="text-sm text-muted-foreground">Course Request</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Course Request</h1>
      {error ? <p role="alert" className="mt-8 whitespace-pre-wrap break-words text-sm text-red-400">{error}</p> : null}
      {!visibleRecord && !error ? <p role="status" className="mt-8 text-sm text-muted-foreground">Loading…</p> : null}
      {!visibleRecord && error ? <Button type="button" className="mt-4" onClick={() => setRetry((value) => value + 1)}>Try again</Button> : null}
      {visibleRecord ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-6" aria-busy={busy}>
          <p role="status" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{busy ? "Saving changes or checking your request…" : courseRequestStatusLabel(visibleRecord.status)}</p>
          {visibleRecord.revisedFromId ? <p className="mt-4 text-sm"><Link className="underline" to={`/course-requests/${visibleRecord.revisedFromId}`}>View original request</Link></p> : null}
          {visibleRecord.status === "draft" ? (
            <form className="mt-6" onSubmit={(event) => void act("save", event)}>
              <fieldset disabled={busy} className="space-y-4">
                <legend className="sr-only">Edit revised Course Request</legend>
                <div><label htmlFor="subject" className="block text-sm font-medium">Subject</label><input id="subject" name="subject" required value={subject} onChange={(event) => setSubject(event.target.value)} className={inputClass} /></div>
                <div><label htmlFor="learning-goal" className="block text-sm font-medium">Learning Goal</label><textarea id="learning-goal" name="learningGoal" required rows={4} value={learningGoal} onChange={(event) => setLearningGoal(event.target.value)} className={inputClass} /></div>
                <p className="text-sm text-muted-foreground">Saving changes prepares this Request for validity review. It does not generate a Course.</p>
                <Button type="submit">{busy ? "Saving…" : "Save changes"}</Button>
              </fieldset>
            </form>
          ) : (
            <dl className="mt-6 space-y-4">
              <div><dt className="text-sm text-muted-foreground">Subject</dt><dd className="mt-1 whitespace-pre-wrap break-words font-medium">{visibleRecord.subject}</dd></div>
              <div><dt className="text-sm text-muted-foreground">Learning Goal</dt><dd className="mt-1 whitespace-pre-wrap break-words">{visibleRecord.learningGoal}</dd></div>
            </dl>
          )}
          {visibleRecord.validity ? <div className="mt-6"><h2 className="font-medium">Validity decision</h2><p className="mt-2 whitespace-pre-wrap break-words text-sm">{visibleRecord.validity.reason}</p></div> : null}
          {visibleRecord.clarification ? <dl className="mt-6 space-y-2"><div><dt className="text-sm text-muted-foreground">Clarification question</dt><dd className="whitespace-pre-wrap break-words">{visibleRecord.clarification.question}</dd></div><div><dt className="text-sm text-muted-foreground">Your submitted answer</dt><dd className="whitespace-pre-wrap break-words">{visibleRecord.clarification.answer}</dd></div></dl> : null}
          {visibleRecord.status === "awaiting_validity" ? <div className="mt-6"><p className="mb-4 text-sm text-muted-foreground">Your Request is saved. Check whether its learning outcomes can proceed before the Starting Level check. Saving alone does not generate a Course.</p><Button type="button" disabled={busy} onClick={() => void act("validity")}>{busy ? "Checking…" : "Check request"}</Button></div> : null}
          {visibleRecord.status === "awaiting_clarification" ? (
            <form className="mt-6" onSubmit={(event) => void act("validity", event)}>
              <fieldset disabled={busy} className="space-y-4">
                <legend className="sr-only">Clarify your Course Request</legend>
                <label htmlFor="clarification-answer" className="block whitespace-pre-wrap break-words text-sm font-medium">{visibleRecord.clarification?.question ?? visibleRecord.validity?.question}</label>
                <textarea id="clarification-answer" name="answer" required rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} className={inputClass} />
                <Button type="submit">{busy ? "Checking…" : "Submit answer"}</Button>
              </fieldset>
            </form>
          ) : null}
          {visibleRecord.status === "rejected" ? <div className="mt-6">{visibleRecord.validity?.safeReframe ? <><h2 className="font-medium">Safe reframe</h2><p className="mt-2 mb-4 whitespace-pre-wrap break-words text-sm">{visibleRecord.validity.safeReframe}</p></> : null}<p className="mb-4 text-sm text-muted-foreground">Revise the learning outcome in a new draft. The original decision stays unchanged.</p><Button type="button" disabled={busy} onClick={() => void act("revise")}>{busy ? "Creating draft…" : "Revise request"}</Button></div> : null}
          {DIAGNOSTIC_STATUSES.has(visibleRecord.status) ? <StartingLevelDiagnostic record={visibleRecord} onRecord={setRecord} /> : null}
        </div>
      ) : null}
      <Button asChild variant="outline" className="mt-6"><Link to="/">Back to Home</Link></Button>
    </div>
  );
}
