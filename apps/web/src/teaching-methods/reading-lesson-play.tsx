import { useEffect, useState } from "react";
import { parseReadingBody, type NumberedSource, type ReadingSection } from "@senoy/db/reading-lesson";
import { Button } from "@/components/ui/button.tsx";
import type { StudyLesson, StudyPayload } from "@/lib/study-types.ts";

type ReadingLessonPlayProps = {
  courseId: string;
  lesson: StudyLesson;
  sectionAdvance: "manual" | "continuous";
  onPayload: (payload: StudyPayload) => void;
};

/**
 * Turns prose with [1] markers into text plus links to the source list.
 * @param text - One content block
 */
function ProseWithCitations({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="mt-3 text-sm leading-relaxed text-foreground/90">
      {parts.map((part, index) => {
        const match = /^\[(\d+)\]$/.exec(part);
        if (!match) return <span key={index}>{part}</span>;
        const n = match[1];
        return (
          <a
            key={index}
            href={`#citation-${n}`}
            className="align-super text-xs text-primary hover:underline"
          >
            [{n}]
          </a>
        );
      })}
    </p>
  );
}

/**
 * One headed reading section and its content blocks.
 * @param section - Reading section
 */
function SectionView({ section }: { section: ReadingSection }) {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold tracking-tight">{section.heading}</h2>
      {section.blocks.map((block, index) => (
        <ProseWithCitations key={index} text={block.text} />
      ))}
    </section>
  );
}

/**
 * Numbered source list for Citations in the prose.
 * @param citations - Fixture source list
 */
function SourceList({ citations }: { citations: NumberedSource[] }) {
  if (citations.length === 0) return null;
  return (
    <aside className="mt-10 border-t border-border pt-6">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Sources</h2>
      <ol className="mt-3 grid gap-2 text-sm">
        {citations.map((row) => (
          <li key={row.n} id={`citation-${row.n}`}>
            [{row.n}]{" "}
            <a href={row.url} className="text-primary hover:underline" target="_blank" rel="noreferrer">
              {row.title}
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}

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
 * Reading-plugin `render` and client `complete`. Pause uses Continue/Previous; scroll shows every section.
 * Mark complete only at the end. Does not leave this Lesson.
 */
export function ReadingLessonPlay({
  courseId,
  lesson,
  sectionAdvance,
  onPayload,
}: ReadingLessonPlayProps) {
  const body = parseReadingBody(lesson.body);
  const lastIndex = body ? body.sections.length - 1 : 0;
  const [sectionIndex, setSectionIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSectionIndex(0);
    setError(null);
  }, [lesson.id]);

  const atLast = sectionIndex >= lastIndex;
  const paused = sectionAdvance === "manual";

  /**
   * Calls reading-plugin complete. Progress never drops. Stays on this Lesson.
   */
  async function markComplete() {
    if (lesson.completed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseId}/lessons/${lesson.id}/complete`, {
        method: "POST",
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          json && typeof json === "object" && "error" in json
            ? String((json as { error: unknown }).error)
            : "Could not mark complete";
        throw new Error(message);
      }
      const payload = asStudyPayload(json);
      if (!payload) throw new Error("Could not mark complete");
      onPayload(payload);
    } catch (caught: unknown) {
      const message = caught instanceof Error ? caught.message : "Could not mark complete";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (!body) {
    return <p className="mt-8 text-sm text-red-400">This reading Lesson has no body.</p>;
  }

  const visibleSections = paused ? [body.sections[sectionIndex]] : body.sections;
  const showMarkComplete = !paused || atLast;

  return (
    <div>
      {visibleSections.map((section, index) =>
        section ? <SectionView key={`${section.heading}-${index}`} section={section} /> : null,
      )}

      {(!paused || atLast) ? <SourceList citations={lesson.citations} /> : null}

      {error ? <p className="mt-6 text-sm text-red-400">{error}</p> : null}

      <div className="mt-8 flex flex-wrap gap-2">
        {paused && sectionIndex > 0 ? (
          <Button type="button" variant="ghost" onClick={() => setSectionIndex((index) => index - 1)}>
            Previous
          </Button>
        ) : null}
        {paused && !atLast ? (
          <Button type="button" onClick={() => setSectionIndex((index) => index + 1)}>
            Continue
          </Button>
        ) : null}
        {showMarkComplete ? (
          lesson.completed ? (
            <Button type="button" disabled>
              Completed
            </Button>
          ) : (
            <Button type="button" onClick={() => void markComplete()} disabled={busy}>
              Mark complete
            </Button>
          )
        ) : null}
      </div>
    </div>
  );
}
