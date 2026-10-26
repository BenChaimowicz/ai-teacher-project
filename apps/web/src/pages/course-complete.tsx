import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Navigate, useParams } from "react-router-dom";
import { isPassingScore } from "@senoy/db/quiz";
import { QUIZ_METHOD_ID } from "@senoy/db/reading-lesson";
import { Check, Compass, Eye, Home, Layers } from "lucide-react";
import { useCompanion, useCompanionLines } from "@/components/companion/companion-provider.tsx";
import { CountUp } from "@/components/learn/count-up.tsx";
import { LinkTiles, type LinkTile } from "@/components/learn/link-tiles.tsx";
import { ShellTitle } from "@/components/shell/app-shell.tsx";
import { ChatThread, CompanionLine } from "@/components/ui/chat-thread.tsx";
import { PageLoader } from "@/components/ui/loader.tsx";
import { Jongi } from "@/components/companion/jongi.tsx";
import { ErrorState } from "@/components/ui/states.tsx";
import { cheer, confettiAt } from "@/lib/cheer.ts";
import type { CourseSummary } from "@/lib/study-types.ts";
import "@/components/learn/learn.css";

const LINES = ["You finished a whole course.", "That's real progress.", "Going deeper is a good next step."];

/**
 * Stat tiles: real numbers that count up. No points or levels.
 * @param summary - Course summary
 */
function stats(summary: CourseSummary) {
  const lessons = summary.modules.flatMap((module) => module.lessons);
  const readings = lessons.filter((lesson) => lesson.teachingMethod !== QUIZ_METHOD_ID).length;
  const taken = summary.quizzes.filter((quiz) => quiz.best);
  const correct = taken.reduce((sum, quiz) => sum + (quiz.best?.correct ?? 0), 0);
  const total = taken.reduce((sum, quiz) => sum + (quiz.best?.total ?? 0), 0);
  const passed = summary.quizzes.filter((quiz) => quiz.best && isPassingScore(quiz.best)).length;
  const rows: { to: number; label: string; format?: (n: number) => string; win?: boolean }[] = [
    { to: lessons.length, label: "lessons" },
    { to: readings, label: readings === 1 ? "reading" : "readings" },
  ];
  if (summary.quizzes.length) {
    rows.push({ to: passed, label: "quizzes passed", format: (n) => `${n}/${summary.quizzes.length}` });
    rows.push({ to: total ? Math.round((correct / total) * 100) : 0, label: "best quiz scores", format: (n) => `${n}%`, win: true });
  } else {
    rows.push({ to: summary.modules.length, label: summary.modules.length === 1 ? "module" : "modules" });
  }
  return rows;
}

/**
 * " · 26 Oct" for the finished ribbon, or nothing when the date doesn't parse.
 * @param iso - Course completion time
 */
function finishedOn(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : ` · ${date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
}

/**
 * Course complete: Jongi celebrates, the real stats count up, what was covered with Quiz results, and next steps.
 * A Course that is not complete yet sends the Learner back to Study.
 */
export function CourseCompletePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [summary, setSummary] = useState<CourseSummary | null>(null);
  const [notComplete, setNotComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextShown, setNextShown] = useState(false);
  const hero = useRef<HTMLDivElement>(null);
  const { say } = useCompanion();
  useCompanionLines(LINES);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    setSummary(null);
    setNotComplete(false);
    setError(null);
    fetch(`/api/courses/${courseId}/summary`)
      .then(async (response) => {
        if (response.status === 409) {
          if (!cancelled) setNotComplete(true);
          return;
        }
        if (response.status === 404) throw new Error("Published Course not found.");
        if (!response.ok) throw new Error("Could not load the Course summary");
        const body = (await response.json()) as CourseSummary;
        if (!cancelled) setSummary(body);
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load the Course summary");
      });
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  useEffect(() => {
    if (!summary) return;
    const timer = window.setTimeout(() => {
      if (!hero.current) return;
      confettiAt(hero.current, { count: 110, spread: 1.6, power: 1.2 });
      cheer(hero.current, "course done");
      say("You finished a whole course.", "cheer");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [summary, say]);

  if (notComplete && courseId) return <Navigate to={`/study/${courseId}`} replace />;
  if (error) return <ErrorState title="The summary didn't load">{error}</ErrorState>;
  if (!summary) return <PageLoader />;

  const lessons = summary.modules.flatMap((module) => module.lessons);
  const quizByLesson = new Map(summary.quizzes.map((quiz) => [quiz.lessonId, quiz]));
  const title = summary.course.title;
  const next: LinkTile[] = [
    {
      to: `/new-course-request?topic=${encodeURIComponent(title)}`,
      label: `Go deeper: ${title}`,
      description: "A new course that picks up where this one ends",
      icon: <Layers />,
      tone: "primary",
    },
    { to: "/new-course-request", label: "Something new", description: "Tell me another topic", icon: <Compass /> },
    { to: `/study/${summary.course.id}`, label: "Review Lessons", description: `Any of the ${lessons.length}, quizzes included`, icon: <Eye /> },
    { to: "/", label: "Back to Home", description: "Your other courses", icon: <Home />, tone: "quiet" },
  ];

  return (
    <div className="l-done">
      <ShellTitle>Course complete</ShellTitle>
      <div className="l-done-hero">
        <div className="big" ref={hero} aria-hidden="true">
          <Jongi size={260} mood="cheer" framing="scene" />
        </div>
        <div className="min-w-0">
          <span className="k-rib l-rib-win">
            Finished · {lessons.length} of {lessons.length} lessons{finishedOn(summary.course.completedAt)}
          </span>
          <h1>
            You finished <span className="t">{title}</span>
          </h1>
          <p className="sub">You worked toward: {summary.course.learningGoal}</p>
          <div className="l-stats">
            {stats(summary).map((stat, index) => (
              <div key={stat.label} className={stat.win ? "l-stat hl" : "l-stat"} style={{ "--i": index } as CSSProperties}>
                <b>
                  <CountUp to={stat.to} format={stat.format} delayMs={300} durationMs={1100} />
                </b>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="l-covered" aria-labelledby="covered-h">
        <h2 id="covered-h" className="k-sec-h">
          what you covered
        </h2>
        {summary.modules.map((module) => (
          <div key={module.id}>
            {summary.modules.length > 1 ? <p className="l-mod">{module.title}</p> : null}
            <ul>
              {module.lessons.map((lesson) => {
                const quiz = quizByLesson.get(lesson.id);
                const passed = quiz?.best ? isPassingScore(quiz.best) : false;
                return (
                  <li key={lesson.id}>
                    <i aria-hidden="true">
                      <Check />
                    </i>
                    <span className="min-w-0">
                      {lesson.title}
                      <span className="g">{lesson.lessonGoal}</span>
                    </span>
                    {quiz ? (
                      <span className={passed ? "r pass" : "r"}>
                        {quiz.best ? `Best score ${quiz.best.correct} / ${quiz.best.total}${passed ? " · Passed" : ""}` : "Not taken"}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>

      <ChatThread label="What's next">
        <CompanionLine typing delayMs={900} mood="cheer">
          That's the whole course. Well done.
        </CompanionLine>
        <CompanionLine typing continued delayMs={1300} onShown={() => setNextShown(true)}>
          Want to keep going?
        </CompanionLine>
      </ChatThread>
      {nextShown ? <LinkTiles tiles={next} label="Next steps" /> : null}
    </div>
  );
}
