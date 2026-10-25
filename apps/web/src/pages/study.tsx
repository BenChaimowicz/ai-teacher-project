import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, useParams } from "react-router-dom";
import { courseCompletePath, nextLessonId, studyPath } from "@senoy/db/progress";
import { Check, Lock, MoreHorizontal } from "lucide-react";
import { ShellActions, ShellOutline, ShellTitle } from "@/components/shell/app-shell.tsx";
import { ConfirmDialog } from "@/components/ui/dialog.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
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
 * Study for a published Course. The shell shows the outline in the sidebar and the title in the header.
 */
export function StudyPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const { record, loading: profileLoading } = useTeachingProfile();
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
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
  const nextId =
    visible && payload
      ? nextLessonId(
          lessons.map((row) => row.id),
          new Set(lessons.filter((row) => row.completed).map((row) => row.id)),
          visible.id,
        )
      : null;

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
    return <ErrorState title="This course didn't open">{error}</ErrorState>;
  }

  if (!payload || !courseId || profileLoading) {
    return <PageLoader label="Getting your lesson ready…" />;
  }

  if (!visible || visible.locked) {
    return <Navigate to={`/study/${courseId}/lessons/${payload.currentLessonId}`} replace />;
  }

  return (
    <>
      <ShellTitle>
        {payload.course.title} · {payload.progress.completed} / {payload.progress.total}
      </ShellTitle>
      <ShellActions>
        <div className="relative">
          <Button
            variant="quiet"
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
              className="absolute right-0 top-full z-40 mt-1 w-64 rounded-xl border border-border bg-card p-1 shadow-xl"
            >
              {payload.course.sequenceMode === "linear" ? (
                <button
                  type="button"
                  role="menuitem"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
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
      </ShellActions>
      <ShellOutline>
        <nav id="study-lessons" aria-label="Lessons" className="px-1">
          <p className="k-sec-h">
            course<span className="n">
              {payload.progress.completed}/{payload.progress.total}
            </span>
          </p>
          {payload.modules.map((module) => (
            <div key={module.id} className="mb-3">
              <p className="px-2 text-xs font-semibold text-muted-foreground">{module.title}</p>
              <ul className="mt-1 grid gap-0.5">
                {module.lessons.map((lesson) => (
                  <li key={lesson.id}>
                    {lesson.locked ? (
                      <span
                        aria-disabled="true"
                        title="Locked until you pass the Quiz before it"
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-faint"
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
                            "flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground",
                            isActive && "border-[var(--a-line)] bg-[var(--a-soft)] text-foreground",
                          )
                        }
                      >
                        {lesson.completed ? <Check aria-hidden="true" className="size-3.5 shrink-0 text-a" /> : null}
                        <span className="min-w-0 truncate">{lesson.title}</span>
                      </NavLink>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </ShellOutline>
      <ConfirmDialog
        open={confirmFreeJump}
        title="Switch to free jump?"
        body="Every Lesson in this Course opens, in any order. Progress still counts a Quiz only once you pass it. You can't switch back to linear order."
        confirmLabel="Switch to free jump"
        busy={switching}
        onConfirm={() => void switchToFreeJump()}
        onCancel={() => setConfirmFreeJump(false)}
        extra={switchError ? <p className="mt-3 text-sm text-miss">{switchError}</p> : null}
      />
      <article className="mx-auto max-w-[720px]">
        <h1 className="text-3xl font-bold tracking-tight">{visible.title}</h1>
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
        {visible.completed ? (
          <div className="mt-8 border-t border-border pt-6">
            {payload.course.completedAt && !nextId ? (
              <Button asChild>
                <Link to={courseCompletePath(courseId)}>Finish Course</Link>
              </Button>
            ) : nextId ? (
              <Button asChild>
                <Link to={studyPath(courseId, nextId)}>Next Lesson</Link>
              </Button>
            ) : null}
          </div>
        ) : null}
      </article>
    </>
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
    return <ErrorState title="This course didn't open">{error}</ErrorState>;
  }

  if (!to) {
    return <PageLoader label="Getting your lesson ready…" />;
  }

  return <Navigate to={to} replace />;
}
