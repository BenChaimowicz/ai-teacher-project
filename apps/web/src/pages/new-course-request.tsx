import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { COURSE_REQUEST_BLOCKED } from "@/lib/teaching-profile-copy.ts";
import type { CourseRequestRecord } from "@/lib/course-request-types.ts";

/**
 * Compose a Course Request. Blocked until the Teaching Profile is saved.
 */
export function NewCourseRequestPage() {
  const { loading, present, error: profileError, refresh } = useTeachingProfile();
  const navigate = useNavigate();
  const [subject, setSubject] = useState("");
  const [learningGoal, setLearningGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /** Saves one Request, preserving the draft on failure and opening the saved record on success. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !present) return;
    if (!subject.trim() || !learningGoal.trim()) {
      setFormError("Enter a subject and Learning Goal.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const response = await fetch("/api/course-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subject.trim(), learningGoal: learningGoal.trim() }),
      });
      const body = await response.json() as { courseRequest?: CourseRequestRecord; error?: string };
      if (!response.ok) {
        throw new Error(body.error ?? "Could not save Course Request. Please try again.");
      }
      if (!body.courseRequest?.id) throw new Error("Could not open the saved Course Request.");
      if (mounted.current) navigate(`/course-requests/${body.courseRequest.id}`);
    } catch (caught: unknown) {
      if (mounted.current) setFormError(caught instanceof Error ? caught.message : "Could not save Course Request. Please try again.");
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">New Course Request</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">New Course Request</h1>
        <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">New Course Request</h1>
        <p role="alert" className="mt-4 text-sm text-red-400">Could not load your Teaching Profile.</p>
        <Button type="button" className="mt-6" onClick={() => void refresh()}>Try again</Button>
      </div>
    );
  }

  if (!present) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">New Course Request</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">New Course Request</h1>
        <p className="mt-4 max-w-lg text-muted-foreground">{COURSE_REQUEST_BLOCKED}</p>
        <Button asChild className="mt-6">
          <Link to="/teaching-profile">Go to Teaching Profile</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-16">
      <p className="text-sm text-muted-foreground">New Course Request</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">New Course Request</h1>
      <p className="mt-4 max-w-lg text-muted-foreground">
        Choose a subject and tell us what you want to be able to do or understand.
        Your Teaching Profile guides how future Lessons are taught, not your Starting Level.
      </p>
      <form className="mt-8" onSubmit={(event) => void submit(event)} aria-busy={busy}>
        <fieldset disabled={busy} className="space-y-6">
          <legend className="sr-only">Compose Course Request</legend>
          <div>
            <label htmlFor="subject" className="block text-sm font-medium">Subject</label>
            <p id="subject-help" className="mt-1 text-sm text-muted-foreground">For example, Norse mythology or drum kit fundamentals.</p>
            <input
              id="subject" name="subject" type="text" required value={subject}
              onChange={(event) => setSubject(event.target.value)} aria-describedby="subject-help"
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div>
            <label htmlFor="learning-goal" className="block text-sm font-medium">Learning Goal</label>
            <p id="learning-goal-help" className="mt-1 text-sm text-muted-foreground">Describe the outcome, not your current level. For example, explain the main stories and figures in the Norse mythic corpus.</p>
            <textarea
              id="learning-goal" name="learningGoal" required rows={4} value={learningGoal}
              onChange={(event) => setLearningGoal(event.target.value)} aria-describedby="learning-goal-help"
              className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p className="text-sm text-muted-foreground">Saving keeps this Request in your Library. You can then check its validity before Assessment; no Course will be generated by saving.</p>
          {formError ? <p role="alert" className="text-sm text-red-400">{formError}</p> : null}
          <Button type="submit">{busy ? "Saving…" : "Save Course Request"}</Button>
        </fieldset>
      </form>
    </div>
  );
}
