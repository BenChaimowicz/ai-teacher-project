import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
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
import { ProgressRing, SegmentedProgress, type SegmentState } from "@/components/ui/progress.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import { COMPANION_NAME, type CourseIconName } from "@/lib/brand-marks.ts";
import { toCourseListItem, type CourseListItem, type LibraryItem } from "@/lib/course-list.ts";
import type { StudyPayload } from "@/lib/study-types.ts";
import "@/components/learn/learn.css";

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
  const resume = learning.find((row) => (row.item.progress?.completed ?? 0) > 0) ?? learning[0] ?? null;
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
 * The course to continue: icon, next Lesson, a ring for how much is done, and one segment per Lesson.
 */
function ContinueHero({ row, study }: { row: Row; study: StudyPayload | null }) {
  const progress = row.item.progress ?? { completed: 0, total: 0 };
  const lessons = study ? study.modules.flatMap((module) => module.lessons) : [];
  const current = lessons.find((lesson) => lesson.id === study?.currentLessonId) ?? null;
  const segments: SegmentState[] = lessons.length
    ? lessons.map((lesson) => (lesson.completed ? "done" : lesson.id === current?.id ? "now" : "todo"))
    : Array.from({ length: progress.total }, (_, index) => (index < progress.completed ? "done" : "todo"));
  const quizzes = lessons.filter((lesson) => lesson.teachingMethod === QUIZ_METHOD_ID);
  const value = progress.total ? progress.completed / progress.total : 0;
  return (
    <div className="l-hero">
      <div className="l-hero-in">
        <span className="l-cover" aria-hidden="true">
          <CourseIcon name={row.course.icon} size={34} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="l-kicker">continue</span>
          <h2>{row.item.title}</h2>
          {current ? (
            <p className="nx">
              Next: <b>{current.title}</b> · {current.teachingMethod === QUIZ_METHOD_ID ? "quiz" : "reading"}
            </p>
          ) : null}
        </div>
        <ProgressRing value={value} size={84} stroke={7} label={`${progress.completed} of ${progress.total} lessons done`}>
          <CountUp to={Math.round(value * 100)} format={(n) => `${n}%`} />
        </ProgressRing>
      </div>
      <SegmentedProgress segments={segments} label={`${progress.completed} of ${progress.total} lessons done`} />
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
        <span className="ic" aria-hidden="true">
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
      <span className={`badge ${course.status}`}>{course.badge}</span>
    </div>
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
      {shown ? (
        <div className="k-tcard">
          <form className="l-topic" onSubmit={submit}>
            <label htmlFor="first-topic" className="sr-only">
              What would you like to learn?
            </label>
            <input
              id="first-topic"
              autoComplete="off"
              autoFocus
              placeholder="A topic, a skill, anything you're curious about"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
            />
            <Button type="submit" disabled={!topic.trim()}>
              Continue
            </Button>
          </form>
          <p className="l-sugg-h">or try one of these</p>
          <div className="l-sugg">
            {SUGGESTIONS.map(([label, icon], index) => (
              <button key={label} type="button" className="l-chip" style={{ "--i": index } as CSSProperties} onClick={() => setTopic(label)}>
                <CourseIcon name={icon} size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
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
    fetch("/api/library")
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

  const groups = useMemo(() => (items ? groupLibrary(items) : null), [items]);
  const resumeId = groups?.resume?.item.id ?? null;

  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    fetch(`/api/courses/${resumeId}`)
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

  const tiles: LinkTile[] = [];
  if (resume?.item.href) {
    tiles.push({
      to: resume.item.href,
      label: "Continue",
      description: current ? `${current.title} · ${current.teachingMethod === QUIZ_METHOD_ID ? "quiz" : "reading"}` : resume.item.title,
      icon: <Play />,
      tone: "primary",
    });
  }
  tiles.push({ to: "/new-course-request", label: "Start something new", description: `Tell ${COMPANION_NAME} a topic`, icon: <Plus /> });
  tiles.push({ to: "/teaching-profile", label: "How you like to learn", description: "Change how lessons feel", icon: <SlidersHorizontal />, tone: "quiet" });

  return (
    <div className="l-home">
      <ChatThread>
        <CompanionLine typing delayMs={420} onShown={() => setTilesShown(true)}>
          {line}
        </CompanionLine>
      </ChatThread>
      {resume ? <ContinueHero row={resume} study={study} /> : null}
      {tilesShown ? <LinkTiles tiles={tiles} label="What to do now" cols={3} /> : null}

      <TodayStrip lessonsDone={lessonsDone} />

      {groups.learning.length ? (
        <Section id="home-learning" title="learning" count={groups.learning.length}>
          <div className="l-grid2">
            {groups.learning.map((row) => (
              <CourseCard
                key={row.course.key}
                course={row.course}
                metaLeft={`${row.item.progress?.completed ?? 0} of ${row.item.progress?.total ?? 0} lessons`}
              />
            ))}
          </div>
        </Section>
      ) : null}

      {groups.making.length ? (
        <Section id="home-making" title="being made" count={groups.making.length}>
          <div className="l-stack">
            {groups.making.map((row) => (
              <CourseCard
                key={row.course.key}
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
            ))}
          </div>
        </Section>
      ) : null}

      {groups.needs.length || groups.older.length ? (
        <Section id="home-needs" title="needs you" count={groups.needs.length}>
          <div className="l-stack">
            {groups.needs.map((row) => (
              <NeedsCard key={row.course.key} row={row} />
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
                    <CourseCard key={row.course.key} course={row.course} sub={row.item.learningGoal} />
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </Section>
      ) : null}

      {groups.done.length ? (
        <Section id="home-done" title="finished" count={groups.done.length}>
          <div className="l-grid2">
            {groups.done.map((row) => (
              <div key={row.course.key}>
                <CourseCard
                  course={row.course}
                  sub={`Finished · ${row.item.progress?.total ?? 0} lessons`}
                  metaLeft={`${row.item.progress?.completed ?? 0} of ${row.item.progress?.total ?? 0} lessons`}
                />
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}
