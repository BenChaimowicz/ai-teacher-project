import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { Lock, MoreHorizontal } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { requestJson } from "@/lib/api.ts";
import type { StudyLesson, StudyModule, StudyPayload } from "@/lib/study-types.ts";
import { cn } from "@/lib/utils";
import { renderForTeachingMethod } from "@/teaching-methods/register.ts";

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
  const { record, loading: profileLoading } = useTeachingProfile();
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lessonsOpen, setLessonsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmFreeJump, setConfirmFreeJump] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const sectionAdvance = record?.resolved?.sectionAdvance.value ?? "continuous";

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
  const Play = visible ? renderForTeachingMethod(visible.teachingMethod) : null;

  /**
   * One-way switch to free jump. Linear cannot be restored.
   */
  async function switchToFreeJump() {
    if (!courseId || switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const next = await requestJson<StudyPayload>(
        `/api/courses/${courseId}/sequence-mode`,
        "PUT",
        { mode: "free_jump" },
        "Could not switch to free jump",
      );
      setPayload(next);
      setConfirmFreeJump(false);
    } catch (caught: unknown) {
      setSwitchError(caught instanceof Error ? caught.message : "Could not switch to free jump");
    } finally {
      setSwitching(false);
    }
  }

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

  if (!payload || !courseId || profileLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <p className="p-8 text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (!visible || visible.locked) {
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
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Course menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <MoreHorizontal />
          </Button>
          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 top-full z-40 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-xl"
            >
              {payload.course.sequenceMode === "linear" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => {
                    setMenuOpen(false);
                    setSwitchError(null);
                    setConfirmFreeJump(true);
                  }}
                >
                  Switch to free jump
                </button>
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">Free jump is on. Every Lesson is open.</p>
              )}
            </div>
          ) : null}
        </div>
      </header>
      <ConfirmDialog
        open={confirmFreeJump}
        title="Switch to free jump?"
        body="Every Lesson in this Course opens, in any order. Progress still counts a Quiz only once you pass it. You can't switch back to linear order."
        confirmLabel="Switch to free jump"
        busy={switching}
        onConfirm={() => void switchToFreeJump()}
        onCancel={() => setConfirmFreeJump(false)}
        extra={switchError ? <p className="mt-3 text-sm text-red-400">{switchError}</p> : null}
      />
      <div className="flex min-h-0 flex-1">
        {lessonsOpen ? (
          <nav id="study-lessons" className="w-64 shrink-0 overflow-y-auto border-r border-border p-3" aria-label="Lessons">
            {payload.modules.map((module) => (
              <div key={module.id} className="mb-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{module.title}</p>
                <ul className="mt-2 grid gap-1">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      {lesson.locked ? (
                        <span
                          aria-disabled="true"
                          title="Locked until you pass the Quiz before it"
                          className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground/60"
                        >
                          {lesson.title}
                          <Lock aria-label="Locked" className="size-3.5 shrink-0" />
                        </span>
                      ) : (
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
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        ) : null}
        <main className="min-w-0 flex-1 overflow-y-auto p-8">
          <h1 className="text-3xl font-semibold tracking-tight">{visible.title}</h1>
          <p className="mt-2 max-w-xl text-muted-foreground">{visible.lessonGoal}</p>
          {Play ? (
            <Play
              courseId={courseId}
              lesson={visible}
              sectionAdvance={sectionAdvance}
              onPayload={setPayload}
            />
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">This teaching method cannot be shown yet.</p>
          )}
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
