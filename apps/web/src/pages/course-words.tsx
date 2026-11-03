import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useCompanionLines } from "@/components/companion/companion-provider.tsx";
import { CourseOutline } from "@/components/learn/course-outline.tsx";
import { CourseWordsView } from "@/components/learn/course-words.tsx";
import { collectCourseWords } from "@/components/learn/words.ts";
import { ShellOutline, ShellTitle } from "@/components/shell/app-shell.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import { apiFetch } from "@/lib/api.ts";
import { markOpened } from "@/lib/course-list.ts";
import type { StudyPayload } from "@/lib/study-types.ts";

const WORDS_LINES = [
  "Every word your lessons stopped to explain, in one place.",
  "Type a few letters to find one.",
  "Each word links back to the lesson that explained it.",
];

/**
 * `/study/:courseId/words`: the Course's Words page in the Study shell, with the Course outline in the sidebar (its
 * Words row lit). Loads the same Study payload as Study, since it already carries every Lesson's body, and records
 * one `words-opens` product event per page open; a failure there never reaches the Learner.
 */
export function CourseWordsPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorded = useRef<string | null>(null);
  useCompanionLines(WORDS_LINES);

  // Opening a Course's Words makes it the current course in the sidebar and on Home, like opening a Lesson.
  useEffect(() => {
    if (courseId) markOpened({ kind: "course", id: courseId });
  }, [courseId]);

  // One product event per page open (the ref holds through Strict Mode's second effect run).
  useEffect(() => {
    if (!courseId || recorded.current === courseId) return;
    recorded.current = courseId;
    void apiFetch(`/api/courses/${courseId}/words-opens`, { method: "POST" }).catch(() => undefined);
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setPayload(null);
    setError(null);
    apiFetch(`/api/courses/${courseId}`)
      .then((response) => {
        if (response.status === 404) throw new Error("Published Course not found.");
        if (!response.ok) throw new Error("Could not load the words");
        return response.json() as Promise<StudyPayload>;
      })
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load the words");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const words = useMemo(() => (payload ? collectCourseWords(payload) : null), [payload]);

  if (error) {
    return <ErrorState title="This course didn't open">{error}</ErrorState>;
  }

  if (!payload || !words || !courseId) {
    return <PageLoader label="Gathering the words…" />;
  }

  return (
    <>
      <ShellTitle>
        <span className="l-crumb">
          <span>{payload.course.title}</span>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          <b>Words</b>
        </span>
      </ShellTitle>
      <ShellOutline>
        <CourseOutline payload={payload} activeWords />
      </ShellOutline>
      <CourseWordsView courseId={courseId} words={words} />
    </>
  );
}
