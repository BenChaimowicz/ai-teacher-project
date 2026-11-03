import { useCallback, useMemo } from "react";
import { parseReadingBody, type GlossaryEntry } from "@senoy/db/reading-lesson";
import { ReadingView } from "@/components/learn/reading-view.tsx";
import type { StudyPayload } from "@/lib/study-types.ts";
import type { LessonPlayProps } from "@/teaching-methods/register.ts";
import { apiFetch } from "@/lib/api.ts";

/**
 * Reads a Study payload from complete JSON.
 * @param raw - Fetch JSON
 */
function asStudyPayload(raw: unknown): StudyPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<StudyPayload>;
  if (!row.course || !row.progress || !row.modules) return null;
  return row as StudyPayload;
}

/**
 * Reading-plugin `render` and client `complete`. The screen lives in `components/learn/reading-view.tsx`.
 * Completion is the end-of-lesson "I've read it", which also opens `next` in the same click. Progress never drops.
 */
export function ReadingLessonPlay({ courseId, lesson, sectionAdvance, onPayload, lessonNumber, finish, next }: LessonPlayProps) {
  const body = useMemo(() => parseReadingBody(lesson.body), [lesson.body]);

  /**
   * Records that the Learner opened a glossary word's definition. Fire and forget: a failure never reaches the Learner.
   * @param entry - The opened glossary entry
   */
  const recordGlossaryOpen = useCallback(
    (entry: GlossaryEntry) => {
      void apiFetch(`/api/courses/${courseId}/lessons/${lesson.id}/glossary-opens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: entry.term }),
      }).catch(() => undefined);
    },
    [courseId, lesson.id],
  );

  /**
   * Calls reading-plugin complete and applies the new Study payload.
   * @throws With the server's message when it fails
   */
  async function markComplete() {
    if (lesson.completed) return;
    const response = await apiFetch(`/api/courses/${courseId}/lessons/${lesson.id}/complete`, { method: "POST" });
    const json: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message =
        json && typeof json === "object" && "error" in json ? String((json as { error: unknown }).error) : "Could not mark complete";
      throw new Error(message);
    }
    const payload = asStudyPayload(json);
    if (!payload) throw new Error("Could not mark complete");
    onPayload(payload);
  }

  if (!body) return <p className="l-error">This reading Lesson has no body.</p>;

  return (
    <ReadingView
      lessonId={lesson.id}
      courseId={courseId}
      title={lesson.title}
      lessonGoal={lesson.lessonGoal}
      lessonNumber={lessonNumber}
      body={body}
      citations={lesson.citations}
      completed={lesson.completed}
      paused={sectionAdvance === "manual"}
      onComplete={markComplete}
      finish={finish}
      next={next ?? null}
      onGlossaryOpen={recordGlossaryOpen}
    />
  );
}
