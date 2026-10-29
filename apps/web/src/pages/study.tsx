import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { nextLessonId } from "@senoy/db/progress";
import { parseReadingBody, READING_METHOD_ID } from "@senoy/db/reading-lesson";
import { MoreHorizontal } from "lucide-react";
import { useCompanionLines } from "@/components/companion/companion-provider.tsx";
import { CourseOutline } from "@/components/learn/course-outline.tsx";
import { FinishLine } from "@/components/learn/finish-line.tsx";
import { ReadingPanel } from "@/components/learn/reading-panel.tsx";
import { StudyChromeProvider, useStudyChrome } from "@/components/learn/study-chrome.tsx";
import { ShellActions, ShellOutline, ShellTitle, useShell } from "@/components/shell/app-shell.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ConfirmDialog } from "@/components/ui/dialog.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import { useTeachingProfile } from "@/components/teaching-profile-provider.tsx";
import { requestJson } from "@/lib/api.ts";
import { markOpened } from "@/lib/course-list.ts";
import type { StudyLesson, StudyModule, StudyPayload } from "@/lib/study-types.ts";
import { renderForTeachingMethod } from "@/teaching-methods/register.ts";

const READING_LINES = [
  "Take your time. There's a short check after the reading.",
  "Hover a small number to see its source.",
  "Aa changes how the text looks.",
  "The sources are at the bottom, if you're curious.",
];
const QUIZ_LINES = ["No timer. Think it through.", "Earlier lessons stay open while you work.", "A wrong answer is just something to look at again."];

/**
 * Flatten Lessons in Course order.
 * @param modules - Study modules
 */
function allLessons(modules: StudyModule[]): StudyLesson[] {
  return modules.flatMap((row) => row.lessons);
}

/**
 * Focus mode: tuck the sidebar away while it is on (and bring it back after), fade the header until
 * the pointer or a key wakes it, and let Esc leave Focus. The header itself never goes away.
 * @param on - Focus is the current layout
 * @param exit - Leaves Focus
 */
function useFocusMode(on: boolean, exit: () => void) {
  const { sidebarOpen, setSidebarOpen } = useShell();
  const openRef = useRef(sidebarOpen);
  openRef.current = sidebarOpen;
  const exitRef = useRef(exit);
  exitRef.current = exit;
  const setOpenRef = useRef(setSidebarOpen);
  setOpenRef.current = setSidebarOpen;

  useEffect(() => {
    if (!on) return;
    const root = document.documentElement;
    root.dataset.readFocus = "1";
    const closedByFocus = openRef.current && !matchMedia("(max-width: 899px)").matches;
    if (closedByFocus) setOpenRef.current(false);
    let timer = 0;
    const wake = () => {
      root.dataset.readAwake = "1";
      window.clearTimeout(timer);
      timer = window.setTimeout(() => delete root.dataset.readAwake, 2200);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector(".k-dialog, .l-rpanel")) exitRef.current();
      else wake();
    };
    window.addEventListener("mousemove", wake);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      delete root.dataset.readFocus;
      delete root.dataset.readAwake;
      window.removeEventListener("mousemove", wake);
      document.removeEventListener("keydown", onKey);
      if (closedByFocus) setOpenRef.current(true);
    };
  }, [on]);
}

/**
 * The course menu in the Study header (free jump).
 */
function CourseMenu({ linear, onFreeJump }: { linear: boolean; onFreeJump: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className="l-menu" ref={wrap}>
      <Button variant="quiet" size="icon" aria-label="Course menu" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <MoreHorizontal />
      </Button>
      {open ? (
        <div role="menu" aria-label="Course">
          {linear ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onFreeJump();
              }}
            >
              Switch to free jump
            </button>
          ) : (
            <p className="note">Free jump is on. Every Lesson is open.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Study for a published Course: the Course page (outline) in the sidebar, the Lesson in the main area,
 * and a header that is always there (sidebar toggle, Home, title, Aa, course menu).
 */
export function StudyPage() {
  return (
    <StudyChromeProvider>
      <StudyScreen />
    </StudyChromeProvider>
  );
}

/**
 * The Study screen inside the chrome provider.
 */
function StudyScreen() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const { record, loading: profileLoading } = useTeachingProfile();
  const { settings, applyMode, sectionsRead } = useStudyChrome();
  const [payload, setPayload] = useState<StudyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmFreeJump, setConfirmFreeJump] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const sectionAdvance = record?.resolved?.sectionAdvance.value ?? "continuous";

  // Opening a Course makes it the current course in the sidebar and on Home.
  useEffect(() => {
    if (courseId) markOpened({ kind: "course", id: courseId });
  }, [courseId]);

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
  const isReading = visible?.teachingMethod === READING_METHOD_ID;
  useCompanionLines(isReading ? READING_LINES : QUIZ_LINES);
  useFocusMode(Boolean(visible && !visible.locked && isReading && settings.layout === "focus"), () => applyMode("comfort"));

  const sections = useMemo(() => {
    if (!visible || !isReading) return [];
    return parseReadingBody(visible.body)?.sections.map((section) => section.heading) ?? [];
  }, [visible, isReading]);

  const Play = visible ? renderForTeachingMethod(visible.teachingMethod) : null;
  const nextId =
    visible && payload
      ? nextLessonId(
          lessons.map((row) => row.id),
          new Set(lessons.filter((row) => row.completed).map((row) => row.id)),
          visible.id,
        )
      : null;
  const next = lessons.find((row) => row.id === nextId) ?? null;

  /**
   * One-way switch to free jump. Linear cannot be restored.
   */
  async function switchToFreeJump() {
    if (!courseId || switching) return;
    setSwitching(true);
    setSwitchError(null);
    try {
      const updated = await requestJson<StudyPayload>(`/api/courses/${courseId}/sequence-mode`, "PUT", { mode: "free_jump" }, "Could not switch to free jump");
      setPayload(updated);
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

  const lessonNumber = lessons.indexOf(visible) + 1;
  const finish = visible.completed ? (
    <FinishLine courseId={courseId} next={next} courseComplete={Boolean(payload.course.completedAt)} />
  ) : null;

  return (
    <>
      <ShellTitle>
        <span className="l-crumb">
          <span>
            {payload.course.title} · {payload.progress.completed} / {payload.progress.total}
          </span>
          <span className="sep" aria-hidden="true">
            ›
          </span>
          <b>{visible.title}</b>
        </span>
      </ShellTitle>
      <ShellActions>
        {isReading ? <ReadingPanel /> : null}
        {isReading && settings.layout === "focus" ? (
          <button type="button" className="l-focus-exit" onClick={() => applyMode("comfort")}>
            exit focus · esc
          </button>
        ) : null}
        <CourseMenu
          linear={payload.course.sequenceMode === "linear"}
          onFreeJump={() => {
            setSwitchError(null);
            setConfirmFreeJump(true);
          }}
        />
      </ShellActions>
      <ShellOutline>
        <CourseOutline payload={payload} activeLessonId={visible.id} sections={sections} sectionsRead={sectionsRead} />
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
      {Play ? (
        <Play
          key={visible.id}
          courseId={courseId}
          lesson={visible}
          sectionAdvance={sectionAdvance}
          onPayload={setPayload}
          lessonNumber={lessonNumber}
          finish={finish}
        />
      ) : (
        <div className="mx-auto max-w-[720px]">
          <h1 className="text-3xl font-bold tracking-tight">{visible.title}</h1>
          <p className="mt-8 text-sm text-muted-foreground">This teaching method cannot be shown yet.</p>
          {finish}
        </div>
      )}
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
