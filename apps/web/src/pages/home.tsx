import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QUIZ_METHOD_ID } from "@senoy/db/reading-lesson";
import { ArrowRight, BookOpen, Flame, Play, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useCompanion, useCompanionLines } from "@/components/companion/companion-provider.tsx";
import { CountUp } from "@/components/learn/count-up.tsx";
import { LinkTiles, type LinkTile } from "@/components/learn/link-tiles.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChatThread, CompanionLine } from "@/components/ui/chat-thread.tsx";
import { CourseCard } from "@/components/ui/course-card.tsx";
import { CourseIcon } from "@/components/ui/course-icon.tsx";
import { PageLoader, Loader } from "@/components/ui/loader.tsx";
import { Jongi } from "@/components/companion/jongi.tsx";
import { ProgressBar, ProgressRing } from "@/components/ui/progress.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import { COMPANION_NAME, type CourseIconName } from "@/lib/brand-marks.ts";
import { LIBRARY_CHANGED_EVENT, currentCourse, toCourseListItem, type CourseListItem, type LibraryItem } from "@/lib/course-list.ts";
import { RemovableCourse } from "@/components/ui/remove-course.tsx";
import { Tape } from "@/components/ui/tape.tsx";
import { cn } from "@/lib/utils";
import type { StudyPayload } from "@/lib/study-types.ts";
import "@/components/learn/learn.css";
import { apiFetch } from "@/lib/api.ts";

const HOME_LINES = ["Small steps add up.", "One short lesson keeps the streak going.", "Curious about something? We can make a course of it.", "No rush. Go at your pace."];
const FIRST_RUN_LINES = ["New here? Let's pick something.", "Any topic works. One line is enough.", "After the topic, it's all taps. No typing."];

/** Plain-words line for a course that is being made. */
const MAKING_LINE: Record<string, string> = {
  awaiting_validity: "Checking your request",
  assessment_preparing: "Preparing a few quick questions",
  blueprint_preparing: "Drafting your plan",
  generating: "Writing your lessons",
};

/** What a course that needs the Learner says, and the one thing to do. Honest about what happens next. */
function needsCopy(status: string): { say: string; action: string; hint: string; retry?: boolean } {
  switch (status) {
    case "generation_failed":
      return {
        say: "One lesson didn't pass our quality checks, so writing stopped there. Retry starts again from that lesson and keeps the ones already written.",
        action: "Try again",
        hint: "Opens it, where Retry is",
        retry: true,
      };
    case "assessment_failed":
      return {
        say: "I couldn't prepare the quick questions about what you already know. Retry makes a fresh set.",
        action: "Try again",
        hint: "Opens it, where Retry is",
        retry: true,
      };
    case "awaiting_clarification":
      return { say: "I have one question before I can plan this.", action: "Answer it", hint: "Tap an answer" };
    case "goal_focused":
      return { say: "One quick question about what you know already, then I can plan it.", action: "Answer it", hint: "One tap" };
    case "assessment_ready":
      return { say: "A few quick questions are waiting, so I know where to start.", action: "Start the questions", hint: "About 2 minutes" };
    case "awaiting_gap_confirmation":
      return { say: "Have a look at where your course would start.", action: "Take a look", hint: "One tap to confirm" };
    case "starting_level_confirmed":
      return { say: "Your starting point is set. The plan comes next.", action: "Plan it", hint: "I draft it, you review it" };
    case "blueprint_review":
      return { say: "Your plan is ready to review.", action: "Review the plan", hint: "Untick anything you don't need" };
    default:
      return { say: "This one is waiting for you.", action: "Continue", hint: "Pick up where you left off" };
  }
}

type Row = { item: LibraryItem; course: CourseListItem };

/**
 * Groups the Library: continue first, then learning, being made, needs you, finished.
 * Stopped attempts, and failed ones the Learner has since started again, collapse as "older".
 * @param items - `/api/library` rows (Courses first, then Requests, each newest first)
 */
function groupLibrary(items: LibraryItem[]) {
  const rows: Row[] = items.map((item) => ({ item, course: toCourseListItem(item) }));
  const learning = rows.filter((row) => row.course.status === "learning");
  // The course opened most recently, as in the sidebar; before any has been opened, the first one already started.
  const started = [...learning].sort((a, b) => Number((b.item.progress?.completed ?? 0) > 0) - Number((a.item.progress?.completed ?? 0) > 0));
  const resume = currentCourse(started.map((row) => ({ row, lastOpenedAt: row.item.lastOpenedAt })))?.row ?? null;
  const live = new Set(rows.filter((row) => row.course.status !== "stopped" && row.course.badge !== "couldn't finish").map((row) => row.item.title.trim().toLowerCase()));
  const seenNeeds = new Set<string>();
  const needs: Row[] = [];
  const older: Row[] = [];
  for (const row of rows) {
    if (row.course.status === "stopped") {
      older.push(row);
      continue;
    }
    if (row.course.status !== "needs") continue;
    const key = row.item.title.trim().toLowerCase();
    const failed = row.course.badge === "couldn't finish";
    if (failed && (seenNeeds.has(key) || live.has(key))) older.push(row);
    else needs.push(row);
    seenNeeds.add(key);
  }
  return {
    resume,
    learning: learning.filter((row) => row !== resume),
    making: rows.filter((row) => row.course.status === "making"),
    needs,
    done: rows.filter((row) => row.course.status === "done"),
    older,
  };
}

/**
 * Morning / afternoon / evening.
 */
function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return "Up late";
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

/**
 * A titled Home section with a count, sharing the page's left edge.
 */
function Section({ id, title, count, children }: { id: string; title: string; count?: ReactNode; children: ReactNode }) {
  return (
    <section className="l-sec" aria-labelledby={id}>
      <h2 id={id} className="k-sec-h">
        {title}
        {count !== undefined ? <span className="n">{count}</span> : null}
      </h2>
      {children}
    </section>
  );
}

/**
 * The course to continue, the focal sheet: a bookmark ribbon, the course, the next Lesson, a ribbon bar
 * for how much is done, and the one button that picks it up again.
 */
function ContinueHero({ row, study }: { row: Row; study: StudyPayload | null }) {
  const progress = row.item.progress ?? { completed: 0, total: 0 };
  const lessons = study ? study.modules.flatMap((module) => module.lessons) : [];
  const current = lessons.find((lesson) => lesson.id === study?.currentLessonId) ?? null;
  const currentNumber = current ? lessons.indexOf(current) + 1 : 0;
  const quizzes = lessons.filter((lesson) => lesson.teachingMethod === QUIZ_METHOD_ID);
  const value = progress.total ? progress.completed / progress.total : 0;
  const kind = current?.teachingMethod === QUIZ_METHOD_ID ? "quiz" : "reading";
  return (
    <div className="l-hero">
      <span className="l-bm" aria-hidden="true" />
      <div className="tx">
        <span className="k-rib">{current ? `lesson ${currentNumber} of ${lessons.length} · ${kind}` : `${progress.completed}/${progress.total}`}</span>
        <h2>{row.item.title}</h2>
        {current ? (
          <p className="nx">
            Next: <b>{current.title}</b> · {kind}
          </p>
        ) : null}
        <ProgressBar value={value} label={`${progress.completed} of ${progress.total} lessons done`} />
        <div className="m">
          <span>
            {progress.completed} of {progress.total} lessons
          </span>
          {quizzes.length ? (
            <span>
              {quizzes.filter((lesson) => lesson.completed).length} of {quizzes.length} quizzes passed
            </span>
          ) : null}
        </div>
        {row.item.href ? (
          <div className="cta">
            <Button asChild>
              <Link to={row.item.href}>
                <Play /> {current ? `Continue ${kind === "quiz" ? "the quiz" : "reading"}` : "Continue"}
              </Link>
            </Button>
          </div>
        ) : null}
      </div>
      <div className="art" aria-hidden="true">
        <CourseIcon name={row.course.icon} size={52} />
      </div>
    </div>
  );
}

/**
 * Today: minutes against the daily goal, the streak, and lessons done so far.
 */
function TodayStrip({ lessonsDone }: { lessonsDone: number }) {
  const { activity } = useCompanion();
  const left = Math.max(0, activity.goalMinutes - activity.minutesToday);
  return (
    <div className="l-today">
      <div className="l-tbox" style={{ "--i": 0 } as CSSProperties}>
        <ProgressRing value={activity.minutesToday / activity.goalMinutes} size={58} stroke={6} label="Today's goal" />
        <div>
          <div className="lbl">today's goal</div>
          <div className="val">
            <CountUp to={activity.minutesToday} />
            <small> / {activity.goalMinutes} min</small>
          </div>
          <div className="note">{left === 0 ? "Done for today. Nice." : `${left} minutes to go.`}</div>
        </div>
      </div>
      <div className="l-tbox" style={{ "--i": 1 } as CSSProperties}>
        <Tape seed="today-streak" />
        <span className="ic streak" aria-hidden="true">
          <Flame />
        </span>
        <div>
          <div className="lbl">streak</div>
          <div className="val">
            <CountUp to={activity.streakDays} />
            <small> {activity.streakDays === 1 ? "day" : "days"}</small>
          </div>
          <div className="note">{activity.streakDays ? "Days in a row with some study." : "One lesson starts it."}</div>
        </div>
      </div>
      <div className="l-tbox" style={{ "--i": 2 } as CSSProperties}>
        <span className="ic" aria-hidden="true">
          <BookOpen />
        </span>
        <div>
          <div className="lbl">lessons done</div>
          <div className="val">
            <CountUp to={lessonsDone} />
            <small> so far</small>
          </div>
          <div className="note">Across all your courses.</div>
        </div>
      </div>
    </div>
  );
}

/**
 * A course that needs the Learner: the card, the companion's honest line, and the one thing to do.
 */
function NeedsCard({ row }: { row: Row }) {
  const copy = needsCopy(row.item.status);
  const tiles: LinkTile[] = row.item.href
    ? [{ to: row.item.href, label: copy.action, description: copy.hint, icon: copy.retry ? <RefreshCw /> : <ArrowRight />, tone: copy.retry ? "primary" : "default" }]
    : [];
  return (
    <div className="k-ccard l-needs">
      <Tape seed={row.course.key} />
      <CourseCardBody course={row.course} sub={row.item.learningGoal} />
      <div className="say">
        <span className="av" aria-hidden="true">
          <Jongi size={24} tile="round" />
        </span>
        <span>
          <span className="sr-only">{COMPANION_NAME}: </span>
          {copy.say}
        </span>
      </div>
      {tiles.length ? <LinkTiles tiles={tiles} label={`${row.item.title}: what to do`} cols={1} /> : null}
    </div>
  );
}

/**
 * Card header without a link (for cards that hold their own actions).
 */
function CourseCardBody({ course, sub }: { course: CourseListItem; sub?: ReactNode }) {
  return (
    <div className="h">
      <span className={`cov ${course.status}`} aria-hidden="true">
        <CourseIcon name={course.icon} size={20} />
      </span>
      <div className="min-w-0">
        <p className="t">{course.title}</p>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      <span className={`k-rib badge ${course.status}`}>{course.badge}</span>
    </div>
  );
}

/**
 * A finished course: a recessed row on the shelf, linking back to it.
 */
function DoneRow({ row }: { row: Row }) {
  const progress = row.item.progress ?? { completed: 0, total: 0 };
  const inner = (
    <>
      <span className="l-cover done" aria-hidden="true">
        <CourseIcon name={row.course.icon} size={18} />
      </span>
      <span className="tx">
        <b>{row.course.title}</b>
        <small>
          Finished · {progress.completed} of {progress.total} lessons
        </small>
      </span>
      <span className="k-rib done">{row.course.badge}</span>
      {row.course.href ? (
        <span className="rv" aria-hidden="true">
          Revisit
        </span>
      ) : null}
    </>
  );
  if (!row.course.href) return <div className="l-done-row">{inner}</div>;
  return (
    <Link to={row.course.href} className="l-done-row">
      {inner}
    </Link>
  );
}

const SUGGESTIONS: [string, CourseIconName][] = [
  ["Norse mythology", "norse"],
  ["Reading sheet music", "music"],
  ["How sourdough works", "sourdough"],
  ["Basics of investing", "investing"],
];

/**
 * First run: the companion asks what to learn. The topic is the only free text in the app.
 */
function FirstRun() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [shown, setShown] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  // The field is inert until the greeting shows, so it takes focus then rather than on mount.
  useEffect(() => {
    if (shown) field.current?.focus();
  }, [shown]);

  /**
   * Opens New course with the topic filled in.
   * @param event - Form submit
   */
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = topic.trim();
    if (!value) return;
    navigate(`/new-course-request?topic=${encodeURIComponent(value)}`);
  }

  return (
    <div className="l-home">
      <ChatThread>
        <CompanionLine typing onShown={() => setShown(true)}>
          Hi, I'm {COMPANION_NAME}. What would you like to learn?
        </CompanionLine>
      </ChatThread>
      {/* Laid out from the start so the steps below don't jump; it appears once the greeting shows. */}
      <div className={cn("l-first", !shown && "waiting")} inert={!shown}>
        <div className="k-tcard">
          <form className="l-topic" onSubmit={submit}>
            <label htmlFor="first-topic" className="sr-only">
              What would you like to learn?
            </label>
            <input
              ref={field}
              id="first-topic"
              autoComplete="off"
              placeholder="A topic, a skill, anything you're curious about"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
            <Button type="submit" className="folded" disabled={!topic.trim()}>
              Continue
              <ArrowRight aria-hidden="true" />
            </Button>
          </form>
          <p className="l-sugg-h">or try one of these</p>
          <div className="l-sugg">
            {SUGGESTIONS.map(([label, icon], index) => (
              <button key={label} type="button" className="l-chip k-gift" style={{ "--i": index } as CSSProperties} onClick={() => setTopic(label)}>
                <CourseIcon name={icon} size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="l-how">
        {[
          ["01", "Tell me a topic", "Anything. One line is enough."],
          ["02", "Tap a few answers", "So I know where to start. No typing."],
          ["03", "I write your course", "Short lessons and quick checks, with sources."],
        ].map(([n, title, body], index) => (
          <div key={n} style={{ "--i": index } as CSSProperties}>
            <span className="n">{n}</span>
            <b>{title}</b>
            <span>{body}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Home: every Course and Course Request, grouped, with the course to continue first.
 * First run (nothing yet) asks what to learn.
 */
export function HomePage() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [study, setStudy] = useState<StudyPayload | null>(null);
  const [tilesShown, setTilesShown] = useState(false);
  const [showOlder, setShowOlder] = useState(false);

  useCompanionLines(items && items.length === 0 ? FIRST_RUN_LINES : HOME_LINES);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    apiFetch("/api/library")
      .then((response) => {
        if (!response.ok) throw new Error("Your courses didn't load. Check your connection and try again.");
        return response.json() as Promise<{ items: LibraryItem[] }>;
      })
      .then((body) => {
        if (!cancelled) setItems(body.items);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Your courses didn't load.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // A course removed (here or in the sidebar) drops out: reload the Library.
  useEffect(() => {
    const reload = () => setAttempt((n) => n + 1);
    window.addEventListener(LIBRARY_CHANGED_EVENT, reload);
    return () => window.removeEventListener(LIBRARY_CHANGED_EVENT, reload);
  }, []);

  const groups = useMemo(() => (items ? groupLibrary(items) : null), [items]);
  const resumeId = groups?.resume?.item.id ?? null;

  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    apiFetch(`/api/courses/${resumeId}`)
      .then((response) => (response.ok ? (response.json() as Promise<StudyPayload>) : null))
      .then((body) => {
        if (!cancelled) setStudy(body);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  if (error) {
    return (
      <ErrorState
        title="Home didn't load"
        actions={
          <Button onClick={() => setAttempt((n) => n + 1)}>
            <RefreshCw /> Try again
          </Button>
        }
      >
        {error}
      </ErrorState>
    );
  }
  if (!items || !groups) return <PageLoader label="Getting your courses…" />;
  if (items.length === 0) return <FirstRun />;

  const resume = groups.resume;
  const lessons = study ? study.modules.flatMap((module) => module.lessons) : [];
  const current = lessons.find((lesson) => lesson.id === study?.currentLessonId);
  const lessonsDone = items.reduce((sum, item) => sum + (item.kind === "course" ? (item.progress?.completed ?? 0) : 0), 0);

  let line: string;
  if (resume) line = current ? `${greeting()}. ${resume.item.title} is next: ${current.title}.` : `${greeting()}. ${resume.item.title} is where you left off.`;
  else if (groups.needs.length) line = `${greeting()}. ${groups.needs.length === 1 ? "One course needs" : `${groups.needs.length} courses need`} you before it can go on.`;
  else if (groups.making.length) line = `${greeting()}. I'm still making ${groups.making[0]!.item.title}. I'll have it ready soon.`;
  else line = `${greeting()}. Everything here is finished. What's next?`;

  // Continue lives on the hero sheet; these are the other ways on.
  const tiles: LinkTile[] = [];
  tiles.push({ to: "/new-course-request", label: "Start something new", description: `Tell ${COMPANION_NAME} a topic`, icon: <Plus /> });
  tiles.push({ to: "/teaching-profile", label: "How you like to learn", description: "Change how lessons feel", icon: <SlidersHorizontal />, tone: "quiet" });

  return (
    <div className="l-home">
      <ChatThread>
        <CompanionLine typing delayMs={420} onShown={() => setTilesShown(true)}>
          {line}
        </CompanionLine>
      </ChatThread>
      {resume ? (
        <>
          <p className="k-sec-h">continue</p>
          <RemovableCourse course={resume.course}>
            <ContinueHero row={resume} study={study} />
            <Tape seed={resume.course.key} />
          </RemovableCourse>
        </>
      ) : null}
      {/* Laid out from the start so nothing below moves; they pop in once the greeting shows. */}
      <div className={cn("l-tiles-slot", !tilesShown && "waiting")} inert={!tilesShown}>
        <LinkTiles tiles={tiles} label="What to do now" cols={2} />
      </div>

      <TodayStrip lessonsDone={lessonsDone} />

      {groups.learning.length || groups.making.length || groups.needs.length || groups.older.length ? (
        <div className="l-groups">
          {groups.learning.length ? (
            <Section id="home-learning" title="learning" count={groups.learning.length}>
              <div className="l-stack">
                {groups.learning.map((row) => (
                  <RemovableCourse key={row.course.key} course={row.course}>
                    <CourseCard
                      course={row.course}
                      metaLeft={`${row.item.progress?.completed ?? 0} of ${row.item.progress?.total ?? 0} lessons`}
                    />
                  </RemovableCourse>
                ))}
              </div>
            </Section>
          ) : null}

          {groups.making.length ? (
            <Section id="home-making" title="being made" count={groups.making.length}>
              <div className="l-stack">
                {groups.making.map((row) => (
                  <RemovableCourse key={row.course.key} course={row.course}>
                  <CourseCard
                    className="l-making"
                    course={row.course}
                    sub={
                      <span className="flex items-center gap-2">
                        <Loader size={18} />
                        {MAKING_LINE[row.item.status] ?? "Working on it"}
                      </span>
                    }
                    metaLeft="you can leave; it keeps going"
                  />
                  </RemovableCourse>
                ))}
              </div>
            </Section>
          ) : null}

          {groups.needs.length || groups.older.length ? (
            <Section id="home-needs" title="needs you" count={groups.needs.length}>
              <div className="l-stack">
                {groups.needs.map((row) => (
                  <RemovableCourse key={row.course.key} course={row.course}>
                    <NeedsCard row={row} />
                  </RemovableCourse>
                ))}
              </div>
              {groups.older.length ? (
                <>
                  <div className="l-older">
                    <span className="grow">
                      {groups.older.length} older {groups.older.length === 1 ? "attempt" : "attempts"}, stopped or started again
                    </span>
                    <button type="button" aria-expanded={showOlder} aria-controls="home-older" onClick={() => setShowOlder((open) => !open)}>
                      {showOlder ? "hide them" : "show them"}
                    </button>
                  </div>
                  {showOlder ? (
                    <div id="home-older" className="l-stack mt-2">
                      {groups.older.map((row) => (
                        <RemovableCourse key={row.course.key} course={row.course}>
                          <CourseCard course={row.course} sub={row.item.learningGoal} />
                        </RemovableCourse>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </Section>
          ) : null}
        </div>
      ) : null}

      {groups.done.length ? (
        <Section id="home-done" title="finished" count={groups.done.length}>
          <div className="l-rows">
            {groups.done.map((row) => (
              <RemovableCourse key={row.course.key} course={row.course} className="row">
                <DoneRow row={row} />
              </RemovableCourse>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
