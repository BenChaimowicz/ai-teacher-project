import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { courseRequestStatusLabel, type CourseRequestRecord } from "@/lib/course-request-types.ts";

/** Opens a persisted Course Request at its current unpublished status. */
export function CourseRequestPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const [record, setRecord] = useState<CourseRequestRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setError(null);
    /** Loads the learner-owned record without treating it as a published Course. */
    async function load() {
      try {
        const response = await fetch(`/api/course-requests/${requestId}`);
        const body = await response.json() as { courseRequest?: CourseRequestRecord; error?: string };
        if (!response.ok || !body.courseRequest) throw new Error(body.error ?? "Could not load Course Request.");
        if (!cancelled) setRecord(body.courseRequest);
      } catch (caught: unknown) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load Course Request.");
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [requestId]);

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <p className="text-sm text-muted-foreground">Course Request</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Course Request</h1>
      {error ? <p role="alert" className="mt-8 text-sm text-red-400">{error}</p> : null}
      {!error && (!record || record.id !== requestId) ? <p className="mt-8 text-sm text-muted-foreground">Loading…</p> : null}
      {!error && record && record.id === requestId ? (
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{courseRequestStatusLabel(record.status)}</p>
          <dl className="mt-6 space-y-4">
            <div>
              <dt className="text-sm text-muted-foreground">Subject</dt>
              <dd className="mt-1 break-words font-medium">{record.subject}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">Learning Goal</dt>
              <dd className="mt-1 whitespace-pre-wrap break-words">{record.learningGoal}</dd>
            </div>
          </dl>
          {record.status === "awaiting_validity" ? (
            <p className="mt-6 text-sm text-muted-foreground">Your Course Request is saved. Validity review has not run, and Assessment and Course generation have not started. These steps are not available yet.</p>
          ) : null}
        </div>
      ) : null}
      <Button asChild variant="outline" className="mt-6"><Link to="/">Back to Home</Link></Button>
    </div>
  );
}