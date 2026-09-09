import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils";

type StudyLesson = {
  id: string;
  title: string;
  teachingMethod: string;
  position: number;
  lessonGoal: string;
};

type StudyModule = {
  id: string;
  title: string;
  position: number;
  lessons: StudyLesson[];
};

type StudyPayload = {
  course: { id: string; title: string; sequenceMode: string };
  progress: { completed: number; total: number };
  currentLessonId: string;
  modules: StudyModule[];
};

/**
 * Flatten Lessons in Course order.
 * @param modules - Study modules
 */
function allLessons(modules: StudyModule[]): StudyLesson[] {
  return modules.flatMap((row) => row.lessons);
}

/**
 * Study chrome for a published Course. Workspace sidebar is hidden.
 */
export function StudyPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lessonsOpen, setLessonsOpen] = useState(false);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setPayload(null);
    setError(null);
    fetch(`/api/courses/${courseId}`)
      .then((response) => {
        if (response.status === 404) throw new Error("Published Course not found.");
        if (!response.ok) throw new Error("Could not load Study");
        return response.json() as Promise<StudyPayload>;
      })
      .then((body) => {
        if (!cancelled) setPayload(body);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load Study");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const lessons = useMemo(() => (payload ? allLessons(payload.modules) : []), [payload]);
  const visible = lessons.find((row) => row.id === lessonId) ?? null;

  if (error) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button asChild variant="ghost">
            <Link to="/">Workspace</Link>
          </Button>
        </header>
        <p className="p-8 text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!payload || !courseId) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <p className="p-8 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!visible) {
    return <Navigate to={`/study/${courseId}/lessons/${payload.currentLessonId}`} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button asChild variant="ghost">
          <Link to="/">Workspace</Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={lessonsOpen}
          aria-controls="study-lessons"
          onClick={() => setLessonsOpen((open) => !open)}
        >
          {lessonsOpen ? "Hide lessons" : "Lessons"}
        </Button>
        <p className="min-w-0 flex-1 truncate text-sm">
          {payload.course.title} · {payload.progress.completed} / {payload.progress.total}
        </p>
      </header>
      <div className="flex min-h-0 flex-1">
        {lessonsOpen ? (
          <nav id="study-lessons" className="w-64 shrink-0 overflow-y-auto border-r border-border p-3" aria-label="Lessons">
            {payload.modules.map((module) => (
              <div key={module.id} className="mb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{module.title}</p>
                <ul className="mt-2 grid gap-1">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <NavLink
                        end
                        to={`/study/${courseId}/lessons/${lesson.id}`}
                        className={({ isActive }) =>
                          cn(
                            "block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                            isActive && "bg-accent text-foreground",
                          )
                        }
                      >
                        {lesson.title}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        ) : null}
        <main className="min-w-0 flex-1 p-8">
          <h1 className="text-3xl font-semibold tracking-tight">{visible.title}</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">{visible.lessonGoal}</p>
          <p className="mt-8 text-sm text-muted-foreground">Lesson body comes in a later ticket.</p>
        </main>
      </div>
    </div>
  );
}

/**
 * Sends `/study/:courseId` to the Current Lesson.
 */
export function StudyIndexPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [to, setTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    fetch(`/api/courses/${courseId}`)
      .then((response) => {
        if (response.status === 404) throw new Error("Published Course not found.");
        if (!response.ok) throw new Error("Could not load Study");
        return response.json() as Promise<StudyPayload>;
      })
      .then((body) => {
        if (!cancelled) setTo(`/study/${courseId}/lessons/${body.currentLessonId}`);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load Study");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button asChild variant="ghost">
            <Link to="/">Workspace</Link>
          </Button>
        </header>
        <p className="p-8 text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (!to) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <p className="p-8 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <Navigate to={to} replace />;
}
