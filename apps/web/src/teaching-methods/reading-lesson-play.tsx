import { parseReadingBody } from "@senoy/db/reading-lesson";
import { ReadingView } from "@/components/learn/reading-view.tsx";
import type { StudyPayload } from "@/lib/study-types.ts";
import type { LessonPlayProps } from "@/teaching-methods/register.ts";

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
 * Completion is the end-of-lesson "I've read it". Progress never drops; it does not leave this Lesson.
 */
export function ReadingLessonPlay({ courseId, lesson, sectionAdvance, onPayload, lessonNumber, finish }: LessonPlayProps) {
  const body = parseReadingBody(lesson.body);

  /**
   * Calls reading-plugin complete and applies the new Study payload.
   * @throws With the server's message when it fails
   */
  async function markComplete() {
    if (lesson.completed) return;
    const response = await fetch(`/api/courses/${courseId}/lessons/${lesson.id}/complete`, { method: "POST" });
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
      title={lesson.title}
      lessonGoal={lesson.lessonGoal}
      lessonNumber={lessonNumber}
      body={body}
      citations={lesson.citations}
      completed={lesson.completed}
      paused={sectionAdvance === "manual"}
      onComplete={markComplete}
      finish={finish}
    />
  );
}
